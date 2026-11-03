import { describe, expect, it } from "vitest";
import type { AuditEntry, FlagInstance, Flagset } from "@/types/api";
import { dayPart, firstName, flagTotals, staleVariation, targetName } from "./dashboard";

describe("dayPart", () => {
  const tests = [
    { name: "early morning", hour: 0, want: "morning" },
    { name: "late morning", hour: 11, want: "morning" },
    { name: "noon", hour: 12, want: "afternoon" },
    { name: "late afternoon", hour: 17, want: "afternoon" },
    { name: "evening", hour: 18, want: "evening" },
    { name: "night", hour: 23, want: "evening" },
  ];
  for (const tt of tests) {
    it(tt.name, () => {
      expect(dayPart(new Date(2026, 0, 1, tt.hour))).toBe(tt.want);
    });
  }
});

describe("firstName", () => {
  const tests = [
    { name: "first word of the name", input: "Ada Lovelace", email: "ada@acme.dev", want: "Ada" },
    { name: "trims surrounding spaces", input: "  Grace  Hopper ", email: "", want: "Grace" },
    { name: "falls back to the email local part", input: "", email: "linus@acme.dev", want: "linus" },
    { name: "no name at all", input: undefined, email: "", want: "" },
  ];
  for (const tt of tests) {
    it(tt.name, () => {
      expect(firstName(tt.input, tt.email)).toBe(tt.want);
    });
  }
});

describe("flagTotals", () => {
  const fs = (flagCount: number, enabledFlagCount: number) =>
    ({ flagCount, enabledFlagCount }) as Flagset;
  const tests = [
    { name: "no flagsets", input: [], want: { total: 0, enabled: 0, disabled: 0 } },
    { name: "sums across flagsets", input: [fs(14, 9), fs(6, 2)], want: { total: 20, enabled: 11, disabled: 9 } },
  ];
  for (const tt of tests) {
    it(tt.name, () => {
      expect(flagTotals(tt.input)).toEqual(tt.want);
    });
  }
});

describe("staleVariation", () => {
  const flag = (over: Partial<FlagInstance>) =>
    ({ id: "f", name: "f", disabled: false, targetingRuleCount: 0, distribution: { off: 100 }, ...over }) as FlagInstance;
  const tests = [
    { name: "single variation at 100%", input: flag({}), want: "off" },
    { name: "no targetingRuleCount reads as none", input: flag({ targetingRuleCount: undefined }), want: "off" },
    { name: "split distribution", input: flag({ distribution: { on: 50, off: 50 } }), want: undefined },
    { name: "has targeting rules", input: flag({ targetingRuleCount: 1 }), want: undefined },
    { name: "disabled flag", input: flag({ disabled: true }), want: undefined },
    { name: "progressive rollout", input: flag({ distribution: undefined, progressiveRollout: { from: 0, to: 100 } }), want: undefined },
    { name: "no distribution", input: flag({ distribution: undefined }), want: undefined },
  ];
  for (const tt of tests) {
    it(tt.name, () => {
      expect(staleVariation(tt.input)).toBe(tt.want);
    });
  }
});

describe("targetName", () => {
  const entry = (over: Partial<AuditEntry>) =>
    ({ id: 1, occurredAt: "", action: "update", targetType: "flag", targetId: "f-1", ...over }) as AuditEntry;
  const names = new Map([["f-1", "checkout"]]);
  const tests = [
    { name: "live name wins", input: entry({ after: { name: "old" } }), want: "checkout" },
    { name: "snapshot name for a deleted target", input: entry({ targetId: "f-2", before: { name: "gone" } }), want: "gone" },
    { name: "snapshot label for an API key", input: entry({ targetId: "k-1", after: { label: "ci" } }), want: "ci" },
    { name: "falls back to the id", input: entry({ targetId: "x-9" }), want: "x-9" },
  ];
  for (const tt of tests) {
    it(tt.name, () => {
      expect(targetName(tt.input, names)).toBe(tt.want);
    });
  }
});
