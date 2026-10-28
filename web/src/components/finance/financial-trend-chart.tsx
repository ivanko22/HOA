"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { TrendPoint } from "@/lib/services/metric-resolution";
import type { MetricId } from "@/lib/domain/metric-resolution";
import { METRIC_DEFINITIONS } from "@/lib/domain/metric-resolution";
import { StatusBadge } from "@/components/verification/status-badge";

const SERIES: MetricId[] = [
  "dues_collected",
  "base_operating_expenses",
  "special_assessment_collected",
  "cash",
];

const COLORS: Record<string, string> = {
  dues_collected: "#0f766e",
  base_operating_expenses: "#1e3a5f",
  special_assessment_collected: "#b45309",
  cash: "#475569",
};

type Row = {
  periodLabel: string;
  meta: Partial<Record<MetricId, TrendPoint>>;
} & Partial<Record<MetricId, number | null>>;

export function FinancialTrendChart({ points }: { points: TrendPoint[] }) {
  const router = useRouter();
  const [activeMetric, setActiveMetric] = useState<MetricId | "all">("all");

  const availableMetrics = SERIES.filter((m) =>
    points.some((p) => p.metric === m && p.value != null),
  );

  const rows = useMemo(() => {
    const byPeriod = new Map<string, Row>();
    for (const p of points) {
      if (p.value == null) continue;
      if (activeMetric !== "all" && p.metric !== activeMetric) continue;
      const row = byPeriod.get(p.periodLabel) ?? {
        periodLabel: p.periodLabel,
        meta: {},
      };
      row[p.metric] = p.value;
      row.meta[p.metric] = p;
      byPeriod.set(p.periodLabel, row);
    }
    return [...byPeriod.values()].sort((a, b) =>
      a.periodLabel.localeCompare(b.periodLabel),
    );
  }, [points, activeMetric]);

  if (availableMetrics.length === 0) {
    return (
      <section className="border border-[var(--border)] bg-[var(--surface)] p-6">
        <h2 className="text-sm font-semibold">Financial trend</h2>
        <p className="mt-2 text-sm text-[var(--muted)]">
          No time-series facts available yet. Trends render only for periods
          with recorded data — missing months are not invented.
        </p>
      </section>
    );
  }

  const metricsToPlot =
    activeMetric === "all" ? availableMetrics : [activeMetric];

  return (
    <section className="border border-[var(--border)] bg-[var(--surface)]">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold">Financial trend</h2>
          <p className="text-xs text-[var(--muted)]">
            Sparse series from source facts. Hover for verification; click a
            point to open the fact.
          </p>
        </div>
        <label className="text-xs text-[var(--muted)]">
          Series{" "}
          <select
            className="ml-2 border border-[var(--border)] bg-white px-2 py-1 text-sm text-[var(--foreground)]"
            value={activeMetric}
            onChange={(e) =>
              setActiveMetric(e.target.value as MetricId | "all")
            }
          >
            <option value="all">All available</option>
            {availableMetrics.map((m) => (
              <option key={m} value={m}>
                {METRIC_DEFINITIONS[m].label}
              </option>
            ))}
          </select>
        </label>
      </header>
      <div className="h-72 p-2">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={rows}
            onClick={(state) => {
              const label = state?.activeLabel;
              if (!label) return;
              const row = rows.find((r) => r.periodLabel === label);
              if (!row) return;
              const metric =
                activeMetric === "all" ? availableMetrics[0] : activeMetric;
              const point = row.meta[metric];
              if (point?.factId) {
                router.push(`/app/metrics/${point.metric}?factId=${point.factId}`);
              } else if (metric) {
                router.push(`/app/metrics/${metric}`);
              }
            }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#d8dee6" />
            <XAxis dataKey="periodLabel" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 12 }} />
            <Tooltip
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                return (
                  <div className="border border-[var(--border)] bg-white p-3 text-xs shadow-sm">
                    <p className="font-medium">{label}</p>
                    <ul className="mt-2 space-y-1">
                      {payload.map((entry) => {
                        const metric = entry.dataKey as MetricId;
                        const meta = (
                          entry.payload as Row
                        ).meta[metric];
                        return (
                          <li key={String(entry.dataKey)} className="space-y-1">
                            <p>
                              {METRIC_DEFINITIONS[metric]?.label ?? metric}:{" "}
                              <span className="tabular-nums font-medium">
                                {entry.value == null
                                  ? "Unknown"
                                  : Number(entry.value).toLocaleString("en-US")}
                              </span>
                            </p>
                            {meta ? (
                              <StatusBadge status={meta.verificationStatus} />
                            ) : null}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                );
              }}
            />
            <Legend />
            {metricsToPlot.map((m) => (
              <Line
                key={m}
                type="monotone"
                dataKey={m}
                name={METRIC_DEFINITIONS[m].label}
                stroke={COLORS[m]}
                strokeWidth={2}
                connectNulls={false}
                dot={{ r: 4 }}
                activeDot={{ r: 6 }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
