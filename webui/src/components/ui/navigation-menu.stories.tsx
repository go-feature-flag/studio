import type { Meta, StoryObj } from "@storybook/react-vite";

import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
} from "./navigation-menu";

const meta = {
  title: "UI/NavigationMenu",
  component: NavigationMenu,
  tags: ["autodocs"],
} satisfies Meta<typeof NavigationMenu>;

export default meta;
type Story = StoryObj<typeof meta>;

const components: { title: string; href: string; description: string }[] = [
  {
    title: "Feature Flags",
    href: "#",
    description: "Toggle features on and off without deploying.",
  },
  {
    title: "Segments",
    href: "#",
    description: "Target groups of users with consistent rules.",
  },
  {
    title: "Experiments",
    href: "#",
    description: "Run A/B tests and measure their impact.",
  },
  {
    title: "Audit Log",
    href: "#",
    description: "Track every change made across your workspace.",
  },
];

export const Default: Story = {
  render: () => (
    <NavigationMenu>
      <NavigationMenuList>
        <NavigationMenuItem>
          <NavigationMenuTrigger>Getting started</NavigationMenuTrigger>
          <NavigationMenuContent>
            <ul className="grid w-[320px] gap-2 p-2">
              <li>
                <NavigationMenuLink href="#">
                  <div className="text-sm font-medium leading-none">
                    Introduction
                  </div>
                  <p className="text-muted-foreground line-clamp-2 text-sm leading-snug">
                    Re-usable components and primitives for the platform.
                  </p>
                </NavigationMenuLink>
              </li>
              <li>
                <NavigationMenuLink href="#">
                  <div className="text-sm font-medium leading-none">
                    Installation
                  </div>
                  <p className="text-muted-foreground line-clamp-2 text-sm leading-snug">
                    How to install dependencies and structure your app.
                  </p>
                </NavigationMenuLink>
              </li>
            </ul>
          </NavigationMenuContent>
        </NavigationMenuItem>
        <NavigationMenuItem>
          <NavigationMenuTrigger>Platform</NavigationMenuTrigger>
          <NavigationMenuContent>
            <ul className="grid w-[400px] gap-2 p-2 md:grid-cols-2">
              {components.map((component) => (
                <li key={component.title}>
                  <NavigationMenuLink href={component.href}>
                    <div className="text-sm font-medium leading-none">
                      {component.title}
                    </div>
                    <p className="text-muted-foreground line-clamp-2 text-sm leading-snug">
                      {component.description}
                    </p>
                  </NavigationMenuLink>
                </li>
              ))}
            </ul>
          </NavigationMenuContent>
        </NavigationMenuItem>
        <NavigationMenuItem>
          <NavigationMenuLink href="#">Documentation</NavigationMenuLink>
        </NavigationMenuItem>
      </NavigationMenuList>
    </NavigationMenu>
  ),
};
