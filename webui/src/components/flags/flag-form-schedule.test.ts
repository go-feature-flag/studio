import { describe, expect, it } from "vitest";
import {
  asServed,
  buildSchedule,
  hydrateForm,
  hydrateSchedule,
  keepsChanges,
  newOutcome,
  newScheduleStep,
  reconcileSchedule,
  scheduleStepValid,
  sortedSteps,
  stepResults,
  stepStatuses,
  withFlagState,
  withServe,
  type Outcome,
  type ScheduleStep,
} from "./flag-form";
import type { FlagPayload, FlagScheduledStep } from "@/types/api";

const base: FlagPayload = {
  variations: { on: true, off: false },
  targeting: [
    { name: "beta", query: JSON.stringify({ "==": [{ var: "beta" }, true] }), variation: "on" },
    { name: "fr", query: JSON.stringify({ "==": [{ var: "country" }, "FR"] }), percentage: { on: 30, off: 70 } },
    {
      name: "ramp",
      query: JSON.stringify({ "==": [{ var: "x" }, 1] }),
      progressiveRollout: {
        initial: { variation: "off", percentage: 0, date: "2026-01-01T00:00:00.000Z" },
        end: { variation: "on", percentage: 100, date: "2026-02-01T00:00:00.000Z" },
      },
    },
  ],
  defaultRule: { variation: "off" },
};

const split = (on: number, off: number): Outcome => ({
  ...newOutcome(),
  mode: "percentage",
  percentages: { on, off },
});

const withSchedule = (scheduledRollout: FlagScheduledStep[]) => hydrateForm({ ...base, scheduledRollout });

describe("schedule round-trip", () => {
  const tests: { name: string; steps: FlagScheduledStep[] }[] = [
    {
      name: "flag state only",
      steps: [{ date: "2026-03-01T09:00:00.000Z", disable: true }],
    },
    {
      name: "seconds in the date",
      steps: [{ date: "2026-03-01T09:00:30.000Z", disable: true }],
    },
    {
      name: "default rule single variation",
      steps: [{ date: "2026-03-01T09:00:00.000Z", defaultRule: { variation: "on" } }],
    },
    {
      name: "split rule moved to one variation is a full split",
      steps: [{ date: "2026-03-01T09:00:00.000Z", targeting: [{ name: "fr", percentage: { on: 100, off: 0 } }] }],
    },
    {
      name: "default split then single stays a full split",
      steps: [
        { date: "2026-03-01T09:00:00.000Z", defaultRule: { percentage: { on: 50, off: 50 } } },
        { date: "2026-03-02T09:00:00.000Z", defaultRule: { percentage: { on: 100, off: 0 } } },
      ],
    },
    {
      name: "several changes in one step",
      steps: [
        {
          date: "2026-03-01T09:00:00.000Z",
          disable: false,
          defaultRule: { percentage: { on: 20, off: 80 } },
          targeting: [{ name: "beta", variation: "off" }],
        },
      ],
    },
  ];

  for (const tt of tests) {
    it(tt.name, () => {
      const form = withSchedule(tt.steps);
      expect(form.schedule.some(keepsChanges)).toBe(false);
      expect(buildSchedule(form)).toEqual(tt.steps);
    });
  }
});

