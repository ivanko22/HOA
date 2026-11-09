"use server";

import { revalidatePath } from "next/cache";
import { requireTenantContext } from "@/lib/auth/config";
import {
  correctExtractedFact,
  rejectExtractedFact,
  verifyFact,
} from "@/lib/services/documents";

function refresh() {
  revalidatePath("/app/facts");
  revalidatePath("/app");
  revalidatePath("/app/documents");
}

export async function approveFactAction(formData: FormData) {
  const ctx = await requireTenantContext();
  const factId = String(formData.get("factId") ?? "");
  if (!factId) throw new Error("Fact is required");
  await verifyFact(ctx, factId, "verified");
  refresh();
}

export async function rejectFactAction(formData: FormData) {
  const ctx = await requireTenantContext();
  const factId = String(formData.get("factId") ?? "");
  if (!factId) throw new Error("Fact is required");
  await rejectExtractedFact(ctx, factId);
  refresh();
}

export async function correctFactAction(formData: FormData) {
  const ctx = await requireTenantContext();
  const factId = String(formData.get("factId") ?? "");
  const amount = String(formData.get("amount") ?? "");
  if (!factId) throw new Error("Fact is required");
  await correctExtractedFact(ctx, factId, amount);
  refresh();
}
