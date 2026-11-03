import type { Meta, StoryObj } from "@storybook/react-vite";
import { userEvent, within } from "storybook/test";

import { LOADING } from "../../../.storybook/fixtures";
import { NotifiersTab } from "./settings-notifiers-tab";

const meta = {
  title: "Pages/Flagsets/NotifiersTab",
  component: NotifiersTab,
  tags: ["autodocs"],
  args: { flagsetId: "fs-web", canManage: true },
} satisfies Meta<typeof NotifiersTab>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Admin: Story = {};
// Editors see the notifiers read-only, with a warning.
export const ReadOnly: Story = { args: { canManage: false } };
export const Empty: Story = { parameters: { data: { "/notifiers": [] } } };
export const Loading: Story = { parameters: { data: { "/notifiers": LOADING } } };
export const AddDialog: Story = {
  play: async ({ canvasElement }) => {
    await userEvent.click(await within(canvasElement).findByRole("button", { name: /add slack notifier/i }));
  },
};
