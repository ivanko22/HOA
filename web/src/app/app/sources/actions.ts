"use server";

import { revalidatePath } from "next/cache";
import { redirect, unstable_rethrow } from "next/navigation";
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
  const resumeRaw = String(formData.get("resumeRunId") ?? "");
  try {
    const result = await syncExternalSource(ctx, sourceId, {
      resumeRunId: resumeRaw || undefined,
    });
    revalidatePath("/app/sources");
    revalidatePath(`/app/sources/${sourceId}`);
    revalidatePath("/app/sources/reconciliation");
    revalidatePath("/app/documents");
    revalidatePath("/app/data-health");
    const params = new URLSearchParams({ run: result.runId });
    if (result.report.status === "running") params.set("continue", "1");
    redirect(`/app/sources/${sourceId}?${params.toString()}`);
  } catch (err) {
    unstable_rethrow(err);
    revalidatePath(`/app/sources/${sourceId}`);
    redirect(`/app/sources/${sourceId}?syncError=1`);
  }
}
