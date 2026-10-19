import type { Meta, StoryObj } from "@storybook/react-vite";
import { toast } from "sonner";

import { Button } from "./button";
import { Toaster } from "./sonner";

const meta = {
  title: "UI/Sonner",
  component: Toaster,
  tags: ["autodocs"],
} satisfies Meta<typeof Toaster>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <>
      <Toaster />
      <Button onClick={() => toast("Event has been created")}>
        Show toast
      </Button>
    </>
  ),
};

export const Variants: Story = {
  render: () => (
    <>
      <Toaster />
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          onClick={() => toast.success("Flag enabled successfully")}
        >
          Success
        </Button>
        <Button
          variant="outline"
          onClick={() => toast.error("Failed to save flag")}
        >
          Error
        </Button>
        <Button
          variant="outline"
          onClick={() =>
            toast("Flag updated", {
              description: "The rollout percentage is now 50%.",
            })
          }
        >
          With description
        </Button>
      </div>
    </>
  ),
};
