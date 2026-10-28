import type { Meta, StoryObj } from "@storybook/react";
import { DataCompletenessIndicator } from "./data-completeness-indicator";

const meta: Meta<typeof DataCompletenessIndicator> = {
  title: "DataHealth/DataCompletenessIndicator",
  component: DataCompletenessIndicator,
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof DataCompletenessIndicator>;

export const MeetingMinutes: Story = {
  args: {
    title: "Meeting Minutes completeness",
    items: [
      {
        id: "1",
        year: 2024,
        label: "records available",
        status: "available",
      },
      {
        id: "2",
        year: 2025,
        label: "Not currently available",
        status: "missing",
        notes:
          "Not currently available. This does not imply records never existed.",
      },
      {
        id: "3",
        year: 2026,
        label: "records available",
        status: "available",
      },
    ],
  },
};
