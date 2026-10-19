import type { Meta, StoryObj } from "@storybook/react-vite";

import { AspectRatio } from "./aspect-ratio";

const meta = {
  title: "UI/AspectRatio",
  component: AspectRatio,
  tags: ["autodocs"],
} satisfies Meta<typeof AspectRatio>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Image: Story = {
  render: () => (
    <div className="w-96">
      <AspectRatio ratio={16 / 9} className="bg-muted overflow-hidden rounded-lg">
        <img
          src="https://images.unsplash.com/photo-1535025183041-0991a977e25b?w=800&dpr=2&q=80"
          alt="Landscape"
          className="size-full object-cover"
        />
      </AspectRatio>
    </div>
  ),
};

export const ColoredBox: Story = {
  render: () => (
    <div className="w-96">
      <AspectRatio
        ratio={16 / 9}
        className="bg-primary/20 text-primary flex items-center justify-center rounded-lg text-sm font-medium"
      >
        16 / 9
      </AspectRatio>
    </div>
  ),
};
