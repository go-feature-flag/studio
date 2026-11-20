// Shared flag-editing form value types. Extracted from flag-form.tsx so the
// types live in one place, away from the helpers/hook/editor UI that use them.

import type { Dispatch, SetStateAction } from "react";
import type { useTranslate } from "@refinedev/core";
import type { RuleGroupType } from "react-querybuilder";
import type { FlagRule, FlagScheduledStep, FlagType } from "@/types/api";

export type Tr = ReturnType<typeof useTranslate>;

// ── Form value types ────────────────────────────────────────────────────────
export type Variation = { id: number; name: string; value: string };
export type ProgState = {
  initialVariation: string;
  endVariation: string;
  initialPct: number;
  endPct: number;
  startDate: string; // local datetime-local string (YYYY-MM-DDTHH:mm)
  endDate: string; // local datetime-local string (YYYY-MM-DDTHH:mm)
};
export type OutcomeMode = "single" | "percentage" | "progressive";
export type Outcome = {
  mode: OutcomeMode;
  single: string;
  percentages: Record<string, number>;
  prog: ProgState;
};
export type Rule = {
  id: number;
  name: string;
  query: RuleGroupType;
  outcome: Outcome;
};

// A scheduled step changes the flag at a date. Rule changes point at a rule by
// its form id so a rename keeps them attached; the name is written on save.
export type FlagStateChange = "unchanged" | "enable" | "disable";
export type ScheduleStep = {
  id: number;
  date: string; // local datetime-local string (YYYY-MM-DDTHH:mm)
  flagState: FlagStateChange;
  defaultOutcome?: Outcome;
  rules: { ruleId: number; outcome: Outcome }[];
  kept?: KeptStep;
};

// KeptStep is the part of a stored step the editor doesn't show, saved back as loaded.
export type KeptStep = {
  fields: Omit<FlagScheduledStep, "date" | "disable" | "defaultRule" | "targeting">;
  defaultRule?: FlagRule;
  targeting: { ruleId?: number; rule: FlagRule }[];
};

export type FlagFormState = {
  type: FlagType;
  variations: Variation[];
  rules: Rule[];
  defaultOutcome: Outcome;
  schedule: ScheduleStep[];
  // Whether evaluation events for this flag are tracked/exported. GO Feature Flag
  // defaults this to true when the field is omitted from the payload.
  trackEvents: boolean;
  // Reserved keys only (owner/description); custom typed props live in customMetadata.
  metadata: Record<string, unknown>;
  // Non-reserved custom metadata, already coerced to JSON types by the editor.
  customMetadata: Record<string, unknown>;
  // Whether the custom-metadata editor currently holds a valid set of rows.
  customMetaValid: boolean;
};

export type UseFlagForm = {
  type: FlagType;
  variations: Variation[];
  rules: Rule[];
  defaultOutcome: Outcome;
  schedule: ScheduleStep[];
  metadata: Record<string, unknown>;
  customMetadata: Record<string, unknown>;
  trackEvents: boolean;
  variationNames: string[];
  description: string;
  owner: string;
  tags: string[];
  setVariations: Dispatch<SetStateAction<Variation[]>>;
  setRules: Dispatch<SetStateAction<Rule[]>>;
  setDefaultOutcome: (o: Outcome) => void;
  setSchedule: Dispatch<SetStateAction<ScheduleStep[]>>;
  setTrackEvents: (v: boolean) => void;
  setDescription: (v: string) => void;
  setOwner: (v: string) => void;
  setTags: (next: string[]) => void;
  setCustomMetadata: (obj: Record<string, unknown>, valid: boolean) => void;
  valid: boolean;
  isDirty: boolean;
  buildPayload: () => Record<string, unknown>;
  reset: () => void;
};
