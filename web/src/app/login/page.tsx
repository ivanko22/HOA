import { Suspense } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/config";
import { needsBootstrap } from "@/lib/services/bootstrap";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const session = await auth();
  if (session?.user) redirect("/app");
  const bootstrap = await needsBootstrap();

  return (
    <main className="relative flex min-h-screen flex-col justify-center px-4">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-[linear-gradient(135deg,var(--hero-from),var(--hero-to))] opacity-95"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 opacity-30"
        style={{
          backgroundImage:
            "radial-gradient(circle at 20% 20%, rgba(255,255,255,0.25), transparent 40%), radial-gradient(circle at 80% 0%, rgba(255,255,255,0.12), transparent 35%)",
        }}
      />

      <div className="mx-auto w-full max-w-md">
        <p className="font-[family-name:var(--font-display)] text-4xl text-white">
          Community OS
        </p>
        <p className="mt-2 max-w-sm text-sm text-white/80">
          Trustworthy financial transparency for condominiums and HOAs.
          Unknown is never shown as zero.
        </p>

        <Suspense fallback={<div className="mt-8 h-64 bg-white/80" />}>
          <LoginForm needsBootstrap={bootstrap} />
        </Suspense>
      </div>
    </main>
  );
}
