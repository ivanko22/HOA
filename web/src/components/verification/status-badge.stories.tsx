import type { Meta, StoryObj } from "@storybook/react";
import { StatusBadge } from "./status-badge";
import { verificationStatuses } from "@/lib/domain/enums";

const meta: Meta<typeof StatusBadge> = {
  title: "Verification/StatusBadge",
  component: StatusBadge,
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof StatusBadge>;

export const Verified: Story = { args: { status: "verified" } };
export const Reported: Story = { args: { status: "reported" } };
export const Estimated: Story = { args: { status: "estimated" } };
export const NeedsReview: Story = { args: { status: "needs_review" } };
export const Conflicting: Story = { args: { status: "conflicting" } };
export const Unknown: Story = { args: { status: "unknown" } };

export const AllStatuses: Story = {
  render: () => (
    <div className="flex flex-wrap gap-2">
      {verificationStatuses.map((status) => (
        <StatusBadge key={status} status={status} />
      ))}
    </div>
  ),
};
