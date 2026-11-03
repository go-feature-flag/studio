// Scheduled rollout: converts between go-feature-flag's scheduledRollout and the
// editor's steps. Pure functions, no React.
//
// GOFF merges each due step into the flag, oldest first. A rule's percentage
// split outranks its variation, and a merge never clears a field, so a step can
// only switch a split rule to one variation by sending a full split (100 / 0).
// buildSchedule tracks which rules carry a split at each step to emit that form.
// Progressive rollouts can't be overridden by a step, so they are not
// schedulable targets.

import {
  buildOutcome,
  isoToLocalInput,
  newOutcome,
  nextId,
  outcomeValid,
  reconcileOutcome,
} from "./flag-form-helpers";
import type {
  FlagFormState,
  KeptStep,
  Outcome,
  OutcomeMode,
  Rule,
  ScheduleStep,
} from "./flag-form-types";
import type { FlagRule, FlagScheduledStep } from "@/types/api";

export const SCHEDULE_OUTCOME_MODES: OutcomeMode[] = ["single", "percentage"];

export const newScheduleStep = (date: string): ScheduleStep => ({
  id: nextId(),
  date,
  flagState: "unchanged",
  rules: [],
});

export function sortedSteps(steps: ScheduleStep[]): ScheduleStep[] {
  return [...steps].sort((a, b) => dateMs(a.date) - dateMs(b.date));
}

const dateMs = (d: string | undefined) => (d ? new Date(d).getTime() : Number.NaN);

// stepsInDateOrder orders stored steps the way GOFF applies them (stable sort).
export const stepsInDateOrder = (steps: FlagScheduledStep[]) =>
  [...steps].sort((a, b) => dateMs(a.date) - dateMs(b.date));

// stepOutcome reads a step's served outcome. A split serving one variation at
// 100% is how buildSchedule writes "serve one variation", so it reads back as one.
function stepOutcome(rule: FlagRule): Outcome | undefined {
  if (rule.variation) return newOutcome(rule.variation);
  if (!rule.percentage) return undefined;
  const split: Outcome = { ...newOutcome(), mode: "percentage", percentages: { ...rule.percentage } };
  return asServed(split, Object.keys(rule.percentage));
}

export type Target = number | "default";

// splitTracker follows which rules carry a split as steps apply in date order.
function splitTracker(form: Pick<FlagFormState, "rules" | "defaultOutcome" | "variations">) {
  const names = form.variations.map((v) => v.name);
  const split = new Map<Target, boolean>([
    ["default", form.defaultOutcome.mode === "percentage"],
    ...form.rules.map((r) => [r.id, r.outcome.mode === "percentage"] as const),
  ]);
  return {
    emit(key: Target, o: Outcome): FlagRule {
      if (o.mode === "percentage") split.set(key, true);
      if (o.mode !== "single" || !split.get(key)) return buildOutcome(o, names) as FlagRule;
      return { percentage: Object.fromEntries(names.map((n) => [n, n === o.single ? 100 : 0])) };
    },
    note(key: Target | undefined, rule: FlagRule) {
      if (key !== undefined && rule.percentage) split.set(key, true);
    },
  };
}

const SERVE_KEYS = new Set(["name", "variation", "percentage"]);

// own returns the outcome the editor can take over, if rebuilding it is lossless.
function own(
  rule: FlagRule,
  key: Target,
  tracker: ReturnType<typeof splitTracker>,
  schedulableTarget: boolean,
): Outcome | undefined {
  const outcome = schedulableTarget && Object.keys(rule).every((k) => SERVE_KEYS.has(k))
    ? stepOutcome(rule)
    : undefined;
  if (outcome) {
    if (canonical(tracker.emit(key, outcome)) === canonical({ ...rule, name: undefined })) {
      return outcome;
    }
  }
  tracker.note(key, rule);
  return undefined;
}

// hydrateSchedule maps stored steps onto the form, keeping what it can't show.
export function hydrateSchedule(
  raw: FlagScheduledStep[] | undefined,
  form: Pick<FlagFormState, "rules" | "defaultOutcome" | "variations">,
): ScheduleStep[] {
  const byName = new Map(form.rules.map((r) => [r.name, r]));
  const tracker = splitTracker(form);
  return stepsInDateOrder(raw ?? []).map(({ date, disable, defaultRule, targeting = [], ...fields }) => {
    const step = newScheduleStep(date ? isoToLocalInput(date) : "");
    const kept: KeptStep = { fields, targeting: [] };
    if (disable !== undefined) step.flagState = disable ? "disable" : "enable";
    // A step that turns the flag off shows no serve changes, so it keeps any it has.
    const serves = disable !== true;
    if (defaultRule) {
      step.defaultOutcome = own(defaultRule, "default", tracker, serves && schedulable(form.defaultOutcome));
      if (!step.defaultOutcome) kept.defaultRule = defaultRule;
    }
    const count = new Map<string, number>();
    for (const r of targeting) count.set(r.name ?? "", (count.get(r.name ?? "") ?? 0) + 1);
    for (const r of targeting) {
      const rule = byName.get(r.name ?? "");
      const ok = serves && !!rule && count.get(rule.name) === 1 && schedulable(rule.outcome);
      const outcome = rule && own(r, rule.id, tracker, ok);
      if (rule && outcome) step.rules.push({ ruleId: rule.id, outcome });
      else kept.targeting.push({ ruleId: rule?.id, rule: r });
    }
    return { ...step, kept };
  });
}

