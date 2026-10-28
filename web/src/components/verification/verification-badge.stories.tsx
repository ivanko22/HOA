import type { Meta, StoryObj } from "@storybook/react";
import { VerificationBadge } from "./verification-badge";
import { verificationStatuses } from "@/lib/domain/enums";

const meta: Meta<typeof VerificationBadge> = {
  title: "Verification/VerificationBadge",
  component: VerificationBadge,
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof VerificationBadge>;

export const AllStatuses: Story = {
  render: () => (
    <div className="flex flex-wrap gap-2">
      {verificationStatuses.map((status) => (
        <VerificationBadge key={status} status={status} />
      ))}
    </div>
  ),
};
