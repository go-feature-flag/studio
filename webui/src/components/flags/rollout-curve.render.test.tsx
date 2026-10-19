import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

// Resolve real i18n keys so the status pill renders its human string
// ("live"), matching the translate-stub convention used in detail.test.tsx.
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
  const t = (key: string, params?: Record<string, unknown>) => {
    let s = resolve(key);
    if (typeof s !== "string") return key;
    if (params)
      for (const [k, v] of Object.entries(params))
        s = (s as string).replaceAll(`{{${k}}}`, String(v));
    return s as string;
  };
  return { useTranslate: () => t };
});

import { RolloutCurve, RolloutTooltip } from "./rollout-curve";

// A window that brackets "now" so rolloutStatus() resolves to "live" and the
// status pill has a deterministic label to assert on.
const DAY = 86_400_000;
const localDatetime = (ts: number) =>
  new Date(ts - new Date(ts).getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);

const renderCurve = (disabled: boolean) =>
  render(
    <RolloutCurve
      initialVariation="off"
      endVariation="on"
      initialPct={0}
      endPct={100}
      startDate={localDatetime(Date.now() - DAY)}
      endDate={localDatetime(Date.now() + DAY)}
      variationNames={["on", "off"]}
      disabled={disabled}
    />,
  );

describe("RolloutCurve serving-now status pill", () => {
  it("renders the live status pill when the flag is enabled", () => {
    renderCurve(false);
    // The "Serving now" card always renders; the status pill only when enabled.
    expect(screen.getByText("Serving now")).toBeInTheDocument();
    expect(screen.getByText("live")).toBeInTheDocument();
  });

  it("hides the status pill when the flag is disabled", () => {
    renderCurve(true);
    // Card still shows, but the live/scheduled/completed pill is suppressed.
    expect(screen.getByText("Serving now")).toBeInTheDocument();
    expect(screen.queryByText("live")).not.toBeInTheDocument();
  });

  it("shows both variation percentages summing to 100 in the serving-now card", () => {
    // Asymmetric window: now sits 1/4 into a 4-day rollout, so the end
    // variation is at ~25% and the initial variation at the complement ~75%.
    render(
      <RolloutCurve
        initialVariation="off"
        endVariation="on"
        initialPct={0}
        endPct={100}
        startDate={localDatetime(Date.now() - DAY)}
        endDate={localDatetime(Date.now() + 3 * DAY)}
        variationNames={["on", "off"]}
        disabled={false}
      />,
    );
    // Headline = end variation share; secondary line = its 100-complement.
    expect(screen.getByText("25")).toBeInTheDocument();
    expect(screen.getByText("75%")).toBeInTheDocument();
  });
});

describe("RolloutTooltip", () => {
  it("renders both variations with complementary percentages", () => {
    // recharts never fires its inline tooltip callback under jsdom, so the
    // popin is tested via the extracted pure component instead.
    render(
      <RolloutTooltip
        ts={Date.now()}
        pct={56}
        gran="minute"
        color="#0ea5e9"
        endVariation="variation3"
        initialColor="#64748b"
        initialVariation="variation8"
      />,
    );
    expect(screen.getByText("serving variation3")).toBeInTheDocument();
    expect(screen.getByText("56%")).toBeInTheDocument();
    expect(screen.getByText("serving variation8")).toBeInTheDocument();
    expect(screen.getByText("44%")).toBeInTheDocument();
  });

  it("locks the complement at the rollout boundaries", () => {
    // Fully rolled out: end variation 100%, initial variation 0%.
    const { unmount } = render(
      <RolloutTooltip
        ts={Date.now()}
        pct={100}
        gran="minute"
        color="#0ea5e9"
        endVariation="on"
        initialColor="#64748b"
        initialVariation="off"
      />,
    );
    expect(screen.getByText("100%")).toBeInTheDocument();
    expect(screen.getByText("0%")).toBeInTheDocument();
    unmount();

    // Not yet started: end variation 0%, initial variation 100%.
    render(
      <RolloutTooltip
        ts={Date.now()}
        pct={0}
        gran="minute"
        color="#0ea5e9"
        endVariation="on"
        initialColor="#64748b"
        initialVariation="off"
      />,
    );
    expect(screen.getByText("0%")).toBeInTheDocument();
    expect(screen.getByText("100%")).toBeInTheDocument();
  });
});