function canonical(v: unknown): string {
  if (v && typeof v === "object") {
    const entries = Object.entries(v as Record<string, unknown>)
      .filter(([, x]) => x !== undefined)
      .sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([k, x]) => `${JSON.stringify(k)}:${canonical(x)}`).join(",")}}`;
  }
  return JSON.stringify(v);
}

// keepsChanges reports whether a step changes more than the editor shows.
export const keepsChanges = (s: ScheduleStep) =>
  !!s.kept &&
  (Object.keys(s.kept.fields).length > 0 || !!s.kept.defaultRule || s.kept.targeting.length > 0);

// buildSchedule assembles scheduledRollout in date order, see the file comment
// for why a single variation is sometimes written as a 100 / 0 split.
export function buildSchedule(
  form: Pick<FlagFormState, "rules" | "defaultOutcome" | "variations" | "schedule">,
): FlagScheduledStep[] {
  const tracker = splitTracker(form);
  const ruleName = new Map(form.rules.map((r) => [r.id, r.name]));
  return sortedSteps(form.schedule).map((s) => {
    const kept = s.kept;
    const out: FlagScheduledStep = { date: s.date ? new Date(s.date).toISOString() : "", ...kept?.fields };
    if (s.flagState !== "unchanged") out.disable = s.flagState === "disable";
    const serves = s.flagState !== "disable";
    if (serves && s.defaultOutcome) out.defaultRule = tracker.emit("default", s.defaultOutcome);
    else if (kept?.defaultRule) {
      tracker.note("default", kept.defaultRule);
      out.defaultRule = kept.defaultRule;
    }
    const targeting: FlagRule[] = s.rules
      .filter((c) => serves && ruleName.has(c.ruleId))
      .map((c) => ({ name: ruleName.get(c.ruleId), ...tracker.emit(c.ruleId, c.outcome) }));
    for (const { ruleId, rule } of kept?.targeting ?? []) {
      if (ruleId !== undefined && !ruleName.has(ruleId)) continue;
      tracker.note(ruleId, rule);
      targeting.push(ruleId === undefined ? rule : { ...rule, name: ruleName.get(ruleId) });
    }
    if (targeting.length > 0) out.targeting = targeting;
    return out;
  });
}

// schedulable reports whether a step may change this outcome: GOFF gives a
// progressive rollout precedence over anything a step merges in.
export const schedulable = (o: Outcome) => o.mode !== "progressive";

export function scheduleStepValid(
  s: ScheduleStep,
  form: Pick<FlagFormState, "rules" | "defaultOutcome">,
  names: string[],
): boolean {
  const changes =
    s.flagState !== "unchanged" || !!s.defaultOutcome || s.rules.length > 0 || keepsChanges(s);
  const rulesById = new Map(form.rules.map((r) => [r.id, r]));
  return (
    changes &&
    !Number.isNaN(dateMs(s.date)) &&
    (s.flagState === "disable" ||
      ((!s.defaultOutcome ||
        (schedulable(form.defaultOutcome) && outcomeValid(s.defaultOutcome, names))) &&
        s.rules.every((c) => {
          const rule = rulesById.get(c.ruleId);
          return !!rule && schedulable(rule.outcome) && outcomeValid(c.outcome, names);
        })))
  );
}

// reconcileSchedule follows variation renames and removals, and removed rules.
export function reconcileSchedule(
  steps: ScheduleStep[],
  rules: Rule[],
  renames: Map<string, string>,
  removed: Set<string>,
  nextNames: string[],
): ScheduleStep[] {
  const ids = new Set(rules.map((r) => r.id));
  const fix = (o: Outcome) => reconcileOutcome(o, renames, removed, nextNames);
  return steps.map((s) => ({
    ...s,
    defaultOutcome: s.defaultOutcome && fix(s.defaultOutcome),
    rules: s.rules.filter((c) => ids.has(c.ruleId)).map((c) => ({ ...c, outcome: fix(c.outcome) })),
    kept: s.kept && {
      ...s.kept,
      targeting: s.kept.targeting.filter((k) => k.ruleId === undefined || ids.has(k.ruleId)),
    },
  }));
}

export type StepResult = {
  off: boolean;
  defaultOutcome: Outcome;
  rules: { rule: Rule; outcome: Outcome }[];
};

// stepResults replays the saved steps in date order, merging the way GOFF does,
// to give what the flag serves once each step applies.
export function stepResults(
  form: Pick<FlagFormState, "rules" | "defaultOutcome" | "variations" | "schedule">,
  off: boolean,
): StepResult[] {
  let { defaultOutcome } = form;
  const byName = new Map(form.rules.map((r) => [r.name, r]));
  const served = new Map(form.rules.map((r) => [r.id, r.outcome]));
  return buildSchedule(form).map((s) => {
    if (s.disable !== undefined) off = s.disable;
    if (s.defaultRule) defaultOutcome = mergeOutcome(defaultOutcome, s.defaultRule);
    for (const r of s.targeting ?? []) {
      const rule = byName.get(r.name ?? "");
      if (rule) served.set(rule.id, mergeOutcome(served.get(rule.id)!, r));
    }
    return {
      off,
      defaultOutcome,
      rules: form.rules.map((rule) => ({ rule, outcome: served.get(rule.id)! })),
    };
  });
}

export const initialResult = (
  form: Pick<FlagFormState, "rules" | "defaultOutcome">,
  off: boolean,
): StepResult => ({
  off,
  defaultOutcome: form.defaultOutcome,
  rules: form.rules.map((rule) => ({ rule, outcome: rule.outcome })),
});

// asServed reads a split serving one variation at 100% as that variation.
export function asServed(o: Outcome, names: string[]): Outcome {
  if (o.mode !== "percentage") return o;
  const full = names.filter((n) => o.percentages[n] === 100);
  const rest = names.every((n) => n === full[0] || !o.percentages[n]);
  return full.length === 1 && rest ? { ...o, mode: "single", single: full[0] } : o;
}

function sameOutcome(x: Outcome, y: Outcome, names: string[]): boolean {
  const [a, b] = [asServed(x, names), asServed(y, names)];
  if (a.mode !== b.mode) return false;
  if (a.mode === "single") return a.single === b.single;
  if (a.mode === "percentage") {
    return names.every((n) => (a.percentages[n] ?? 0) === (b.percentages[n] ?? 0));
  }
  return true;
}

// withServe sets what a step serves for a target, keeping only a change from before.
export function withServe(
  step: ScheduleStep,
  target: Target,
  outcome: Outcome,
  before: Outcome,
  names: string[],
): ScheduleStep {
  const change = sameOutcome(outcome, before, names) ? undefined : outcome;
  if (target === "default") return { ...step, defaultOutcome: change };
  const rest = step.rules.filter((c) => c.ruleId !== target);
  if (!change) return { ...step, rules: rest };
  const has = rest.length < step.rules.length;
  return {
    ...step,
    rules: has
      ? step.rules.map((c) => (c.ruleId === target ? { ...c, outcome: change } : c))
      : [...step.rules, { ruleId: target, outcome: change }],
  };
}

export const withFlagState = (step: ScheduleStep, off: boolean, before: boolean): ScheduleStep => ({
  ...step,
  flagState: off === before ? "unchanged" : off ? "disable" : "enable",
});

// mergeOutcome is GOFF's rule merge seen from what it serves: progressive
// outranks a split, a split outranks a variation, and splits merge per variation.
function mergeOutcome(o: Outcome, r: FlagRule): Outcome {
  if (o.mode === "progressive") return o;
  if (r.progressiveRollout) return { ...o, mode: "progressive" };
  if (r.percentage) {
    const percentages = { ...(o.mode === "percentage" ? o.percentages : {}), ...r.percentage };
    for (const [k, v] of Object.entries(percentages)) if (v < 0) delete percentages[k];
    return { ...o, mode: "percentage", percentages };
  }
  if (r.variation && o.mode === "single") return { ...o, single: r.variation };
  return o;
}

export type StepStatus = "applied" | "next" | "scheduled";

export const STEP_STATUS_VARIANT: Record<StepStatus, "default" | "secondary" | "outline"> = {
  applied: "secondary",
  next: "default",
  scheduled: "outline",
};

// stepStatuses labels steps (in date order) against now: past ones are applied,
// the first future one is next.
export function stepStatuses(dates: (string | undefined)[], now = Date.now()): StepStatus[] {
  let nextSeen = false;
  return dates.map((d) => {
    if (dateMs(d) <= now) return "applied";
    if (nextSeen) return "scheduled";
    nextSeen = true;
    return "next";
  });
}
