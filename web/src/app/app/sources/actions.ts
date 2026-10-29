"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireTenantContext } from "@/lib/auth/config";
import {
  ensureWillowsDriveSource,
  syncExternalSource,
} from "@/lib/services/drive-sync";

export async function ensureWillowsSourceAction() {
  const ctx = await requireTenantContext();
  const source = await ensureWillowsDriveSource(ctx);
  revalidatePath("/app/sources");
  redirect(`/app/sources/${source.id}`);
}

export async function syncSourceAction(formData: FormData) {
  const ctx = await requireTenantContext();
  const sourceId = String(formData.get("sourceId") ?? "");
  const result = await syncExternalSource(ctx, sourceId);
  revalidatePath("/app/sources");
  revalidatePath(`/app/sources/${sourceId}`);
  revalidatePath("/app/sources/reconciliation");
  revalidatePath("/app/documents");
  revalidatePath("/app/data-health");
  redirect(`/app/sources/${sourceId}?run=${result.runId}`);
}
