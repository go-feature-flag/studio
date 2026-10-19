import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import type { Flagset } from "@/types/api";

// Translate stub resolves real i18n keys so the stat labels ("flags",
// "enabled") render their human strings, matching the convention in
// settings-tab.test.tsx.
vi.mock("@refinedev/core", async () => {
  const en = (await import("@/i18n/locales/en.json")).default as Record<
    string,
    unknown
  >;
  const resolve = (key: string): unknown =>
    key.split(".").reduce<unknown>(
      (o, p) => (o && typeof o === "object" ? (o as never)[p] : undefined),
      en,
    );
  const t = (key: string) => {
    const s = resolve(key);
    return typeof s === "string" ? s : key;
  };
  return { useTranslate: () => t };
});

import { FlagsetCard } from "./flagset-card";

const flagset = (over: Partial<Flagset> = {}): Flagset =>
  ({
    id: "fs-1",
    teamId: "t-1",
    name: "Prod",
    description: "",
    apiKeyCount: 0,
    flagCount: 0,
    enabledFlagCount: 0,
    createdAt: "",
    updatedAt: "",
    ...over,
  }) as Flagset;

const renderCard = (fs: Flagset) =>
  render(
    <MemoryRouter>
      <FlagsetCard fs={fs} editable={false} onDelete={() => {}} />
    </MemoryRouter>,
  );

// Each <Stat> renders value + label as adjacent siblings; assert the value
// sits next to its label so we don't confuse the flags vs enabled stats.
const statValueFor = (label: string): string => {
  const labelEl = screen.getByText(label);
  const valueEl = labelEl.previousElementSibling;
  return valueEl?.textContent ?? "";
};

describe("FlagsetCard stats", () => {
  it("renders flagCount and enabledFlagCount from the flagset (the bug fix)", () => {
    renderCard(flagset({ flagCount: 7, enabledFlagCount: 3 }));
    expect(statValueFor("flags")).toBe("7");
    expect(statValueFor("enabled")).toBe("3");
  });

  it("renders zero counts as '0', not a dash or loading placeholder", () => {
    renderCard(flagset({ flagCount: 0, enabledFlagCount: 0 }));
    expect(statValueFor("flags")).toBe("0");
    expect(statValueFor("enabled")).toBe("0");
    // The pre-fix card hardcoded enabled to "—"; ensure that's gone.
    expect(screen.queryByText("…")).toBeNull();
  });

  it("shows the api key count in the footer", () => {
    renderCard(flagset({ apiKeyCount: 2, flagCount: 1, enabledFlagCount: 1 }));
    expect(screen.getByText("2")).toBeTruthy();
  });
});
