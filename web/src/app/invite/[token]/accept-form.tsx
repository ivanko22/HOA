"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { acceptInviteAction } from "./actions";

export function AcceptInviteForm({
  token,
  defaultName,
}: {
  token: string;
  defaultName: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    formData.set("token", token);
    setError(null);
    startTransition(async () => {
      try {
        await acceptInviteAction(formData);
        router.push("/login?accepted=1");
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not accept invite");
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="mt-4 space-y-3">
      <label className="block text-sm">
        <span className="text-[var(--muted)]">Your name</span>
        <input
          name="name"
          required
          defaultValue={defaultName}
          className="mt-1 w-full border border-[var(--border)] bg-white px-3 py-2"
        />
      </label>
      <label className="block text-sm">
        <span className="text-[var(--muted)]">Password (min 8 characters)</span>
        <input
          name="password"
          type="password"
          required
          minLength={8}
          className="mt-1 w-full border border-[var(--border)] bg-white px-3 py-2"
        />
      </label>
      {error ? (
        <p className="text-sm text-rose-700" role="alert">
          {error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="w-full bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-60"
      >
        {pending ? "Confirming…" : "Confirm email & create account"}
      </button>
    </form>
  );
}
