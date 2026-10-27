"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { FinancialHealthDashboard } from "@/lib/services/financial-health";
import { StatusBadge } from "@/components/verification/status-badge";
import Link from "next/link";

function ChartFrame({
  title,
  href,
  statusNote,
  children,
}: {
  title: string;
  href: string;
  statusNote?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border border-[var(--border)] bg-[var(--surface)]">
      <header className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-3">
        <div>
          <h3 className="text-sm font-semibold text-[var(--foreground)]">
            {title}
          </h3>
          {statusNote ? (
            <p className="mt-0.5 text-xs text-[var(--muted)]">{statusNote}</p>
          ) : null}
        </div>
        <Link
          href={href}
          className="text-xs font-medium text-[var(--accent)] hover:underline"
        >
          Drill down
        </Link>
      </header>
      <div className="h-56 p-2">{children}</div>
    </section>
  );
}

function UnknownOverlay({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-[var(--surface)]/70">
      <StatusBadge status="unknown" />
    </div>
  );
}

export function DashboardCharts({
  charts,
}: {
  charts: FinancialHealthDashboard["charts"];
}) {
  const incomeData = charts.incomeVsExpenses.map((r) => ({
    name: r.label,
    Income: r.income,
    Expenses: r.expenses,
  }));
  const duesData = charts.duesBilledVsCollected.map((r) => ({
    name: r.label,
    Billed: r.billed,
    Collected: r.collected,
  }));

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <ChartFrame
        title="Income vs Expenses"
        href="/app/ledger?focus=expenses"
        statusNote="Expenses unknown until verified journals exist"
      >
        <div className="relative h-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={incomeData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#d8dee6" />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip />
              <Legend />
              <Bar dataKey="Income" fill="#0f766e" />
              <Bar dataKey="Expenses" fill="#64748b" />
            </BarChart>
          </ResponsiveContainer>
          <UnknownOverlay
            show={charts.incomeVsExpenses.every((r) => r.expenses == null)}
          />
        </div>
      </ChartFrame>

      <ChartFrame title="Dues Billed vs Collected" href="/app/ledger?focus=dues">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={duesData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#d8dee6" />
            <XAxis dataKey="name" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 12 }} />
            <Tooltip />
            <Legend />
            <Bar dataKey="Billed" fill="#1e3a5f" />
            <Bar dataKey="Collected" fill="#0f766e" />
          </BarChart>
        </ResponsiveContainer>
      </ChartFrame>

      <ChartFrame
        title="Expense Breakdown"
        href="/app/ledger?focus=expenses"
        statusNote="No verified expense categorization yet"
      >
        <div className="relative h-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={charts.expenseBreakdown.map((e) => ({
                name: e.category,
                Amount: e.amount,
              }))}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#d8dee6" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip />
              <Bar dataKey="Amount" fill="#475569" />
            </BarChart>
          </ResponsiveContainer>
          <UnknownOverlay show />
        </div>
      </ChartFrame>

      <ChartFrame title="Cash Balance (accounts)" href="/app/ledger?focus=cash">
        <div className="relative h-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={charts.cashHistory.map((c) => ({
                name: c.label,
                Balance: c.balance,
              }))}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#d8dee6" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip />
              <Line
                type="monotone"
                dataKey="Balance"
                stroke="#0f766e"
                strokeWidth={2}
                dot
              />
            </LineChart>
          </ResponsiveContainer>
          <UnknownOverlay
            show={charts.cashHistory.every((c) => c.balance == null)}
          />
        </div>
      </ChartFrame>

      <ChartFrame title="Accounts Receivable Aging" href="/app/ledger?focus=ar">
        <div className="relative h-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={charts.arAging.map((a) => ({
                name: a.bucket,
                Amount: a.amount,
              }))}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#d8dee6" />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip />
              <Bar dataKey="Amount" fill="#b45309" />
            </BarChart>
          </ResponsiveContainer>
          <UnknownOverlay
            show={charts.arAging.every((a) => a.amount == null)}
          />
        </div>
      </ChartFrame>

      <ChartFrame title="Accounts Payable Aging" href="/app/ledger?focus=ap">
        <div className="relative h-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={charts.apAging.map((a) => ({
                name: a.bucket,
                Amount: a.amount,
              }))}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#d8dee6" />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip />
              <Bar dataKey="Amount" fill="#1e3a5f" />
            </BarChart>
          </ResponsiveContainer>
          <UnknownOverlay
            show={charts.apAging.every((a) => a.amount == null)}
          />
        </div>
      </ChartFrame>

      <ChartFrame
        title="Special Assessment Progress"
        href="/app/projects"
        statusNote="No verified special assessment on file"
      >
        <div className="flex h-full items-center justify-center">
          <StatusBadge status="unknown" />
        </div>
      </ChartFrame>

      <ChartFrame title="Capital Project Spending" href="/app/projects">
        <div className="flex h-full items-center justify-center">
          <StatusBadge status="unknown" />
        </div>
      </ChartFrame>

      <ChartFrame title="Insurance Cost History" href="/app/documents?category=insurance">
        <div className="flex h-full items-center justify-center">
          <StatusBadge status="unknown" />
        </div>
      </ChartFrame>

      <ChartFrame title="Legal Expense History" href="/app/legal">
        <div className="flex h-full items-center justify-center">
          <StatusBadge status="unknown" />
        </div>
      </ChartFrame>
    </div>
  );
}
