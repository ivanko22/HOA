import type { Meta, StoryObj } from "@storybook/react";
import { SourceReference } from "./source-reference";

const meta: Meta<typeof SourceReference> = {
  title: "Documents/SourceReference",
  component: SourceReference,
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof SourceReference>;

export const Full: Story = {
  args: {
    page: "3",
    reference: "Board Meeting Minutes — October 1, 2026",
    excerpt: "September expenses totaled $108,476",
    documentHref: "/app/documents/example",
  },
};

export const Empty: Story = { args: {} };
