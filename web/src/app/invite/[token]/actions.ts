"use server";

import { acceptInvite } from "@/lib/services/invites";

export async function acceptInviteAction(formData: FormData) {
  await acceptInvite({
    token: String(formData.get("token") ?? ""),
    name: String(formData.get("name") ?? ""),
    password: String(formData.get("password") ?? ""),
  });
}
