"use server";

import { revalidatePath } from "next/cache";
import { requireTenantContext } from "@/lib/auth/config";
import {
  verifyDocumentFacts,
  verifyFactsBatch,
} from "@/lib/services/visual-verification";

export async function runVisualVerificationBatchAction() {
  const ctx = await requireTenantContext();
  await verifyFactsBatch(ctx, 15);
  revalidatePath("/app/sources/verification");
  revalidatePath("/app/facts");
}

export async function runVisualVerificationForDocumentAction(formData: FormData) {
  const ctx = await requireTenantContext();
  const documentId = String(formData.get("documentId") ?? "");
  if (!documentId) throw new Error("documentId is required");
  await verifyDocumentFacts(ctx, documentId);
  revalidatePath("/app/sources/verification");
  revalidatePath(`/app/documents/${documentId}`);
  revalidatePath("/app/facts");
}
