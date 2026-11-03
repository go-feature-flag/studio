import { describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useFlagForm } from "./use-flag-form";
import { EMPTY_QUERY, newOutcome } from "./flag-form-helpers";
import { withServe } from "./flag-form-schedule";
import type { Rule, Variation } from "./flag-form-types";
import type { FlagPayload } from "@/types/api";

const payload: FlagPayload = {
  variations: { on: true, off: false },
  defaultRule: { percentage: { on: 30, off: 70 } },
  targeting: [
    {
      name: "beta",
      query: JSON.stringify({ "==": [{ var: "email" }, "a@b.co"] }),
      variation: "on",
    },
  ],
};

const renderForm = (p: FlagPayload = payload) =>
  renderHook(() => useFlagForm(p));

describe("useFlagForm setVariations", () => {
  const tests: {
    name: string;
    update: (prev: Variation[]) => Variation[];
    useUpdater: boolean;
    wantNames: string[];
    wantDefaultPct: Record<string, number>;
    wantRuleSingle: string;
  }[] = [
    {
      name: "updater fn that only edits a value leaves outcomes untouched",
      update: (prev) => prev.map((v) => ({ ...v })),
      useUpdater: true,
      wantNames: ["on", "off"],
      wantDefaultPct: { on: 30, off: 70 },
      wantRuleSingle: "on",
    },
    {
      name: "rename migrates default weights and rule refs",
      update: (prev) =>
        prev.map((v) => (v.name === "on" ? { ...v, name: "enabled" } : v)),
      useUpdater: false,
      wantNames: ["enabled", "off"],
      wantDefaultPct: { enabled: 30, off: 70 },
      wantRuleSingle: "enabled",
    },
    {
      name: "removal drops weights and clears rule refs",
      update: (prev) => prev.filter((v) => v.name !== "on"),
      useUpdater: true,
      wantNames: ["off"],
      wantDefaultPct: { off: 70 },
      wantRuleSingle: "",
    },
  ];

  for (const tt of tests) {
    it(tt.name, () => {
      const { result } = renderForm();
      act(() =>
        result.current.setVariations(
          tt.useUpdater ? tt.update : tt.update(result.current.variations),
        ),
      );
      expect(result.current.variationNames).toEqual(tt.wantNames);
      expect(result.current.defaultOutcome.percentages).toEqual(
        tt.wantDefaultPct,
      );
      expect(result.current.rules[0].outcome.single).toBe(tt.wantRuleSingle);
    });
  }

  it("rejects duplicate or blank variation names", () => {
    const { result } = renderForm();
    act(() =>
      result.current.setVariations((prev) => [
        ...prev,
        { id: 999, name: "off", value: "false" },
      ]),
    );
    expect(result.current.valid).toBe(false);
  });
});

describe("useFlagForm setRules", () => {
  const extraRule = (base: Rule): Rule => ({ ...base, id: 42, name: "gamma" });

  const tests: {
    name: string;
    apply: (set: ReturnType<typeof useFlagForm>["setRules"], rules: Rule[]) => void;
    wantNames: string[];
    wantValid: boolean;
  }[] = [
    {
      name: "updater fn appends a rule",
      apply: (set) => set((prev) => [...prev, extraRule(prev[0])]),
      wantNames: ["beta", "gamma"],
      wantValid: true,
    },
    {
      name: "plain value replaces the rules",
      apply: (set) => set([]),
      wantNames: [],
      wantValid: true,
    },
    {
      name: "a rule with an empty query is invalid",
      apply: (set, rules) => set([{ ...rules[0], query: { ...EMPTY_QUERY } }]),
      wantNames: ["beta"],
      wantValid: false,
    },
    {
      name: "a rule with a blank name is invalid",
      apply: (set, rules) => set([{ ...rules[0], name: "  " }]),
      wantNames: ["  "],
      wantValid: false,
    },
  ];

  for (const tt of tests) {
    it(tt.name, () => {
      const { result } = renderForm();
      act(() => tt.apply(result.current.setRules, result.current.rules));
      expect(result.current.rules.map((r) => r.name)).toEqual(tt.wantNames);
      expect(result.current.valid).toBe(tt.wantValid);
      expect(result.current.isDirty).toBe(true);
    });
  }
});

