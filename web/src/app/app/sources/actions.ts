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

export type SyncActionResult =
  | { ok: true; sourceId: string; runId: string; status: string }
  | { ok: false; sourceId: string; message: string };

export async function syncSourceAction(input: {
  sourceId: string;
  resumeRunId?: string;
}): Promise<SyncActionResult> {
  const ctx = await requireTenantContext();
  const sourceId = input.sourceId;
  try {
    const result = await syncExternalSource(ctx, sourceId, {
      resumeRunId: input.resumeRunId,
    });
    revalidatePath("/app/sources");
    revalidatePath(`/app/sources/${sourceId}`);
    revalidatePath("/app/documents");
    return {
      ok: true,
      sourceId,
      runId: result.runId,
      status: result.report.status,
    };
  } catch (err) {
    unstable_rethrow(err);
    revalidatePath(`/app/sources/${sourceId}`);
    return {
      ok: false,
      sourceId,
      message: err instanceof Error ? err.message : "Sync could not finish.",
    };
  }
}
