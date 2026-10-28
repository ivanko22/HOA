import Link from "next/link";
import { requireTenantContext } from "@/lib/auth/config";
import { assertCan } from "@/lib/domain/permissions";
import { importSourceTypes } from "@/lib/domain/import-csv";
import { listImportProfiles } from "@/lib/services/imports";
import { uploadImportAction } from "../actions";

const sourceLabels: Record<(typeof importSourceTypes)[number], string> = {
  generic_csv: "Generic CSV",
  folio_csv: "Property management / Folio-style CSV",
  bank_csv: "Bank transaction CSV",
};

export default async function NewImportPage() {
  const ctx = await requireTenantContext();
  assertCan(ctx.capabilities, "import.csv");
  const profiles = await listImportProfiles(ctx);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-[var(--muted)]">
          <Link href="/app/imports" className="hover:underline">
            Imports
          </Link>{" "}
          / New
        </p>
        <h1 className="mt-1 font-[family-name:var(--font-display)] text-3xl tracking-tight">
          Upload CSV
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-[var(--muted)]">
          Source file is stored first. Rows are not accounting facts until you
          map, validate, and approve them.
        </p>
      </div>

      <form
        action={uploadImportAction}
        className="max-w-xl space-y-4 border border-[var(--border)] bg-[var(--surface)] p-5"
      >
        <label className="block text-sm">
          <span className="text-[var(--muted)]">Source type</span>
          <select
            name="sourceType"
            required
            className="mt-1 w-full border border-[var(--border)] bg-white px-3 py-2"
            defaultValue="generic_csv"
          >
            {importSourceTypes.map((t) => (
              <option key={t} value={t}>
                {sourceLabels[t]}
              </option>
            ))}
          </select>
        </label>

        {profiles.length > 0 ? (
          <label className="block text-sm">
            <span className="text-[var(--muted)]">
              Mapping profile (optional)
            </span>
            <select
              name="profileId"
              className="mt-1 w-full border border-[var(--border)] bg-white px-3 py-2"
              defaultValue=""
            >
              <option value="">Suggest from headers</option>
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.sourceType})
                </option>
              ))}
            </select>
          </label>
        ) : null}

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

        <button
          type="submit"
          className="bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white hover:brightness-110"
        >
          Upload &amp; preview
        </button>
      </form>
    </div>
  );
}