describe("useFlagForm metadata accessors", () => {
  const tests: {
    name: string;
    metadata: Record<string, unknown>;
    wantDescription: string;
    wantOwner: string;
    wantTags: string[];
  }[] = [
    {
      name: "string values pass through",
      metadata: { description: "d", owner: "o", tags: ["a", "b"] },
      wantDescription: "d",
      wantOwner: "o",
      wantTags: ["a", "b"],
    },
    {
      name: "non-string values and non-array tags coerce to empty",
      metadata: { description: 5, owner: false, tags: "legacy" },
      wantDescription: "",
      wantOwner: "",
      wantTags: [],
    },
    {
      name: "non-string tag entries are filtered out",
      metadata: { tags: ["a", 1, null, "b"] },
      wantDescription: "",
      wantOwner: "",
      wantTags: ["a", "b"],
    },
  ];

  for (const tt of tests) {
    it(tt.name, () => {
      const { result } = renderForm({ ...payload, metadata: tt.metadata });
      expect(result.current.description).toBe(tt.wantDescription);
      expect(result.current.owner).toBe(tt.wantOwner);
      expect(result.current.tags).toEqual(tt.wantTags);
    });
  }

  it("setTags stores the tags and marks the form dirty", () => {
    const { result } = renderForm();
    act(() => result.current.setTags(["x", "y"]));
    expect(result.current.tags).toEqual(["x", "y"]);
    expect(result.current.isDirty).toBe(true);
    expect(
      (result.current.buildPayload() as { metadata?: { tags?: string[] } })
        .metadata?.tags,
    ).toEqual(["x", "y"]);
  });
});

describe("useFlagForm keeps fields it does not edit", () => {
  const unmanaged = {
    experimentation: {
      start: "2026-11-01T00:00:00Z",
      end: "2026-12-01T00:00:00Z",
    },
    scheduledRollout: [
      { date: "2026-11-15T00:00:00.000Z", defaultRule: { variation: "on" } },
    ],
    bucketingKey: "accountId",
    version: "1.2.0",
  };
  const stored = { ...payload, ...unmanaged } as FlagPayload;

  it("saves them unchanged after an unrelated edit", () => {
    const { result } = renderForm(stored);
    act(() => result.current.setDescription("new description"));
    expect(result.current.buildPayload()).toMatchObject({
      ...unmanaged,
      metadata: { description: "new description" },
    });
  });

  it("is not dirty before any edit", () => {
    const { result } = renderForm(stored);
    expect(result.current.isDirty).toBe(false);
  });

  it("never sends disable, which the server rejects in the payload", () => {
    const { result } = renderForm({ ...payload, disable: true });
    expect(result.current.buildPayload()).not.toHaveProperty("disable");
  });
});

