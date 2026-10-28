"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireTenantContext } from "@/lib/auth/config";
import {
  documentCategories,
  verificationStatuses,
} from "@/lib/domain/enums";
import { createFactInputSchema } from "@/lib/domain/facts";
import {
  addManualFact,
  uploadDocument,
  verifyFact,
} from "@/lib/services/documents";

const uploadSchema = z.object({
  title: z.string().min(1).max(300),
  category: z.enum(documentCategories),
  documentDate: z.string().optional(),
  periodStart: z.string().optional(),
  periodEnd: z.string().optional(),
  description: z.string().optional(),
});

export async function uploadDocumentAction(formData: FormData) {
  const ctx = await requireTenantContext();
  const parsed = uploadSchema.parse({
    title: formData.get("title"),
    category: formData.get("category"),
    documentDate: formData.get("documentDate") || undefined,
    periodStart: formData.get("periodStart") || undefined,
    periodEnd: formData.get("periodEnd") || undefined,
    description: formData.get("description") || undefined,
  });

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    throw new Error("File is required");
  }
  const bytes = Buffer.from(await file.arrayBuffer());

  const doc = await uploadDocument(ctx, {
    ...parsed,
    documentDate: parsed.documentDate || null,
    periodStart: parsed.periodStart || null,
    periodEnd: parsed.periodEnd || null,
    description: parsed.description || null,
    file: { name: file.name, type: file.type, bytes },
  });

  revalidatePath("/app/documents");
  revalidatePath("/app/data-health");
  redirect(`/app/documents/${doc.id}`);
}

export async function addFactAction(formData: FormData) {
  const ctx = await requireTenantContext();
  const raw = {
    documentId: String(formData.get("documentId") ?? ""),
    factType: String(formData.get("factType") ?? ""),
    label: String(formData.get("label") ?? ""),
    value: String(formData.get("value") || "") || null,
    numericValue: String(formData.get("numericValue") || "") || null,
    unit: String(formData.get("unit") || "") || null,
    periodStart: String(formData.get("periodStart") || "") || null,
    periodEnd: String(formData.get("periodEnd") || "") || null,
    asOfDate: String(formData.get("asOfDate") || "") || null,
    sourcePage: String(formData.get("sourcePage") || "") || null,
    sourceReference: String(formData.get("sourceReference") || "") || null,
    sourceExcerpt: String(formData.get("sourceExcerpt") || "") || null,
    verificationStatus: String(formData.get("verificationStatus") || "reported"),
    notes: String(formData.get("notes") || "") || null,
  };

  const input = createFactInputSchema.parse(raw);
  const fact = await addManualFact(ctx, input);

  revalidatePath(`/app/documents/${fact.documentId}`);
  revalidatePath("/app/documents");
  revalidatePath("/app/data-health");
}

export async function verifyFactAction(formData: FormData) {
  const ctx = await requireTenantContext();
  const factId = String(formData.get("factId") ?? "");
  const documentId = String(formData.get("documentId") ?? "");
  const status = z
    .enum(["verified", "reported", "needs_review"] as const)
    .parse(String(formData.get("status") ?? "verified"));

  // Ensure status is one of allowed verification statuses for typecheck
  void verificationStatuses;

  await verifyFact(ctx, factId, status);
  revalidatePath(`/app/documents/${documentId}`);
  revalidatePath("/app/documents");
}