describe("hydrateSchedule keeps what the editor can't show", () => {
  const tests: { name: string; steps: FlagScheduledStep[] }[] = [
    { name: "variations change", steps: [{ date: "2026-03-01T09:00:00.000Z", variations: { on: false } }] },
    {
      name: "query change",
      steps: [{ date: "2026-03-01T09:00:00.000Z", targeting: [{ name: "beta", query: "x eq 1" }] }],
    },
    { name: "unknown rule", steps: [{ date: "2026-03-01T09:00:00.000Z", targeting: [{ name: "nope", variation: "on" }] }] },
    { name: "single variation on a split rule", steps: [{ date: "2026-03-01T09:00:00.000Z", targeting: [{ name: "fr", variation: "on" }] }] },
    { name: "trackEvents", steps: [{ date: "2026-03-01T09:00:00.000Z", trackEvents: false }] },
    { name: "rule without a name", steps: [{ date: "2026-03-01T09:00:00.000Z", targeting: [{ variation: "on" }] }] },
    { name: "rule that serves nothing", steps: [{ date: "2026-03-01T09:00:00.000Z", targeting: [{ name: "beta" }] }] },
    {
      name: "progressive rule",
      steps: [{ date: "2026-03-01T09:00:00.000Z", targeting: [{ name: "ramp", variation: "on" }] }],
    },
    {
      name: "serve changes on a step that turns the flag off",
      steps: [
        {
          date: "2026-03-01T09:00:00.000Z",
          disable: true,
          defaultRule: { variation: "on" },
          targeting: [{ name: "beta", variation: "off" }],
        },
      ],
    },
    {
      name: "same rule twice",
      steps: [
        {
          date: "2026-03-01T09:00:00.000Z",
          targeting: [
            { name: "beta", variation: "off" },
            { name: "beta", variation: "on" },
          ],
        },
      ],
    },
  ];

  for (const tt of tests) {
    it(tt.name, () => {
      expect(buildSchedule(withSchedule(tt.steps))).toEqual(tt.steps);
    });
  }

  it("edits around kept changes", () => {
    const form = withSchedule([
      {
        date: "2026-03-01T09:00:00.000Z",
        variations: { on: false },
        targeting: [{ name: "nope", variation: "on" }],
      },
    ]);
    const [step] = form.schedule;
    expect(keepsChanges(step)).toBe(true);
    const beta = form.rules[0].id;
    const built = buildSchedule({
      ...form,
      schedule: [{ ...step, flagState: "enable", rules: [{ ruleId: beta, outcome: newOutcome("off") }] }],
    });
    expect(built).toEqual([
      {
        date: "2026-03-01T09:00:00.000Z",
        variations: { on: false },
        disable: false,
        targeting: [
          { name: "beta", variation: "off" },
          { name: "nope", variation: "on" },
        ],
      },
    ]);
  });

  it("a kept split counts towards later full-split writes", () => {
    const form = withSchedule([
      {
        date: "2026-03-01T09:00:00.000Z",
        targeting: [{ name: "beta", query: "x eq 1", percentage: { on: 50, off: 50 } }],
      },
    ]);
    const beta = form.rules[0].id;
    const built = buildSchedule({
      ...form,
      schedule: [
        ...form.schedule,
        { ...newScheduleStep("2026-03-02T10:00"), rules: [{ ruleId: beta, outcome: newOutcome("off") }] },
      ],
    });
    expect(built[1].targeting).toEqual([{ name: "beta", percentage: { on: 0, off: 100 } }]);
  });

  it("kept rule changes follow a rename and drop with the rule", () => {
    const form = withSchedule([
      { date: "2026-03-01T09:00:00.000Z", targeting: [{ name: "beta", query: "x eq 1" }] },
    ]);
    const [beta, fr] = form.rules;
    const renamed = { ...form, rules: [{ ...beta, name: "beta-2" }, fr] };
    expect(buildSchedule(renamed)[0].targeting).toEqual([{ name: "beta-2", query: "x eq 1" }]);
    const schedule = reconcileSchedule(form.schedule, [fr], new Map(), new Set(), ["on", "off"]);
    expect(keepsChanges(schedule[0])).toBe(false);
    expect(buildSchedule({ ...form, rules: [fr], schedule })[0]).toEqual({ date: "2026-03-01T09:00:00.000Z" });
    expect(buildSchedule({ ...form, rules: [fr] })[0]).toEqual({ date: "2026-03-01T09:00:00.000Z" });
  });

  it("steps declared out of date order are read in date order", () => {
    const form = withSchedule([
      { date: "2026-03-02T09:00:00.000Z", disable: true },
      { date: "2026-03-01T09:00:00.000Z", disable: false },
    ]);
    expect(buildSchedule(form).map((s) => s.disable)).toEqual([false, true]);
  });

  it("a step without a date stays undated", () => {
    const form = withSchedule([{ disable: true }]);
    expect(form.schedule[0].date).toBe("");
    expect(buildSchedule(form)).toEqual([{ date: "", disable: true }]);
  });

  it("no schedule is empty", () => {
    const form = hydrateForm(base);
    expect(hydrateSchedule(undefined, form)).toEqual([]);
  });
});

