"use client";

import { useState, useTransition } from "react";
import { createInviteAction } from "./actions";

const roles = [
  "community_admin",
  "treasurer",
  "board_member",
  "property_manager",
  "owner",
  "auditor",
] as const;

export function InviteForm() {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    inviteUrl: string;
    emailSent: boolean;
    emailReason: string | null;
  } | null>(null);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    setError(null);
    setResult(null);
    startTransition(async () => {
      try {
        const created = await createInviteAction(formData);
        setResult({
          inviteUrl: created.inviteUrl,
          emailSent: created.emailSent,
          emailReason: created.emailReason,
        });
        (e.target as HTMLFormElement).reset();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Invite failed");
      }
    });
  }

  return (
    <div className="space-y-4 border border-[var(--border)] bg-[var(--surface)] p-5">
      <div>
        <h2 className="text-lg font-semibold">Invite member</h2>
        <p className="text-sm text-[var(--muted)]">
          No public sign-up. Invitees confirm by opening the email link (or the
          copied invite URL) and setting a password.
        </p>
      </div>
      <form onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm sm:col-span-2">
          <span className="text-[var(--muted)]">Email</span>
          <input
            name="email"
            type="email"
            required
            className="mt-1 w-full border border-[var(--border)] bg-white px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          <span className="text-[var(--muted)]">Name (optional)</span>
          <input
            name="name"
            className="mt-1 w-full border border-[var(--border)] bg-white px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          <span className="text-[var(--muted)]">Role</span>
          <select
            name="role"
            defaultValue="owner"
            className="mt-1 w-full border border-[var(--border)] bg-white px-3 py-2"
          >
            {roles.map((r) => (
              <option key={r} value={r}>
                {r.replaceAll("_", " ")}
              </option>
            ))}
          </select>
        </label>
        <div className="sm:col-span-2">
          <button
            type="submit"
            disabled={pending}
            className="bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-60"
          >
            {pending ? "Sending…" : "Create invite"}
          </button>
        </div>
      </form>
      {error ? (
        <p className="text-sm text-rose-700" role="alert">
          {error}
        </p>
      ) : null}
      {result ? (
        <div className="space-y-2 border border-[var(--border)] bg-[var(--surface-hover)] p-3 text-sm">
          <p>
            {result.emailSent
              ? "Invite email sent. They must open the link to confirm."
              : `Email not sent (${result.emailReason}). Share this link securely:`}
          </p>
          <code className="block break-all text-xs">{result.inviteUrl}</code>
        </div>
      ) : null}
    </div>
  );
}
