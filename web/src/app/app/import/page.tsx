import { and, eq } from "drizzle-orm";
import { requireTenantContext } from "@/lib/auth/config";
import { db } from "@/lib/db/client";
import { bankAccounts } from "@/lib/db/schema";
import { assertCan } from "@/lib/domain/permissions";
import { importBankTransactionsCsv } from "@/lib/services/csv-import";
import { revalidatePath } from "next/cache";

async function importAction(formData: FormData) {
  "use server";
  const ctx = await requireTenantContext();
  assertCan(ctx.capabilities, "import.csv");
  const bankAccountId = String(formData.get("bankAccountId") ?? "");
  const dryRun = formData.get("dryRun") === "on";
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return;
  }
  const text = await file.text();
  const result = await importBankTransactionsCsv(ctx, text, {
    bankAccountId,
    dryRun,
  });
  revalidatePath("/app/ledger");
  revalidatePath("/app/audit");
  // Encode result in redirect query for simple feedback
  const q = new URLSearchParams({
    accepted: String(result.accepted),
    rejected: String(result.rejected.length),
    dryRun: String(result.dryRun),
  });
  const { redirect } = await import("next/navigation");
  redirect(`/app/import?${q.toString()}`);
}

export default async function ImportPage({
  searchParams,
}: {
  searchParams: Promise<{
    accepted?: string;
    rejected?: string;
    dryRun?: string;
  }>;
}) {
  const ctx = await requireTenantContext();
  assertCan(ctx.capabilities, "import.csv");
  const params = await searchParams;

  const banks = await db
    .select()
    .from(bankAccounts)
    .where(
      and(
        eq(bankAccounts.organizationId, ctx.organizationId),
        eq(bankAccounts.communityId, ctx.communityId),
      ),
    );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-3xl tracking-tight">
          CSV Import
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-[var(--muted)]">
          Bank transaction imports land as <strong>Needs Review</strong>. They
          do not post verified journals automatically.
        </p>
      </div>

      {params.accepted != null ? (
        <p className="border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm" role="status">
          Import {params.dryRun === "true" ? "(dry run) " : ""}accepted{" "}
          {params.accepted} row(s); rejected {params.rejected}.
        </p>
      ) : null}

      <form
        action={importAction}
        className="max-w-xl space-y-4 border border-[var(--border)] bg-[var(--surface)] p-5"
      >
        <label className="block text-sm">
          <span className="text-[var(--muted)]">Bank account</span>
          <select
            name="bankAccountId"
            required
            className="mt-1 w-full border border-[var(--border)] bg-white px-3 py-2"
            defaultValue={banks[0]?.id}
          >
            {banks.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="text-[var(--muted)]">CSV file</span>
          <input
            name="file"
            type="file"
            accept=".csv,text/csv"
            required
            className="mt-1 block w-full text-sm"
          />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input name="dryRun" type="checkbox" defaultChecked />
          Dry run (validate only)
        </label>
        <button
          type="submit"
          className="bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white hover:brightness-110"
        >
          Import
        </button>
      </form>

      <section className="border border-[var(--border)] bg-[var(--surface)] p-5 text-sm">
        <h2 className="font-semibold">Expected headers</h2>
        <pre className="mt-2 overflow-x-auto bg-[var(--surface-hover)] p-3 text-xs">
{`posted_date,amount,description,external_id
2026-01-05,250.00,Owner dues deposit,dep-001
2026-01-08,-89.40,Utility payment,ach-441`}
        </pre>
      </section>
    </div>
  );
}
