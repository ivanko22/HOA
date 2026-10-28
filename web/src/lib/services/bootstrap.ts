import { count, sql } from "drizzle-orm";
import { hash } from "bcryptjs";
import { z } from "zod";
import { db } from "@/lib/db/client";
import {
  communities,
  memberships,
  organizations,
  users,
} from "@/lib/db/schema";

export const bootstrapInputSchema = z.object({
  email: z.string().email().max(320),
  password: z.string().min(8).max(200),
  name: z.string().min(1).max(200),
  communityName: z.string().min(1).max(200).default("The Willows"),
  /** Required when BOOTSTRAP_SECRET is set in the environment. */
  bootstrapSecret: z.string().max(200).optional(),
});

export type BootstrapInput = z.infer<typeof bootstrapInputSchema>;

export async function needsBootstrap(): Promise<boolean> {
  try {
    const [row] = await db.select({ value: count() }).from(users);
    return Number(row?.value ?? 0) === 0;
  } catch {
    // Tables missing (migrations not applied yet) — treat as not ready for UI bootstrap.
    return false;
  }
}

export function bootstrapSecretConfigured(): boolean {
  return Boolean(process.env.BOOTSTRAP_SECRET?.trim());
}

function assertBootstrapSecret(provided: string | undefined) {
  const expected = process.env.BOOTSTRAP_SECRET?.trim();
  if (!expected) return;
  if (!provided || provided !== expected) {
    throw new Error("Invalid bootstrap secret.");
  }
}

/**
 * Create the first organization, community, and admin user when the DB has no users.
 * There is no public registration after this — further users must be invited.
 */
export async function bootstrapFirstAdmin(raw: BootstrapInput) {
  const input = bootstrapInputSchema.parse(raw);
  assertBootstrapSecret(input.bootstrapSecret);

  return db.transaction(async (tx) => {
    // Serialize first-admin creation so two concurrent submits cannot both succeed.
    await tx.execute(sql`select pg_advisory_xact_lock(872341)`);

    const [row] = await tx.select({ value: count() }).from(users);
    if (Number(row?.value ?? 0) > 0) {
      throw new Error(
        "Registration is closed. Ask an admin for an invite link.",
      );
    }

    const slugBase =
      input.communityName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 48) || "community";

    const [org] = await tx
      .insert(organizations)
      .values({
        name: `${input.communityName} Association`,
        slug: `${slugBase}-hoa`,
      })
      .returning();

    const [community] = await tx
      .insert(communities)
      .values({
        organizationId: org.id,
        name: input.communityName,
        slug: slugBase,
        timezone: "America/Chicago",
        city: null,
        region: null,
        country: "US",
      })
      .returning();

    const passwordHash = await hash(input.password, 10);
    const now = new Date();
    const [user] = await tx
      .insert(users)
      .values({
        email: input.email.toLowerCase(),
        name: input.name,
        passwordHash,
        isPlatformAdmin: true,
        emailVerifiedAt: now,
      })
      .returning();

    await tx.insert(memberships).values({
      organizationId: org.id,
      communityId: community.id,
      userId: user.id,
      role: "community_admin",
    });

    return {
      userId: user.id,
      email: user.email,
      communityId: community.id,
      organizationId: org.id,
    };
  });
}
