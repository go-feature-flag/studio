import type { Decorator, Preview } from "@storybook/react-vite";
import { useEffect } from "react";

import {
  ThemeProvider,
  useTheme,
} from "../src/components/refine-ui/theme/theme-provider";
import "../src/App.css"; // Tailwind v4 entry + OKLch design tokens + .dark variant

type ThemeName = "light" | "dark";

/**
 * Drives the app's ThemeProvider from the Storybook toolbar. We reuse the real
 * provider (rather than addon-themes' `.dark` class toggle) because some
 * components — e.g. CodeBlock — read the theme from this context, not the CSS
 * class. The provider itself applies the `.dark` class to <html>, so plain
 * Tailwind components stay in sync too: one source of truth for both.
 */
function ForceTheme({
  theme,
  children,
}: {
  theme: ThemeName;
  children: React.ReactNode;
}) {
  const { theme: current, setTheme } = useTheme();
  useEffect(() => {
    if (current !== theme) setTheme(theme);
  }, [theme, current, setTheme]);
  return <>{children}</>;
}

const withTheme: Decorator = (Story, context) => {
  const theme = (context.globals.theme as ThemeName) ?? "light";
  return (
    <ThemeProvider defaultTheme={theme}>
      <ForceTheme theme={theme}>
        <div className="bg-background text-foreground min-h-[6rem] p-8">
          <Story />
        </div>
      </ForceTheme>
    </ThemeProvider>
  );
};

const preview: Preview = {
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    a11y: { test: "todo" },
  },
  initialGlobals: { theme: "light" },
  globalTypes: {
    theme: {
      description: "Light / dark theme",
      toolbar: {
        title: "Theme",
        icon: "circlehollow",
        dynamicTitle: true,
        items: [
          { value: "light", title: "Light", icon: "sun" },
          { value: "dark", title: "Dark", icon: "moon" },
        ],
      },
    },
  },
  decorators: [withTheme],
};

export default preview;
