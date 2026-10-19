import type { Meta, StoryObj } from "@storybook/react-vite";
import { CalendarDays } from "lucide-react";

import { Button } from "./button";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "./hover-card";

const meta = {
  title: "UI/HoverCard",
  component: HoverCard,
  tags: ["autodocs"],
} satisfies Meta<typeof HoverCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <HoverCard>
      <HoverCardTrigger asChild>
        <Button variant="link">@goff</Button>
      </HoverCardTrigger>
      <HoverCardContent>
        <div className="flex flex-col gap-2">
          <h4 className="text-sm font-semibold">GO Feature Flag</h4>
          <p className="text-muted-foreground text-sm">
            Open-source feature flag management for any language.
          </p>
          <div className="text-muted-foreground flex items-center gap-2 text-xs">
            <CalendarDays className="size-4" />
            <span>Joined December 2020</span>
          </div>
        </div>
      </HoverCardContent>
    </HoverCard>
  ),
};

export const DefaultOpen: Story = {
  render: () => (
    <HoverCard open>
      <HoverCardTrigger asChild>
        <Button variant="link">Hover preview</Button>
      </HoverCardTrigger>
      <HoverCardContent>
        Stays open so the content is visible in the docs canvas.
      </HoverCardContent>
    </HoverCard>
  ),
};
