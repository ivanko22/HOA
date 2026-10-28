"use server";

import { revalidatePath } from "next/cache";
import { requireTenantContext } from "@/lib/auth/config";
import { createInvite, revokeInvite } from "@/lib/services/invites";

const invitableRoles = [
  "community_admin",
  "treasurer",
  "board_member",
  "property_manager",
  "owner",
  "auditor",
] as const;

export async function createInviteAction(formData: FormData) {
  const ctx = await requireTenantContext();
  const roleRaw = String(formData.get("role") ?? "owner");
  const role = invitableRoles.find((r) => r === roleRaw);
  if (!role) {
    throw new Error("Invalid role");
  }

  const result = await createInvite(ctx, {
    email: String(formData.get("email") ?? ""),
    name: String(formData.get("name") || "") || undefined,
    role,
    expiresInDays: 7,
  });

  revalidatePath("/app/members");
  return result;
}

export async function revokeInviteAction(formData: FormData) {
  const ctx = await requireTenantContext();
  await revokeInvite(ctx, String(formData.get("inviteId") ?? ""));
  revalidatePath("/app/members");
}
