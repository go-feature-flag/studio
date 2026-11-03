// ScheduleEditor renders the flag's scheduled rollout as a timeline of dated
// steps. Each step shows the whole flag as it will be on that date; editing it
// stores only what differs from the step before.

import { useState, type Dispatch, type SetStateAction } from "react";
import { ChevronDownIcon, PlusIcon, RotateCcwIcon, Trash2Icon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { DistributionBar } from "./distribution-bar";
import { localMidnight } from "./flag-form-helpers";
import {
  SCHEDULE_OUTCOME_MODES,
  STEP_STATUS_VARIANT,
  asServed,
  initialResult,
  keepsChanges,
  newScheduleStep,
  schedulable,
  scheduleStepValid,
  sortedSteps,
  stepResults,
  stepStatuses,
  withFlagState,
  withServe,
  type StepResult,
  type StepStatus,
  type Target,
} from "./flag-form-schedule";
import type { Outcome, Rule, ScheduleStep, Tr } from "./flag-form-types";
import { OutcomeEditor } from "./outcome-editor";
import { VariationPill } from "./variation-pill";

const TIME_ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone;

const toMs = (d: string) => new Date(d).getTime();

// nextStepDate proposes midnight the day after the latest step (or tomorrow).
function nextStepDate(steps: ScheduleStep[]): string {
  const last = sortedSteps(steps).at(-1)?.date;
  const base = last && !Number.isNaN(toMs(last)) ? new Date(last) : new Date();
  base.setDate(base.getDate() + 1);
  return localMidnight(base);
}

export function ScheduleEditor({
  t,
  variationNames,
  rules,
  defaultOutcome,
  schedule,
  setSchedule,
  flagOff,
}: {
  t: Tr;
  variationNames: string[];
  rules: Rule[];
  defaultOutcome: Outcome;
  schedule: ScheduleStep[];
  setSchedule: Dispatch<SetStateAction<ScheduleStep[]>>;
  flagOff: boolean;
}) {
  const steps = sortedSteps(schedule);
  const statuses = stepStatuses(steps.map((s) => s.date));
  const variations = variationNames.map((name, id) => ({ id, name, value: "" }));
  const results = stepResults({ variations, rules, defaultOutcome, schedule }, flagOff);
  const start = initialResult({ rules, defaultOutcome }, flagOff);
  const nowAt = statuses.filter((s) => s === "applied").length;
  const set = (s: ScheduleStep) => setSchedule((ss) => ss.map((x) => (x.id === s.id ? s : x)));
  const add = (date: string) => setSchedule((ss) => [...ss, newScheduleStep(date)]);
  const remove = (id: number) => setSchedule((ss) => ss.filter((s) => s.id !== id));
  const addButton = (
    <Button variant="outline" size="sm" className="w-fit" onClick={() => add(nextStepDate(schedule))}>
      <PlusIcon className="h-4 w-4" />
      {t("flag.detail.schedule.addStep")}
    </Button>
  );
  const now = (
    <li
      key="now"
      aria-hidden
      className="relative flex items-center gap-2 text-2xs font-semibold uppercase tracking-wide text-primary"
    >
      <span className="absolute -left-[1.25rem] h-2 w-2 rounded-full bg-primary" />
      {t("flag.detail.schedule.now")}
      <span className="h-px flex-1 bg-primary/40" />
    </li>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">{t("flag.detail.schedule.title")}</CardTitle>
        <CardDescription>
          {t("flag.detail.schedule.subtitle")} {t("flag.detail.schedule.timeZone", { timeZone: TIME_ZONE })}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {steps.length === 0 ? (
          <EmptyState variant="inline" className="flex flex-col items-center gap-3">
            {t("flag.detail.schedule.empty")}
            {addButton}
          </EmptyState>
        ) : (
          <div className="flex flex-col gap-3">
            <ol className="relative flex flex-col gap-3 pl-6 before:absolute before:bottom-3 before:left-2 before:top-3 before:w-px before:bg-border">
              {steps.flatMap((s, i) => {
                const item = (
                  <StepEditor
                    key={s.id}
                    t={t}
                    step={s}
                    status={statuses[i]}
                    before={results[i - 1] ?? start}
                    after={results[i]}
                    variationNames={variationNames}
                    rules={rules}
                    defaultOutcome={defaultOutcome}
                    onChange={set}
                    onRemove={() => remove(s.id)}
                  />
                );
                return i === nowAt ? [now, item] : [item];
              })}
              {nowAt === steps.length && now}
            </ol>
            {addButton}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function StepEditor({
  t,
  step,
  status,
  before,
  after,
  variationNames,
  rules,
  defaultOutcome,
  onChange,
  onRemove,
}: {
  t: Tr;
  step: ScheduleStep;
  status: StepStatus;
  before: StepResult;
  after: StepResult;
  variationNames: string[];
  rules: Rule[];
  defaultOutcome: Outcome;
  onChange: (s: ScheduleStep) => void;
  onRemove: () => void;
}) {
  const [open, setOpen] = useState(status !== "applied");
  const invalid = !scheduleStepValid(step, { rules, defaultOutcome }, variationNames);
  const more = keepsChanges(step);
  const turnsOff = step.flagState === "disable";
  const empty =
    step.flagState === "unchanged" && !step.defaultOutcome && step.rules.length === 0 && !more;
  const keptRules = new Set((step.kept?.targeting ?? []).map((k) => k.ruleId));
  const stored = new Map(step.rules.map((c) => [c.ruleId, c.outcome]));
  const rows = [
    {
      target: "default" as Target,
      label: t("flag.wizard.defaultRule"),
      outcome: after.defaultOutcome,
      own: step.defaultOutcome,
      from: before.defaultOutcome,
      changed: !!step.defaultOutcome,
      kept: !!step.kept?.defaultRule,
      ok: schedulable(defaultOutcome),
    },
    ...after.rules.map(({ rule, outcome }, i) => ({
      target: rule.id as Target,
      label: rule.name,
      outcome,
      own: stored.get(rule.id),
      from: before.rules[i].outcome,
      changed: stored.has(rule.id),
      kept: keptRules.has(rule.id),
      ok: schedulable(rule.outcome),
    })),
  ];
  const serve = (target: Target, o: Outcome, from: Outcome) =>
    onChange(withServe(step, target, o, from, variationNames));

  return (
    <li
      className={cn(
        "relative rounded-md border p-3",
        status === "applied" && "bg-muted/30",
        invalid && "border-destructive/60",
      )}
    >
      <span
        className={cn(
          "absolute -left-[1.3rem] top-5 h-2.5 w-2.5 rounded-full border-2 bg-background",
          status === "applied" ? "border-muted-foreground bg-muted-foreground" : "border-primary",
        )}
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          aria-expanded={open}
          aria-label={t("flag.detail.schedule.toggleStep")}
          onClick={() => setOpen(!open)}
        >
          <ChevronDownIcon className={cn("h-4 w-4 transition-transform", !open && "-rotate-90")} />
        </Button>
        <Input
          key={step.date}
          type="datetime-local"
          aria-label={t("flag.wizard.date")}
          className="h-8 w-56 text-xs"
          defaultValue={step.date}
          onBlur={(e) => e.target.value !== step.date && onChange({ ...step, date: e.target.value })}
          onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
        />
        <label
          className={cn(
            "flex items-center gap-2 text-xs",
            step.flagState !== "unchanged" && "font-medium text-primary",
          )}
        >
          <Switch
            aria-label={t("flag.detail.schedule.flagState")}
            checked={!after.off}
            onCheckedChange={(on) => onChange(withFlagState(step, !on, before.off))}
          />
          {t(`flag.detail.schedule.flag.${after.off ? "off" : "on"}`)}
        </label>
        {status === "next" && (
          <Badge variant={STEP_STATUS_VARIANT[status]}>
            {t(`flag.detail.schedule.status.${status}`)}
          </Badge>
        )}
        <div className="ml-auto flex items-center">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={onRemove}
            aria-label={t("flag.detail.schedule.removeStep")}
          >
            <Trash2Icon className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {open ? (
        <div className="mt-3 flex flex-col gap-3">
          {turnsOff ? (
            <p className="text-2xs text-muted-foreground">{t("flag.detail.schedule.offNote")}</p>
          ) : (
            <div className="flex flex-col gap-2">
              {rows.map((r) => (
                <ServeRow
                  key={r.target}
                  t={t}
                  label={r.label}
                  outcome={r.outcome}
                  editing={r.own ?? asServed(r.outcome, variationNames)}
                  changed={r.changed || r.kept}
                  locked={
                    r.kept
                      ? t("flag.detail.schedule.keptLocked")
                      : !r.ok
                        ? t("flag.detail.schedule.progressiveLocked")
                        : undefined
                  }
                  variationNames={variationNames}
                  onChange={(o) => serve(r.target, o, r.from)}
                  onReset={r.changed ? () => serve(r.target, r.from, r.from) : undefined}
                />
              ))}
            </div>
          )}
          {more && (
            <p className="text-2xs text-muted-foreground">
              {t("flag.detail.schedule.moreChanges")}
            </p>
          )}
          {empty && (
            <p className="text-2xs text-destructive">{t("flag.detail.schedule.stepEmpty")}</p>
          )}
        </div>
      ) : (
        <StepSummary
          t={t}
          step={step}
          rows={rows.filter((r) => r.changed || r.kept)}
          variationNames={variationNames}
        />
      )}
    </li>
  );
}

// ServeRow is one rule as served on the step's date: a single line, opened to edit.
function ServeRow({
  t,
  label,
  outcome,
  editing: value,
  changed,
  locked,
  variationNames,
  onChange,
  onReset,
}: {
  t: Tr;
  label: string;
  outcome: Outcome;
  editing: Outcome;
  changed: boolean;
  locked?: string;
  variationNames: string[];
  onChange: (o: Outcome) => void;
  onReset?: () => void;
}) {
  const [open, setOpen] = useState(changed && !locked);
  const editing = open && !locked;
  return (
    <div className={cn("rounded-md border", changed && "border-primary/50")}>
      <div className="flex min-h-10 items-center gap-3 px-3 py-1.5">
        <span className="w-36 shrink-0 truncate font-mono text-xs">{label}</span>
        {!editing && <ServedOutcome t={t} outcome={outcome} variationNames={variationNames} />}
        <div className="ml-auto flex items-center gap-1">
          {locked && <span className="text-2xs text-muted-foreground">{locked}</span>}
          {onReset && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={onReset}
              aria-label={t("flag.detail.schedule.undoChange", { target: label })}
            >
              <RotateCcwIcon className="h-3.5 w-3.5" />
            </Button>
          )}
          {!locked && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              aria-expanded={open}
              aria-label={t("flag.detail.schedule.editServe", { target: label })}
              onClick={() => setOpen(!open)}
            >
              <ChevronDownIcon
                className={cn("h-3.5 w-3.5 transition-transform", !open && "-rotate-90")}
              />
            </Button>
          )}
        </div>
      </div>
      {editing && (
        <div className="border-t p-3">
          <OutcomeEditor
            t={t}
            variationNames={variationNames}
            outcome={value}
            onChange={onChange}
            modes={SCHEDULE_OUTCOME_MODES}
            isCreate
          />
        </div>
      )}
    </div>
  );
}

// StepSummary is a collapsed step: just what it changes.
function StepSummary({
  t,
  step,
  rows,
  variationNames,
}: {
  t: Tr;
  step: ScheduleStep;
  rows: { label: string; outcome: Outcome }[];
  variationNames: string[];
}) {
  const shown = step.flagState === "disable" ? [] : rows;
  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 pl-10">
      {shown.map((r) => (
        <span key={r.label} className="flex items-center gap-2">
          <span className="font-mono text-xs text-muted-foreground">{r.label}</span>
          <ServedOutcome t={t} outcome={r.outcome} variationNames={variationNames} />
        </span>
      ))}
    </div>
  );
}

function ServedOutcome({
  t,
  outcome,
  variationNames,
}: {
  t: Tr;
  outcome: Outcome;
  variationNames: string[];
}) {
  const o = asServed(outcome, variationNames);
  if (o.mode === "single") {
    return (
      <VariationPill
        name={o.single}
        index={Math.max(0, variationNames.indexOf(o.single))}
        className="w-fit"
      />
    );
  }
  if (o.mode === "percentage") {
    return (
      <div className="flex min-w-0 items-center gap-2">
        <DistributionBar variations={variationNames} percentages={o.percentages} className="w-24" />
        <span className="truncate font-mono text-2xs text-muted-foreground">
          {variationNames.map((n) => `${n} ${o.percentages[n] ?? 0}%`).join(" · ")}
        </span>
      </div>
    );
  }
  return <span className="text-xs text-muted-foreground">{t("flag.wizard.progressive")}</span>;
}
