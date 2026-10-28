import { requireTenantContext } from "@/lib/auth/config";
import { assertCan, can } from "@/lib/domain/permissions";
import { listInvites } from "@/lib/services/invites";
import { Badge } from "@/components/ui/badge";
import { InviteForm } from "./invite-form";
import { revokeInviteAction } from "./actions";

function inviteStatus(invite: {
  acceptedAt: Date | null;
  revokedAt: Date | null;
  expiresAt: Date;
}) {
  if (invite.acceptedAt) return "accepted";
  if (invite.revokedAt) return "revoked";
  if (invite.expiresAt.getTime() < Date.now()) return "expired";
  return "pending";
}

export default async function MembersPage() {
  const ctx = await requireTenantContext();
  assertCan(ctx.capabilities, "community.members.manage");
  const invites = await listInvites(ctx);
  const canManage = can(ctx.capabilities, "community.members.manage");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-3xl tracking-tight">
          Members
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-[var(--muted)]">
          Invite-only access. New people confirm by email link before they can
          sign in. There is no public registration.
        </p>
      </div>

      {canManage ? <InviteForm /> : null}

      <div className="overflow-x-auto border border-[var(--border)] bg-[var(--surface)]">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="border-b border-[var(--border)] bg-[var(--surface-hover)] text-xs uppercase tracking-wide text-[var(--muted)]">
            <tr>
              <th className="px-4 py-3 font-medium">Email</th>
              <th className="px-4 py-3 font-medium">Role</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Expires</th>
              <th className="px-4 py-3 font-medium"> </th>
            </tr>
          </thead>
          <tbody>
            {invites.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-8 text-center text-[var(--muted)]"
                >
                  No invites yet.
                </td>
              </tr>
            ) : (
              invites.map((invite) => {
                const status = inviteStatus(invite);
                return (
                  <tr
                    key={invite.id}
                    className="border-b border-[var(--border)] last:border-0"
                  >
                    <td className="px-4 py-3">
                      <div className="font-medium">{invite.email}</div>
                      {invite.name ? (
                        <div className="text-xs text-[var(--muted)]">
                          {invite.name}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-4 py-3">
                      {invite.role.replaceAll("_", " ")}
                    </td>
                    <td className="px-4 py-3">
                      <Badge
                        variant={
                          status === "accepted"
                            ? "verified"
                            : status === "pending"
                              ? "needs_review"
                              : "unknown"
                        }
                      >
                        {status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-[var(--muted)]">
                      {invite.expiresAt.toLocaleString("en-US", {
                        timeZone: "America/New_York",
                      })}{" "}
                      ET
                    </td>
                    <td className="px-4 py-3">
                      {status === "pending" ? (
                        <form action={revokeInviteAction}>
                          <input
                            type="hidden"
                            name="inviteId"
                            value={invite.id}
                          />
                          <button
                            type="submit"
                            className="text-sm text-rose-700 hover:underline"
                          >
                            Revoke
                          </button>
                        </form>
                      ) : null}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