describe("buildSchedule", () => {
  it("writes steps in date order and drops changes to removed rules", () => {
    const form = hydrateForm(base);
    const late: ScheduleStep = { ...newScheduleStep("2026-03-05T10:00"), flagState: "disable" };
    const early: ScheduleStep = {
      ...newScheduleStep("2026-03-01T10:00"),
      rules: [
        { ruleId: form.rules[0].id, outcome: newOutcome("off") },
        { ruleId: -1, outcome: newOutcome("off") },
      ],
    };
    const built = buildSchedule({ ...form, schedule: [late, early] });
    expect(built.map((s) => s.date)).toEqual([
      new Date("2026-03-01T10:00").toISOString(),
      new Date("2026-03-05T10:00").toISOString(),
    ]);
    expect(built[0].targeting).toEqual([{ name: "beta", variation: "off" }]);
    expect(built[1]).toEqual({ date: new Date("2026-03-05T10:00").toISOString(), disable: true });
  });

  it("writes a single variation after an earlier split as a full split", () => {
    const form = hydrateForm(base);
    const beta = form.rules[0].id;
    const built = buildSchedule({
      ...form,
      schedule: [
        { ...newScheduleStep("2026-03-01T10:00"), rules: [{ ruleId: beta, outcome: split(50, 50) }] },
        { ...newScheduleStep("2026-03-02T10:00"), rules: [{ ruleId: beta, outcome: newOutcome("off") }] },
      ],
    });
    expect(built[1].targeting).toEqual([{ name: "beta", percentage: { on: 0, off: 100 } }]);
  });
});

describe("scheduleStepValid", () => {
  const form = hydrateForm(base);
  const names = ["on", "off"];
  const [beta, , ramp] = form.rules;
  const tests: { name: string; step: ScheduleStep; want: boolean }[] = [
    { name: "flag state change", step: { ...newScheduleStep("2026-03-01T10:00"), flagState: "enable" }, want: true },
    { name: "no change", step: newScheduleStep("2026-03-01T10:00"), want: false },
    { name: "missing date", step: { ...newScheduleStep(""), flagState: "enable" }, want: false },
    {
      name: "split not summing to 100",
      step: { ...newScheduleStep("2026-03-01T10:00"), defaultOutcome: split(10, 10) },
      want: false,
    },
    {
      name: "rule change",
      step: { ...newScheduleStep("2026-03-01T10:00"), rules: [{ ruleId: beta.id, outcome: split(40, 60) }] },
      want: true,
    },
    {
      name: "progressive rule",
      step: { ...newScheduleStep("2026-03-01T10:00"), rules: [{ ruleId: ramp.id, outcome: newOutcome("on") }] },
      want: false,
    },
    {
      name: "unknown rule",
      step: { ...newScheduleStep("2026-03-01T10:00"), rules: [{ ruleId: -1, outcome: newOutcome("on") }] },
      want: false,
    },
    {
      name: "only kept changes",
      step: {
        ...newScheduleStep("2026-03-01T10:00"),
        kept: { fields: { trackEvents: false }, targeting: [] },
      },
      want: true,
    },
  ];

  for (const tt of tests) {
    it(tt.name, () => {
      expect(scheduleStepValid(tt.step, form, names)).toBe(tt.want);
    });
  }
});

describe("reconcileSchedule", () => {
  it("follows variation renames and prunes removed rules", () => {
    const form = hydrateForm(base);
    const [beta, fr] = form.rules;
    const step: ScheduleStep = {
      ...newScheduleStep("2026-03-01T10:00"),
      defaultOutcome: newOutcome("on"),
      rules: [
        { ruleId: beta.id, outcome: newOutcome("on") },
        { ruleId: fr.id, outcome: newOutcome("on") },
      ],
    };
    const [got] = reconcileSchedule([step], [fr], new Map([["on", "yes"]]), new Set(), ["yes", "off"]);
    expect(got.defaultOutcome?.single).toBe("yes");
    expect(got.rules).toEqual([{ ruleId: fr.id, outcome: newOutcome("yes") }]);
  });
});

