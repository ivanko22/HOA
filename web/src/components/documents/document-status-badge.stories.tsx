import type { Meta, StoryObj } from "@storybook/react";
import { DocumentStatusBadge } from "./document-status-badge";
import { documentProcessingStatuses } from "@/lib/domain/enums";

const meta: Meta<typeof DocumentStatusBadge> = {
  title: "Documents/DocumentStatusBadge",
  component: DocumentStatusBadge,
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof DocumentStatusBadge>;

export const NeedsReview: Story = { args: { status: "needs_review" } };
export const SourceOnly: Story = { args: { status: "source_only" } };
export const PartiallyVerified: Story = {
  args: { status: "partially_verified" },
};
export const Verified: Story = { args: { status: "verified" } };

export const All: Story = {
  render: () => (
    <div className="flex flex-wrap gap-2">
      {documentProcessingStatuses.map((status) => (
        <DocumentStatusBadge key={status} status={status} />
      ))}
    </div>
  ),
};
