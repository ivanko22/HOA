import type { Meta, StoryObj } from "@storybook/react";
import { KpiCard } from "./kpi-card";

const meta: Meta<typeof KpiCard> = {
  title: "Finance/KpiCard",
  component: KpiCard,
  tags: ["autodocs"],
  parameters: {
    nextjs: { appDirectory: true },
  },
};

export default meta;
type Story = StoryObj<typeof KpiCard>;

export const VerifiedCash: Story = {
  args: {
    kpi: {
      id: "cash",
      label: "Cash",
      value: { amount: "125000.00", status: "verified", currency: "USD" },
      displayValue: "$125,000.00",
      unit: "USD",
      period: {
        start: "2026-01-01",
        end: "2026-12-31",
        label: "FY 2026",
      },
      lastVerifiedAt: "2026-03-01",
      verificationStatus: "verified",
      factId: "fact-1",
      documentId: "doc-1",
      sourceReference: "Bank statement",
      asOfDate: "2026-03-01",
      drilldownHref: "/app/metrics/cash",
    },
  },
};

export const UnknownReserve: Story = {
  args: {
    kpi: {
      id: "reserve_balance",
      label: "Reserve Balance",
      value: { amount: null, status: "unknown", currency: "USD" },
      displayValue: "Unknown",
      unit: "USD",
      period: {
        start: "2026-01-01",
        end: "2026-12-31",
        label: "FY 2026",
      },
      lastVerifiedAt: null,
      verificationStatus: "unknown",
      factId: null,
      documentId: null,
      sourceReference: null,
      asOfDate: null,
      drilldownHref: "/app/metrics/reserve_balance",
    },
  },
};
