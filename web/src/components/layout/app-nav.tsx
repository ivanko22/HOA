"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const links = [
  { href: "/app", label: "Financial Health" },
  { href: "/app/data-health", label: "Data Health" },
  { href: "/app/buildings", label: "Buildings" },
  { href: "/app/projects", label: "Projects" },
  { href: "/app/legal", label: "Legal" },
  { href: "/app/documents", label: "Documents" },
  { href: "/app/ledger", label: "Ledger" },
  { href: "/app/imports", label: "Imports" },
  { href: "/app/reconciliation", label: "Reconciliation" },
  { href: "/app/audit", label: "Audit Log" },
];

export function AppNav({ communityName }: { communityName: string }) {
  const pathname = usePathname();

  return (
    <>
      <div className="border-b border-[var(--border)] px-4 py-5">
        <p className="font-[family-name:var(--font-display)] text-xl tracking-tight text-[var(--foreground)]">
          Community OS
        </p>
        <p className="mt-1 text-xs text-[var(--muted)]">{communityName}</p>
      </div>
      <nav className="flex flex-1 flex-col gap-0.5 p-2" aria-label="Primary">
        {links.map((link) => {
          const active =
            link.href === "/app"
              ? pathname === "/app"
              : pathname.startsWith(link.href);
          return (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                "rounded-md px-3 py-2 text-sm transition-colors",
                active
                  ? "bg-[var(--accent-soft)] font-medium text-[var(--accent)]"
                  : "text-[var(--muted-foreground)] hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)]",
              )}
            >
              {link.label}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
