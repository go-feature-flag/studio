import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";

import { DEFAULT_TESTING_CONTEXT } from "@/components/flags/evaluate-panel";
import { SettingsTab } from "./settings-testing-context-tab";

const meta = {
  title: "Pages/Flagsets/TestingContextTab",
  component: SettingsTab,
  tags: ["autodocs"],
  args: { value: DEFAULT_TESTING_CONTEXT, invalid: false, canWrite: true, onChange: fn() },
} satisfies Meta<typeof SettingsTab>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Editor: Story = {};
export const ReadOnly: Story = { args: { canWrite: false } };
export const Invalid: Story = { args: { value: "{ broken", invalid: true } };
