import { count } from "drizzle-orm";
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

/**
 * Create the first organization, community, and admin user when the DB has no users.
 * Intended for empty Netlify Database / fresh environments. Refuses if any user exists.
 */
export async function bootstrapFirstAdmin(raw: BootstrapInput) {
  const input = bootstrapInputSchema.parse(raw);

  if (!(await needsBootstrap())) {
    throw new Error("Bootstrap is only available when no users exist.");
  }

  const slugBase = input.communityName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48) || "community";

  const [org] = await db
    .insert(organizations)
    .values({
      name: `${input.communityName} Association`,
      slug: `${slugBase}-hoa`,
    })
    .returning();

  const [community] = await db
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
  const [user] = await db
    .insert(users)
    .values({
      email: input.email.toLowerCase(),
      name: input.name,
      passwordHash,
      isPlatformAdmin: true,
    })
    .returning();

  await db.insert(memberships).values({
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
}
