"use server";

import { redirect } from "next/navigation";
import {
  bootstrapFirstAdmin,
  needsBootstrap,
} from "@/lib/services/bootstrap";

export async function bootstrapAction(formData: FormData) {
  if (!(await needsBootstrap())) {
    throw new Error("Bootstrap is only available when no users exist.");
  }

  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const name = String(formData.get("name") ?? "Admin");
  const communityName = String(formData.get("communityName") ?? "The Willows");

  await bootstrapFirstAdmin({ email, password, name, communityName });
  redirect("/login?created=1");
}
