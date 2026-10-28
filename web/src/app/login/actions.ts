"use server";

import { redirect } from "next/navigation";
import {
  bootstrapFirstAdmin,
  needsBootstrap,
} from "@/lib/services/bootstrap";

export async function bootstrapAction(formData: FormData) {
  if (!(await needsBootstrap())) {
    throw new Error(
      "Registration is closed. Ask an admin for an invite link.",
    );
  }

  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const name = String(formData.get("name") ?? "Admin");
  const communityName = String(formData.get("communityName") ?? "The Willows");
  const bootstrapSecret = String(formData.get("bootstrapSecret") || "") || undefined;

  await bootstrapFirstAdmin({
    email,
    password,
    name,
    communityName,
    bootstrapSecret,
  });
  redirect("/login?created=1");
}
