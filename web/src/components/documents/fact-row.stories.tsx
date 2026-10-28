import type { Meta, StoryObj } from "@storybook/react";
import { FactRow } from "./fact-row";

const meta: Meta<typeof FactRow> = {
  title: "Documents/FactRow",
  component: FactRow,
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <table className="w-full text-left text-sm">
        <tbody>
          <Story />
        </tbody>
      </table>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof FactRow>;

export const ReportedExpense: Story = {
  args: {
    id: "1",
    label: "September expenses",
    factType: "operating_expenses",
    value: null,
    numericValue: "108476.00",
    unit: "USD",
    verificationStatus: "reported",
    sourceReference: "Board Meeting Minutes — October 1, 2026",
    periodLabel: "2026-09-01 → 2026-09-30",
  },
};

export const UnknownValue: Story = {
  args: {
    id: "2",
    label: "Cash balance",
    factType: "cash_balance",
    value: null,
    numericValue: null,
    unit: "USD",
    verificationStatus: "unknown",
  },
};
