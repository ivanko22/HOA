import { factTypes } from "@/lib/domain/enums";
import { addFactAction } from "../actions";

export function AddFactForm({ documentId }: { documentId: string }) {
  return (
    <form
      action={addFactAction}
      className="space-y-3 border border-[var(--border)] bg-[var(--surface)] p-4"
    >
      <h3 className="text-sm font-semibold">Add manual fact</h3>
      <p className="text-xs text-[var(--muted)]">
        Manual entry lands as reported by default. Automated extraction (when
        added later) must start as needs review.
      </p>
      <input type="hidden" name="documentId" value={documentId} />
      <input type="hidden" name="verificationStatus" value="reported" />
      <div className="grid gap-3 md:grid-cols-2">
        <label className="text-sm">
          <span className="text-[var(--muted)]">Fact type</span>
          <select
            name="factType"
            required
            className="mt-1 w-full border border-[var(--border)] bg-white px-3 py-2"
            defaultValue="operating_expenses"
          >
            {factTypes.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="text-[var(--muted)]">Label</span>
          <input
            name="label"
            required
            className="mt-1 w-full border border-[var(--border)] bg-white px-3 py-2"
          />
        </label>
        <label className="text-sm">
          <span className="text-[var(--muted)]">Numeric value</span>
          <input
            name="numericValue"
            placeholder="Leave blank if unknown"
            className="mt-1 w-full border border-[var(--border)] bg-white px-3 py-2"
          />
        </label>
        <label className="text-sm">
          <span className="text-[var(--muted)]">Unit</span>
          <input
            name="unit"
            defaultValue="USD"
            className="mt-1 w-full border border-[var(--border)] bg-white px-3 py-2"
          />
        </label>
        <label className="text-sm">
          <span className="text-[var(--muted)]">Text value</span>
          <input
            name="value"
            className="mt-1 w-full border border-[var(--border)] bg-white px-3 py-2"
          />
        </label>
        <label className="text-sm">
          <span className="text-[var(--muted)]">As of date</span>
          <input
            name="asOfDate"
            type="date"
            className="mt-1 w-full border border-[var(--border)] bg-white px-3 py-2"
          />
        </label>
        <label className="text-sm">
          <span className="text-[var(--muted)]">Period start</span>
          <input
            name="periodStart"
            type="date"
            className="mt-1 w-full border border-[var(--border)] bg-white px-3 py-2"
          />
        </label>
        <label className="text-sm">
          <span className="text-[var(--muted)]">Period end</span>
          <input
            name="periodEnd"
            type="date"
            className="mt-1 w-full border border-[var(--border)] bg-white px-3 py-2"
          />
        </label>
        <label className="text-sm">
          <span className="text-[var(--muted)]">Source page</span>
          <input
            name="sourcePage"
            className="mt-1 w-full border border-[var(--border)] bg-white px-3 py-2"
          />
        </label>
        <label className="text-sm">
          <span className="text-[var(--muted)]">Source reference</span>
          <input
            name="sourceReference"
            className="mt-1 w-full border border-[var(--border)] bg-white px-3 py-2"
          />
        </label>
      </div>
      <label className="block text-sm">
        <span className="text-[var(--muted)]">Source excerpt</span>
        <textarea
          name="sourceExcerpt"
          rows={2}
          className="mt-1 w-full border border-[var(--border)] bg-white px-3 py-2"
        />
      </label>
      <label className="block text-sm">
        <span className="text-[var(--muted)]">Notes</span>
        <textarea
          name="notes"
          rows={2}
          className="mt-1 w-full border border-[var(--border)] bg-white px-3 py-2"
        />
      </label>
      <button
        type="submit"
        className="bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white hover:brightness-110"
      >
        Save fact
      </button>
    </form>
  );
}