describe("useFlagForm schedule", () => {
  const scheduledRollout = [
    { date: "2026-11-15T00:00:00.000Z", targeting: [{ name: "beta", variation: "off" }] },
  ];
  const stored: FlagPayload = { ...payload, scheduledRollout };

  it("hydrates an editable schedule and is not dirty", () => {
    const { result } = renderForm(stored);
    expect(result.current.schedule).toHaveLength(1);
    expect(result.current.isDirty).toBe(false);
    expect(result.current.buildPayload().scheduledRollout).toEqual(scheduledRollout);
  });

  it("marks the form dirty when a step changes", () => {
    const { result } = renderForm(stored);
    act(() =>
      result.current.setSchedule((ss) => ss.map((s) => ({ ...s, flagState: "enable" }))),
    );
    expect(result.current.isDirty).toBe(true);
    expect(result.current.buildPayload().scheduledRollout).toEqual([
      { ...scheduledRollout[0], disable: false },
    ]);
  });

  it("drops a step's serve changes when it turns the flag off", () => {
    const { result } = renderForm(stored);
    act(() =>
      result.current.setSchedule((ss) => ss.map((s) => ({ ...s, flagState: "disable" }))),
    );
    expect(result.current.valid).toBe(true);
    expect(result.current.buildPayload().scheduledRollout).toEqual([
      { date: scheduledRollout[0].date, disable: true },
    ]);
  });

  it("saves an in-place edit as the difference from the step before", () => {
    const { result } = renderForm(stored);
    const beta = result.current.rules[0].id;
    const names = result.current.variationNames;
    act(() =>
      result.current.setSchedule((ss) =>
        ss.map((s) => withServe(s, "default", newOutcome("on"), result.current.defaultOutcome, names)),
      ),
    );
    act(() =>
      result.current.setSchedule((ss) =>
        ss.map((s) => withServe(s, beta, newOutcome("on"), newOutcome("on"), names)),
      ),
    );
    expect(result.current.buildPayload().scheduledRollout).toEqual([
      { date: scheduledRollout[0].date, defaultRule: { percentage: { on: 100, off: 0 } } },
    ]);
  });

  it("is invalid while a step has no change", () => {
    const { result } = renderForm(stored);
    act(() => result.current.setSchedule((ss) => ss.map((s) => ({ ...s, rules: [] }))));
    expect(result.current.valid).toBe(false);
  });

  it("drops the scheduledRollout key once every step is removed", () => {
    const { result } = renderForm(stored);
    act(() => result.current.setSchedule([]));
    expect(result.current.buildPayload()).not.toHaveProperty("scheduledRollout");
  });

  it("prunes changes to a removed rule", () => {
    const { result } = renderForm(stored);
    act(() => result.current.setRules([]));
    expect(result.current.schedule[0].rules).toEqual([]);
  });

  it("follows a renamed rule", () => {
    const { result } = renderForm(stored);
    act(() => result.current.setRules((rs) => rs.map((r) => ({ ...r, name: "early" }))));
    expect(result.current.buildPayload().scheduledRollout).toEqual([
      { ...scheduledRollout[0], targeting: [{ name: "early", variation: "off" }] },
    ]);
  });

  const keptStep = [
    {
      date: "2026-11-15T00:00:00.000Z",
      variations: { on: true },
      targeting: [{ name: "beta", variation: "off" }],
    },
  ];

  it("renames a rule in a step with other changes", () => {
    const { result } = renderForm({ ...payload, scheduledRollout: keptStep });
    act(() => result.current.setRules((rs) => rs.map((r) => ({ ...r, name: "early" }))));
    expect(result.current.buildPayload().scheduledRollout).toEqual([
      { ...keptStep[0], targeting: [{ name: "early", variation: "off" }] },
    ]);
  });

  it("drops a removed rule's changes from a step with other changes", () => {
    const { result } = renderForm({ ...payload, scheduledRollout: keptStep });
    act(() => result.current.setRules([]));
    expect(result.current.buildPayload().scheduledRollout).toEqual([
      { date: "2026-11-15T00:00:00.000Z", variations: { on: true } },
    ]);
  });

  it("keeps a step that adds a rule the flag doesn't have", () => {
    const adds = [
      { date: "2026-11-15T00:00:00.000Z", targeting: [{ name: "new", query: "a eq 1", variation: "on" }] },
    ];
    const { result } = renderForm({ ...payload, scheduledRollout: adds });
    act(() => result.current.setDescription("x"));
    expect(result.current.buildPayload().scheduledRollout).toEqual(adds);
  });

  it("keeps other step changes, stays clean and edits around them", () => {
    const other = [{ date: "2026-11-15T00:00:00.000Z", variations: { on: false } }];
    const { result } = renderForm({ ...payload, scheduledRollout: other });
    expect(result.current.isDirty).toBe(false);
    expect(result.current.valid).toBe(true);
    expect(result.current.buildPayload().scheduledRollout).toEqual(other);
    act(() =>
      result.current.setSchedule((ss) => ss.map((s) => ({ ...s, flagState: "disable" }))),
    );
    expect(result.current.buildPayload().scheduledRollout).toEqual([
      { ...other[0], disable: true },
    ]);
  });
});
