import type { Meta, StoryObj } from "@storybook/react-vite";
import { userEvent, within } from "storybook/test";

import { IDENTITIES, LOADING } from "../../../.storybook/fixtures";
import { FlagsetSettingsPage } from "./settings";

// Tabs are local state, so a story opens one by clicking its nav button.
const openTab =
  (label: string): Story["play"] =>
  async ({ canvasElement }) => {
    await userEvent.click(
      await within(canvasElement).findByRole("button", { name: label }),
    );
  };

const meta = {
  title: "Pages/Flagsets/FlagsetSettingsPage",
  component: FlagsetSettingsPage,
  tags: ["autodocs"],
  parameters: {
    identity: IDENTITIES.teamAdmin,
    route: { path: "/flagsets/:id", url: "/flagsets/fs-web" },
  },
} satisfies Meta<typeof FlagsetSettingsPage>;

export default meta;
type Story = StoryObj<typeof meta>;

// General, testing context, plus the admin-only danger zone.
export const Settings: Story = {};
export const ApiKeys: Story = { play: openTab("API keys") };
export const Context: Story = { play: openTab("Context enrichment") };

// Editors read keys but can't manage them or the flagset.
export const EditorApiKeys: Story = {
  parameters: { identity: IDENTITIES.member },
  play: openTab("API keys"),
};
// Viewers: read-only, no API keys tab.
export const Viewer: Story = { parameters: { identity: IDENTITIES.viewer } };
export const Loading: Story = {
  parameters: { data: { "/flagsets/fs-web": LOADING } },
};
