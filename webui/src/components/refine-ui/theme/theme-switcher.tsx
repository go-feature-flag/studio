"use client";

import { useTheme } from "@/components/refine-ui/theme/theme-provider";
import {
  DropdownMenuPortal,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu";
import { useTranslate } from "@refinedev/core";
import { Monitor, Moon, Sun } from "lucide-react";

type Theme = "dark" | "light" | "system";

const OPTIONS = [
  { value: "dark", Icon: Moon, key: "theme.dark", fallback: "Dark theme" },
  { value: "light", Icon: Sun, key: "theme.light", fallback: "Light theme" },
  {
    value: "system",
    Icon: Monitor,
    key: "theme.system",
    fallback: "Use system setting",
  },
] as const;

// Rendered inside the user dropdown menu, so it is built from menu items: a
// toggle group there is invalid (radios in a menu) and the menu's arrow keys
// skip it, leaving keyboard users no way to change the theme.
export function ThemeSwitcher() {
  const { theme, setTheme } = useTheme();
  const t = useTranslate();
  const Current = OPTIONS.find((o) => o.value === theme)?.Icon ?? Monitor;

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger className="gap-2">
        <Current className="h-4 w-4" />
        {t("theme.label", "Theme")}
      </DropdownMenuSubTrigger>
      <DropdownMenuPortal>
        <DropdownMenuSubContent>
          <DropdownMenuRadioGroup
            value={theme}
            onValueChange={(v) => setTheme(v as Theme)}
          >
            {OPTIONS.map(({ value, Icon, key, fallback }) => (
              <DropdownMenuRadioItem key={value} value={value} className="gap-2">
                <Icon className="h-4 w-4" />
                {t(key, fallback)}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuSubContent>
      </DropdownMenuPortal>
    </DropdownMenuSub>
  );
}

ThemeSwitcher.displayName = "ThemeSwitcher";
