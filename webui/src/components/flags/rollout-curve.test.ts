import { describe, expect, it } from "vitest";
import { relativeTime, rolloutPercent, rolloutStatus } from "./rollout-curve";

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

describe("rolloutStatus", () => {
  const start = 1_000;
  const end = 2_000;

  it("is scheduled before the window, live within, completed after", () => {
    expect(rolloutStatus(500, start, end)).toBe("scheduled");
    expect(rolloutStatus(1_500, start, end)).toBe("live");
    expect(rolloutStatus(2_500, start, end)).toBe("completed");
  });

  it("treats the boundaries as live (inclusive window)", () => {
    expect(rolloutStatus(start, start, end)).toBe("live");
    expect(rolloutStatus(end, start, end)).toBe("live");
  });
});

describe("rolloutPercent", () => {
  const tests = [
    { name: "before the window serves the initial share", now: 500, want: 10 },
    { name: "at the start serves the initial share", now: 1_000, want: 10 },
    { name: "midway interpolates linearly", now: 1_500, want: 55 },
    { name: "rounds to a whole percent", now: 1_333, want: 40 },
    { name: "after the window serves the end share", now: 2_500, want: 100 },
  ];
  for (const tt of tests) {
    it(tt.name, () => {
      expect(rolloutPercent(tt.now, 1_000, 2_000, 10, 100)).toBe(tt.want);
    });
  }
});

describe("relativeTime", () => {
  const now = Date.UTC(2026, 0, 1, 12, 0, 0);

  it("picks the largest fitting unit and the future/past direction", () => {
    // Magnitudes avoid ±1 so Intl numeric:"auto" doesn't swap in "tomorrow"/etc.
    expect(relativeTime(now + 6 * DAY, now)).toBe("in 6 days");
    expect(relativeTime(now - 4 * DAY, now)).toBe("4 days ago");
    expect(relativeTime(now + 3 * HOUR, now)).toBe("in 3 hours");
    expect(relativeTime(now + 7 * MIN, now)).toBe("in 7 minutes");
    expect(relativeTime(now + 30 * 1000, now)).toBe("in 30 seconds");
  });

  it("falls back to seconds for sub-minute and zero diffs", () => {
    expect(relativeTime(now, now)).toBe("now");
  });
});