describe("stepStatuses", () => {
  it("marks past steps applied and the first future one next", () => {
    const now = new Date("2026-03-10T00:00:00Z").getTime();
    expect(
      stepStatuses(["2026-03-01T00:00:00Z", "2026-03-10T00:00:00Z", "2026-03-11T00:00:00Z", "2026-03-12T00:00:00Z"], now),
    ).toEqual(["applied", "applied", "next", "scheduled"]);
  });

  it("sortedSteps orders by date", () => {
    const a = newScheduleStep("2026-03-02T00:00");
    const b = newScheduleStep("2026-03-01T00:00");
    expect(sortedSteps([a, b])).toEqual([b, a]);
  });
});

describe("stepResults", () => {
  const form = hydrateForm(base);
  const [beta, fr, ramp] = form.rules;
  const at = (date: string, p: Partial<ScheduleStep>): ScheduleStep => ({ ...newScheduleStep(date), ...p });

  it("carries earlier changes into later steps", () => {
    const results = stepResults(
      {
        ...form,
        schedule: [
          at("2026-03-01T10:00", { rules: [{ ruleId: beta.id, outcome: newOutcome("off") }] }),
          at("2026-03-02T10:00", { defaultOutcome: split(20, 80) }),
          at("2026-03-03T10:00", { flagState: "disable" }),
          at("2026-03-04T10:00", { flagState: "enable", defaultOutcome: newOutcome("on") }),
        ],
      },
      false,
    );
    expect(results.map((r) => r.off)).toEqual([false, false, true, false]);
    expect(results[1].rules.find((r) => r.rule.id === beta.id)?.outcome.single).toBe("off");
    expect(results[1].defaultOutcome.percentages).toEqual({ on: 20, off: 80 });
    expect(results[3].defaultOutcome.mode).toBe("percentage");
    expect(results[3].defaultOutcome.percentages).toEqual({ on: 100, off: 0 });
  });

  it("starts from the flag's current state and keeps progressive rules", () => {
    const [r] = stepResults(
      { ...form, schedule: [at("2026-03-01T10:00", { rules: [{ ruleId: fr.id, outcome: split(60, 40) }] })] },
      true,
    );
    expect(r.off).toBe(true);
    expect(r.rules.find((x) => x.rule.id === fr.id)?.outcome.percentages).toEqual({ on: 60, off: 40 });
    expect(r.rules.find((x) => x.rule.id === ramp.id)?.outcome.mode).toBe("progressive");
  });

  it("follows GOFF's merge for kept rule changes", () => {
    const loaded = withSchedule([
      {
        date: "2026-03-01T09:00:00.000Z",
        targeting: [
          { variation: "on" },
          { name: "fr", percentage: { on: -1, off: 100 } },
          { name: "beta", progressiveRollout: { end: { percentage: 50 } } },
        ],
      },
    ]);
    const [r] = stepResults(loaded, false);
    expect(r.rules.find((x) => x.rule.name === "fr")?.outcome.percentages).toEqual({ off: 100 });
    expect(r.rules.find((x) => x.rule.name === "beta")?.outcome.mode).toBe("progressive");
  });

  it("applies kept serve changes too", () => {
    const loaded = withSchedule([
      { date: "2026-03-01T09:00:00.000Z", disable: true, targeting: [{ name: "beta", variation: "off" }] },
      { date: "2026-03-02T09:00:00.000Z", disable: false },
    ]);
    const results = stepResults(loaded, false);
    expect(results[1].rules[0].outcome.single).toBe("off");
  });
});

describe("asServed", () => {
  const names = ["on", "off"];
  const tests: { name: string; in: Outcome; want: Outcome["mode"] }[] = [
    { name: "full split", in: split(100, 0), want: "single" },
    { name: "partial split", in: split(60, 40), want: "percentage" },
    { name: "single", in: newOutcome("on"), want: "single" },
  ];
  for (const tt of tests) {
    it(tt.name, () => expect(asServed(tt.in, names).mode).toBe(tt.want));
  }
  it("reads the served variation", () => expect(asServed(split(0, 100), names).single).toBe("off"));
});

