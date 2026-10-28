"use client";

import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { bootstrapAction } from "./actions";

export function LoginForm({
  needsBootstrap = false,
}: {
  needsBootstrap?: boolean;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [error, setError] = useState<string | null>(
    params.get("error") ? "Invalid email or password." : null,
  );
  const [pending, setPending] = useState(false);
  const created = params.get("created") === "1";

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const form = new FormData(e.currentTarget);
    const result = await signIn("credentials", {
      email: String(form.get("email") ?? ""),
      password: String(form.get("password") ?? ""),
      redirect: false,
    });
    setPending(false);
    if (result?.error) {
      setError("Invalid email or password.");
      return;
    }
    router.push("/app");
    router.refresh();
  }

  if (needsBootstrap) {
    return (
      <form
        action={bootstrapAction}
        className="mt-8 space-y-4 border border-white/20 bg-white/95 p-6 shadow-xl shadow-black/10 backdrop-blur"
      >
        <h1 className="text-lg font-semibold text-[var(--foreground)]">
          Create first admin
        </h1>
        <p className="text-sm text-[var(--muted)]">
          This database has no users yet. Create the first community admin, then
          sign in.
        </p>
        <label className="block text-sm">
          <span className="text-[var(--muted)]">Your name</span>
          <input
            name="name"
            required
            defaultValue="Willows Treasurer"
            className="mt-1 w-full border border-[var(--border)] bg-white px-3 py-2 text-[var(--foreground)]"
          />
        </label>
        <label className="block text-sm">
          <span className="text-[var(--muted)]">Community name</span>
          <input
            name="communityName"
            required
            defaultValue="The Willows"
            className="mt-1 w-full border border-[var(--border)] bg-white px-3 py-2 text-[var(--foreground)]"
          />
        </label>
        <label className="block text-sm">
          <span className="text-[var(--muted)]">Email</span>
          <input
            name="email"
            type="email"
            required
            defaultValue="treasurer@willows.local"
            className="mt-1 w-full border border-[var(--border)] bg-white px-3 py-2 text-[var(--foreground)]"
          />
        </label>
        <label className="block text-sm">
          <span className="text-[var(--muted)]">Password (min 8 characters)</span>
          <input
            name="password"
            type="password"
            required
            minLength={8}
            className="mt-1 w-full border border-[var(--border)] bg-white px-3 py-2 text-[var(--foreground)]"
          />
        </label>
        <button
          type="submit"
          className="w-full bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-white hover:brightness-110"
        >
          Create admin &amp; continue
        </button>
      </form>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      className="mt-8 space-y-4 border border-white/20 bg-white/95 p-6 shadow-xl shadow-black/10 backdrop-blur"
    >
      <h1 className="text-lg font-semibold text-[var(--foreground)]">
        Sign in
      </h1>
      {created ? (
        <p className="text-sm text-emerald-800" role="status">
          Admin created. Sign in with the email and password you just set.
        </p>
      ) : null}
      {error ? (
        <p className="text-sm text-rose-700" role="alert">
          {error}
        </p>
      ) : null}
      <label className="block text-sm">
        <span className="text-[var(--muted)]">Email</span>
        <input
          name="email"
          type="email"
          required
          defaultValue="treasurer@willows.local"
          className="mt-1 w-full border border-[var(--border)] bg-white px-3 py-2 text-[var(--foreground)]"
        />
      </label>
      <label className="block text-sm">
        <span className="text-[var(--muted)]">Password</span>
        <input
          name="password"
          type="password"
          required
          className="mt-1 w-full border border-[var(--border)] bg-white px-3 py-2 text-[var(--foreground)]"
        />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="w-full bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-60"
      >
        {pending ? "Signing in…" : "Continue"}
      </button>
      <p className="text-xs text-[var(--muted)]">
        Demo community: The Willows · Tulsa, OK
      </p>
    </form>
  );
}
