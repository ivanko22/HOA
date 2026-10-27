import { redirect } from "next/navigation";
import { auth, resolveTenantContext } from "@/lib/auth/config";
import { AppNav } from "@/components/layout/app-nav";
import { SignOutButton } from "@/components/layout/sign-out-button";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { communities } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const ctx = await resolveTenantContext(session.user.id);
  if (!ctx) redirect("/login?error=membership");

  const [community] = await db
    .select()
    .from(communities)
    .where(eq(communities.id, ctx.communityId))
    .limit(1);

  return (
    <div className="flex min-h-screen">
      <div className="flex w-56 shrink-0 flex-col border-r border-[var(--border)] bg-[var(--sidebar)]">
        <AppNav communityName={community?.name ?? "Community"} />
        <SignOutButton />
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-[var(--border)] bg-[var(--surface)]/80 px-6 py-3 backdrop-blur">
          <div>
            <p className="text-xs uppercase tracking-[0.12em] text-[var(--muted)]">
              Active community
            </p>
            <p className="text-sm font-medium">
              {community?.name}
              {community?.city ? ` · ${community.city}, ${community.region}` : ""}
            </p>
          </div>
          <div className="text-right text-sm">
            <p className="font-medium">{session.user.name}</p>
            <p className="text-xs text-[var(--muted)]">
              {ctx.roles.join(" · ")}
            </p>
          </div>
        </header>
        <main className="flex-1 px-6 py-6">{children}</main>
      </div>
    </div>
  );
}
