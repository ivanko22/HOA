"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { syncSourceAction } from "./actions";

export function SyncRunButton({
  sourceId,
  resumeRunId,
  autoStart = false,
  label,
  flush = false,
}: {
  sourceId: string;
  resumeRunId?: string;
  autoStart?: boolean;
  label: string;
  flush?: boolean;
}) {
  const router = useRouter();
  const started = useRef(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const run = useCallback(async () => {
    setPending(true);
    setMessage(null);
    try {
      const result = await syncSourceAction({ sourceId, resumeRunId });
      if (!result.ok) {
        setMessage(result.message);
        setPending(false);
        return;
      }
      const params = new URLSearchParams({ run: result.runId });
      if (result.status === "running") params.set("continue", "1");
      router.replace(`/app/sources/${result.sourceId}?${params.toString()}`);
    } catch (err) {
      setMessage(
        err instanceof Error ? err.message : "Sync could not finish.",
      );
      setPending(false);
    }
  }, [router, sourceId, resumeRunId]);

  useEffect(() => {
    if (!autoStart || started.current) return;
    started.current = true;
    void run();
  }, [autoStart, run]);

  return (
    <div className={flush ? undefined : "mt-3"}>
      <button
        type="button"
        onClick={() => void run()}
        disabled={pending}
        className="bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-60"
      >
        {pending ? "Syncing…" : label}
      </button>
      {message ? <p className="mt-2 max-w-xl break-words">{message}</p> : null}
    </div>
  );
}