describe("withServe", () => {
  const names = ["on", "off"];
  const at = newScheduleStep("2026-03-01T10:00");
  const tests: {
    name: string;
    step: ScheduleStep;
    target: number | "default";
    outcome: Outcome;
    before: Outcome;
    want: Pick<ScheduleStep, "defaultOutcome" | "rules">;
  }[] = [
    {
      name: "default rule change",
      step: at,
      target: "default",
      outcome: newOutcome("on"),
      before: newOutcome("off"),
      want: { defaultOutcome: newOutcome("on"), rules: [] },
    },
    {
      name: "back to what it served before",
      step: { ...at, defaultOutcome: newOutcome("on") },
      target: "default",
      outcome: newOutcome("off"),
      before: newOutcome("off"),
      want: { defaultOutcome: undefined, rules: [] },
    },
    {
      name: "a full split matches the variation it serves",
      step: at,
      target: 1,
      outcome: newOutcome("on"),
      before: split(100, 0),
      want: { defaultOutcome: undefined, rules: [] },
    },
    {
      name: "a split matches one with the same shares",
      step: at,
      target: 1,
      outcome: { ...newOutcome(), mode: "percentage", percentages: { on: 40 } },
      before: split(40, 0),
      want: { defaultOutcome: undefined, rules: [] },
    },
    {
      name: "a split differs from one missing a share",
      step: at,
      target: 1,
      outcome: split(40, 60),
      before: { ...newOutcome(), mode: "percentage", percentages: { on: 40 } },
      want: { defaultOutcome: undefined, rules: [{ ruleId: 1, outcome: split(40, 60) }] },
    },
    {
      name: "progressive matches progressive",
      step: at,
      target: 1,
      outcome: { ...newOutcome(), mode: "progressive" },
      before: { ...newOutcome(), mode: "progressive" },
      want: { defaultOutcome: undefined, rules: [] },
    },
    {
      name: "new rule change",
      step: at,
      target: 1,
      outcome: split(50, 50),
      before: split(30, 70),
      want: { defaultOutcome: undefined, rules: [{ ruleId: 1, outcome: split(50, 50) }] },
    },
    {
      name: "updates a rule change in place",
      step: { ...at, rules: [{ ruleId: 1, outcome: newOutcome("on") }, { ruleId: 2, outcome: newOutcome("on") }] },
      target: 1,
      outcome: newOutcome("off"),
      before: newOutcome("on"),
      want: {
        defaultOutcome: undefined,
        rules: [{ ruleId: 1, outcome: newOutcome("off") }, { ruleId: 2, outcome: newOutcome("on") }],
      },
    },
    {
      name: "drops a rule change that matches the step before",
      step: { ...at, rules: [{ ruleId: 1, outcome: newOutcome("off") }] },
      target: 1,
      outcome: newOutcome("on"),
      before: newOutcome("on"),
      want: { defaultOutcome: undefined, rules: [] },
    },
  ];
  for (const tt of tests) {
    it(tt.name, () => {
      const got = withServe(tt.step, tt.target, tt.outcome, tt.before, names);
      expect({ defaultOutcome: got.defaultOutcome, rules: got.rules }).toEqual(tt.want);
    });
  }
});

describe("withFlagState", () => {
  const at = newScheduleStep("2026-03-01T10:00");
  const tests: { off: boolean; before: boolean; want: ScheduleStep["flagState"] }[] = [
    { off: true, before: false, want: "disable" },
    { off: false, before: true, want: "enable" },
    { off: true, before: true, want: "unchanged" },
    { off: false, before: false, want: "unchanged" },
  ];
  for (const tt of tests) {
    it(`${tt.before ? "off" : "on"} to ${tt.off ? "off" : "on"}`, () =>
      expect(withFlagState(at, tt.off, tt.before).flagState).toBe(tt.want));
  }
});
