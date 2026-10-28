import { createHash, randomBytes } from "node:crypto";
import { and, desc, eq, isNull } from "drizzle-orm";
import { hash } from "bcryptjs";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { memberships, userInvites, users } from "@/lib/db/schema";
import type { RoleCode } from "@/lib/domain/enums";
import {
  assertCan,
  type TenantContext,
} from "@/lib/domain/permissions";
import { appBaseUrl, sendEmail } from "@/lib/mail";
import { recordAudit } from "./audit";

const invitableRoles = [
  "community_admin",
  "board_member",
  "treasurer",
  "property_manager",
  "owner",
  "auditor",
] as const satisfies readonly RoleCode[];

export const createInviteInputSchema = z.object({
  email: z.string().email().max(320),
  name: z.string().min(1).max(200).optional(),
  role: z.enum(invitableRoles),
  expiresInDays: z.number().int().min(1).max(30).optional().default(7),
});

export type CreateInviteInput = z.infer<typeof createInviteInputSchema>;

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function newToken() {
  return randomBytes(32).toString("base64url");
}

export async function listInvites(ctx: TenantContext) {
  assertCan(ctx.capabilities, "community.members.manage");
  return db
    .select()
    .from(userInvites)
    .where(
      and(
        eq(userInvites.organizationId, ctx.organizationId),
        eq(userInvites.communityId, ctx.communityId),
      ),
    )
    .orderBy(desc(userInvites.createdAt));
}

export async function createInvite(
  ctx: TenantContext,
  raw: CreateInviteInput,
) {
  assertCan(ctx.capabilities, "community.members.manage");
  const input = createInviteInputSchema.parse(raw);
  const email = input.email.toLowerCase();

  const [existingUser] = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  if (existingUser) {
    const [existingMembership] = await db
      .select()
      .from(memberships)
      .where(
        and(
          eq(memberships.userId, existingUser.id),
          eq(memberships.communityId, ctx.communityId),
        ),
      )
      .limit(1);
    if (existingMembership) {
      throw new Error("That email already has access to this community.");
    }
  }

  // Revoke prior open invites for the same email in this community.
  await db
    .update(userInvites)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(userInvites.communityId, ctx.communityId),
        eq(userInvites.email, email),
        isNull(userInvites.acceptedAt),
        isNull(userInvites.revokedAt),
      ),
    );

  const token = newToken();
  const expiresAt = new Date(
    Date.now() + input.expiresInDays * 24 * 60 * 60 * 1000,
  );

  const [invite] = await db
    .insert(userInvites)
    .values({
      organizationId: ctx.organizationId,
      communityId: ctx.communityId,
      email,
      name: input.name ?? null,
      role: input.role,
      tokenHash: hashToken(token),
      invitedBy: ctx.userId,
      expiresAt,
    })
    .returning();

  const inviteUrl = `${appBaseUrl()}/invite/${token}`;
  const mail = await sendEmail({
    to: email,
    subject: "You're invited to Community OS",
    text: [
      `You've been invited to join as ${input.role.replaceAll("_", " ")}.`,
      ``,
      `Confirm your email and set a password:`,
      inviteUrl,
      ``,
      `This link expires on ${expiresAt.toISOString()}.`,
      `If you did not expect this invite, ignore this message.`,
    ].join("\n"),
  });

  await recordAudit({
    ctx,
    action: "members.invite",
    entityType: "user_invite",
    entityId: invite.id,
    after: { email, role: input.role, emailed: mail.sent },
  });

  return {
    invite,
    inviteUrl,
    emailSent: mail.sent,
    emailReason: mail.sent ? null : mail.reason,
  };
}

export async function revokeInvite(ctx: TenantContext, inviteId: string) {
  assertCan(ctx.capabilities, "community.members.manage");
  const [invite] = await db
    .select()
    .from(userInvites)
    .where(
      and(
        eq(userInvites.id, inviteId),
        eq(userInvites.communityId, ctx.communityId),
      ),
    )
    .limit(1);
  if (!invite) throw new Error("Invite not found");
  await db
    .update(userInvites)
    .set({ revokedAt: new Date() })
    .where(eq(userInvites.id, invite.id));
}

export async function getInviteByToken(token: string) {
  const tokenHash = hashToken(token);
  const [invite] = await db
    .select()
    .from(userInvites)
    .where(eq(userInvites.tokenHash, tokenHash))
    .limit(1);
  if (!invite) return null;
  if (invite.revokedAt) return { invite, status: "revoked" as const };
  if (invite.acceptedAt) return { invite, status: "accepted" as const };
  if (invite.expiresAt.getTime() < Date.now()) {
    return { invite, status: "expired" as const };
  }
  return { invite, status: "pending" as const };
}

export const acceptInviteInputSchema = z.object({
  token: z.string().min(20),
  name: z.string().min(1).max(200),
  password: z.string().min(8).max(200),
});

export async function acceptInvite(raw: z.infer<typeof acceptInviteInputSchema>) {
  const input = acceptInviteInputSchema.parse(raw);
  const resolved = await getInviteByToken(input.token);
  if (!resolved || resolved.status !== "pending") {
    throw new Error("This invite is invalid, expired, or already used.");
  }
  const invite = resolved.invite;
  const email = invite.email.toLowerCase();
  const passwordHash = await hash(input.password, 10);
  const now = new Date();

  let [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (user) {
    await db
      .update(users)
      .set({
        name: input.name,
        passwordHash,
        emailVerifiedAt: now,
        updatedAt: now,
      })
      .where(eq(users.id, user.id));
  } else {
    [user] = await db
      .insert(users)
      .values({
        email,
        name: input.name,
        passwordHash,
        emailVerifiedAt: now,
        isPlatformAdmin: false,
      })
      .returning();
  }

  const [existingMembership] = await db
    .select()
    .from(memberships)
    .where(
      and(
        eq(memberships.userId, user.id),
        eq(memberships.communityId, invite.communityId),
        eq(memberships.role, invite.role),
      ),
    )
    .limit(1);

  if (!existingMembership) {
    await db.insert(memberships).values({
      organizationId: invite.organizationId,
      communityId: invite.communityId,
      userId: user.id,
      role: invite.role,
    });
  }

  await db
    .update(userInvites)
    .set({ acceptedAt: now })
    .where(eq(userInvites.id, invite.id));

  return { userId: user.id, email: user.email };
}
