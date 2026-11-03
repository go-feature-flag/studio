// Shared flag-editing core: types, pure payload helpers, the useFlagForm hook,
// and the editor UI (variations / targeting / default rule). Used by both the
// create wizard (pages/flags/flag-wizard.tsx) and the inline detail editor
// (pages/flags/detail.tsx) so flag-editing logic lives in exactly one place.
//
// The implementation lives in focused sibling modules; this file is the public
// barrel so existing imports of "@/components/flags/flag-form" keep working:
//   - flag-form-types.ts      — form value types (Variation, Outcome, Rule, …)
//   - flag-form-helpers.ts    — pure constants, outcome math, coercion/validation
//   - flag-form-hydration.ts  — payload ⇄ form-state conversion
//   - flag-form-schedule.ts   — scheduledRollout ⇄ schedule steps
//   - use-flag-form.ts        — the useFlagForm editing hook
//   - flag-form-fields.tsx    — shared UI atoms (Field, TYPE_OPTIONS)
//   - variations-editor.tsx   — VariationsEditor
//   - outcome-editor.tsx      — OutcomeEditor
//   - rules-editor.tsx        — RulesEditor
//   - schedule-editor.tsx     — ScheduleEditor

export * from "./flag-form-types";
export * from "./flag-form-helpers";
export * from "./flag-form-hydration";
export * from "./flag-form-schedule";
export * from "./use-flag-form";
export * from "./flag-form-fields";
export * from "./variations-editor";
export * from "./outcome-editor";
export * from "./rules-editor";
export * from "./schedule-editor";
export * from "./tag-input";
