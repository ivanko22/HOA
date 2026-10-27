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
      period: {
        start: "2026-01-01",
        end: "2026-12-31",
        label: "FY 2026",
      },
      lastVerifiedAt: "2026-03-01",
      verificationStatus: "verified",
      drilldownHref: "/app/ledger?focus=cash",
    },
  },
};

export const UnknownReserve: Story = {
  args: {
    kpi: {
      id: "reserves",
      label: "Reserve Balance",
      value: { amount: null, status: "unknown", currency: "USD" },
      displayValue: "Unknown",
      period: {
        start: "2026-01-01",
        end: "2026-12-31",
        label: "FY 2026",
      },
      lastVerifiedAt: null,
      verificationStatus: "unknown",
      drilldownHref: "/app/ledger?focus=reserves",
    },
  },
};
