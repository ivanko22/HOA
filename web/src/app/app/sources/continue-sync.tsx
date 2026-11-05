"use client";

import { useEffect, useRef } from "react";
import { syncSourceAction } from "./actions";

export function ContinueSync({
  sourceId,
  runId,
  resumeFrom,
}: {
  sourceId: string;
  runId: string;
  resumeFrom: number;
}) {
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      formRef.current?.requestSubmit();
    }, 50);
    return () => window.clearTimeout(timer);
  }, [runId, resumeFrom]);

  return (
    <form ref={formRef} action={syncSourceAction} className="mt-3">
      <input type="hidden" name="sourceId" value={sourceId} />
      <input type="hidden" name="resumeRunId" value={runId} />
      <button
        type="submit"
        className="bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white hover:brightness-110"
      >
        Continue sync
      </button>
    </form>
  );
}
