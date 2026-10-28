"use client";

import { useState } from "react";
import { documentCategories } from "@/lib/domain/enums";
import { uploadDocumentAction } from "./actions";

const categoryLabels: Record<(typeof documentCategories)[number], string> = {
  meeting_minutes: "Meeting Minutes",
  financial_statement: "Financial Statement",
  bank_statement: "Bank Statement",
  invoice: "Invoice",
  insurance: "Insurance",
  contract: "Contract",
  legal: "Legal",
  inspection: "Inspection",
  quote: "Quote",
  other: "Other",
};

export function UploadDocumentForm() {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white hover:brightness-110"
      >
        Upload document
      </button>
    );
  }

  return (
    <form
      action={uploadDocumentAction}
      className="w-full max-w-xl space-y-3 border border-[var(--border)] bg-[var(--surface)] p-4"
    >
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Upload document</h2>
        <button
          type="button"
          className="text-xs text-[var(--muted)] hover:underline"
          onClick={() => setOpen(false)}
        >
          Cancel
        </button>
      </div>
      <label className="block text-sm">
        <span className="text-[var(--muted)]">Title</span>
        <input
          name="title"
          required
          className="mt-1 w-full border border-[var(--border)] bg-white px-3 py-2"
        />
      </label>
      <label className="block text-sm">
        <span className="text-[var(--muted)]">Category</span>
        <select
          name="category"
          required
          className="mt-1 w-full border border-[var(--border)] bg-white px-3 py-2"
          defaultValue="meeting_minutes"
        >
          {documentCategories.map((c) => (
            <option key={c} value={c}>
              {categoryLabels[c]}
            </option>
          ))}
        </select>
      </label>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block text-sm">
          <span className="text-[var(--muted)]">Document date</span>
          <input
            name="documentDate"
            type="date"
            className="mt-1 w-full border border-[var(--border)] bg-white px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          <span className="text-[var(--muted)]">Period start</span>
          <input
            name="periodStart"
            type="date"
            className="mt-1 w-full border border-[var(--border)] bg-white px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          <span className="text-[var(--muted)]">Period end</span>
          <input
            name="periodEnd"
            type="date"
            className="mt-1 w-full border border-[var(--border)] bg-white px-3 py-2"
          />
        </label>
      </div>
      <label className="block text-sm">
        <span className="text-[var(--muted)]">Description</span>
        <textarea
          name="description"
          rows={2}
          className="mt-1 w-full border border-[var(--border)] bg-white px-3 py-2"
        />
      </label>
      <label className="block text-sm">
        <span className="text-[var(--muted)]">File</span>
        <input
          name="file"
          type="file"
          required
          className="mt-1 block w-full text-sm"
        />
      </label>
      <button
        type="submit"
        className="bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white hover:brightness-110"
      >
        Save document
      </button>
    </form>
  );
}
