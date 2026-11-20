import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { compare } from "bcryptjs";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { users, memberships, communities } from "@/lib/db/schema";
import {
  capabilitiesForRoles,
  type Capability,
  type TenantContext,
} from "@/lib/domain/permissions";
import type { RoleCode } from "@/lib/domain/enums";

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
  },
  providers: [
    Credentials({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(raw) {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;
        const { email, password } = parsed.data;
        const [user] = await db
          .select()
          .from(users)
          .where(eq(users.email, email.toLowerCase()))
          .limit(1);
        if (!user?.passwordHash) return null;
        const ok = await compare(password, user.passwordHash);
        if (!ok) return null;
        return {
          id: user.id,
          email: user.email,
          name: user.name,
          isPlatformAdmin: user.isPlatformAdmin,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.sub = user.id;
        token.isPlatformAdmin = Boolean(
          (user as { isPlatformAdmin?: boolean }).isPlatformAdmin,
        );
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub ?? "";
        session.user.isPlatformAdmin = Boolean(token.isPlatformAdmin);
      }
      return session;
    },
  },
});

export async function resolveTenantContext(
  userId: string,
  communitySlug?: string,
): Promise<TenantContext | null> {
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!user) return null;

  const rows = await db
    .select()
    .from(memberships)
    .where(eq(memberships.userId, userId))
    .orderBy(asc(memberships.createdAt), asc(memberships.id));

  const defaultCommunityId = rows[0]?.communityId;
  if (!communitySlug && !defaultCommunityId) return null;
  const [community] = await db
    .select()
    .from(communities)
    .where(communitySlug
      ? eq(communities.slug, communitySlug)
      : eq(communities.id, defaultCommunityId!))
    .limit(1);
  if (!community) return null;

  const communityMemberships = rows.filter(
    (m) => m.communityId === community.id,
  );

  const roles = new Set<RoleCode>();
  const unitIds: string[] = [];

  if (user.isPlatformAdmin) {
    roles.add("platform_admin");
  }
  for (const m of communityMemberships) {
    roles.add(m.role);
    if (m.unitId) unitIds.push(m.unitId);
  }

  if (roles.size === 0 && !user.isPlatformAdmin) {
    return null;
  }

  const roleList = [...roles];
  const caps = capabilitiesForRoles(roleList);

  return {
    userId: user.id,
    email: user.email,
    name: user.name,
    organizationId: community.organizationId,
    communityId: community.id,
    roles: roleList,
    capabilities: caps,
    isPlatformAdmin: user.isPlatformAdmin,
    unitIds,
  };
}

export async function requireTenantContext(
  communitySlug?: string,
): Promise<TenantContext> {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("Unauthenticated");
  }
  const ctx = await resolveTenantContext(session.user.id, communitySlug);
  if (!ctx) {
    throw new Error("No community membership");
  }
  return ctx;
}

export function serializeCapabilities(caps: Set<Capability>): Capability[] {
  return [...caps];
}
