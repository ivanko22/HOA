"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireTenantContext } from "@/lib/auth/config";
import {
  importClassifications,
  importSourceTypes,
  type ImportClassification,
} from "@/lib/domain/import-csv";
import { canonicalImportFields } from "@/lib/domain/import-csv";
import {
  approveImportRows,
  bulkUpdateImportRows,
  saveImportMapping,
  uploadImportCsv,
} from "@/lib/services/imports";

const sourceTypeSchema = z.enum(importSourceTypes);

export async function uploadImportAction(formData: FormData) {
  const ctx = await requireTenantContext();
  const sourceType = sourceTypeSchema.parse(
    String(formData.get("sourceType") ?? "generic_csv"),
  );
  const profileId = String(formData.get("profileId") || "") || null;
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    throw new Error("CSV file is required");
  }
  const bytes = Buffer.from(await file.arrayBuffer());
  const result = await uploadImportCsv(ctx, {
    sourceType,
    profileId,
    file: { name: file.name, type: file.type, bytes },
  });
  revalidatePath("/app/imports");
  revalidatePath("/app/documents");
  redirect(`/app/imports/${result.batch.id}`);
}

export async function saveMappingAction(formData: FormData) {
  const ctx = await requireTenantContext();
  const batchId = String(formData.get("batchId") ?? "");
  const saveAsProfileName =
    String(formData.get("saveAsProfileName") || "") || null;

  const mapping: Record<string, string> = {};
  for (const field of canonicalImportFields) {
    const v = String(formData.get(`map_${field}`) || "").trim();
    if (v) mapping[field] = v;
  }

  await saveImportMapping(ctx, {
    batchId,
    mapping,
    saveAsProfileName,
  });

  revalidatePath(`/app/imports/${batchId}`);
  revalidatePath("/app/imports");
  revalidatePath("/app/reconciliation");
}

export async function bulkReviewAction(formData: FormData) {
  const ctx = await requireTenantContext();
  const batchId = String(formData.get("batchId") ?? "");
  const action = z
    .enum([
      "approve",
      "approve_all_ready",
      "reject",
      "mark_ready",
      "set_classification",
    ])
    .parse(String(formData.get("action") ?? "approve"));
  const classificationRaw = String(formData.get("classification") || "");
  const classification = importClassifications.includes(
    classificationRaw as ImportClassification,
  )
    ? (classificationRaw as ImportClassification)
    : undefined;

  const rowIds = formData
    .getAll("rowId")
    .map(String)
    .filter(Boolean);

  if (action === "approve_all_ready") {
    await approveImportRows(ctx, { batchId });
  } else if (action === "approve") {
    if (!rowIds.length) {
      throw new Error("Select at least one row to approve");
    }
    await bulkUpdateImportRows(ctx, {
      batchId,
      rowIds,
      action: "approve",
      classification,
    });
  } else {
    await bulkUpdateImportRows(ctx, {
      batchId,
      rowIds,
      action,
      classification,
    });
  }

  revalidatePath(`/app/imports/${batchId}`);
  revalidatePath("/app/imports");
  revalidatePath("/app/reconciliation");
}
