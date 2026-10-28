import { getInviteByToken } from "@/lib/services/invites";
import { AcceptInviteForm } from "./accept-form";

export const dynamic = "force-dynamic";

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const resolved = await getInviteByToken(token);

  return (
    <main className="relative flex min-h-screen flex-col justify-center px-4">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-[linear-gradient(135deg,var(--hero-from),var(--hero-to))] opacity-95"
      />
      <div className="mx-auto w-full max-w-md border border-white/20 bg-white/95 p-6 shadow-xl">
        <h1 className="text-lg font-semibold">Confirm invite</h1>
        {!resolved ? (
          <p className="mt-3 text-sm text-rose-700">
            This invite link is invalid.
          </p>
        ) : resolved.status !== "pending" ? (
          <p className="mt-3 text-sm text-[var(--muted)]">
            This invite is {resolved.status}. Ask an admin to send a new one.
          </p>
        ) : (
          <>
            <p className="mt-2 text-sm text-[var(--muted)]">
              Confirm <strong>{resolved.invite.email}</strong> and set a
              password to join as{" "}
              {resolved.invite.role.replaceAll("_", " ")}. Opening this link
              proves you control the email inbox.
            </p>
            <AcceptInviteForm
              token={token}
              defaultName={resolved.invite.name ?? ""}
            />
          </>
        )}
      </div>
    </main>
  );
}
