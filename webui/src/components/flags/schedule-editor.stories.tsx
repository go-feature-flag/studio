import { useTranslate } from "@refinedev/core";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";

import { EMPTY_QUERY, localMidnight, newOutcome, nextId } from "./flag-form-helpers";
import { newScheduleStep } from "./flag-form-schedule";
import type { Rule, ScheduleStep } from "./flag-form-types";
import { ScheduleEditor } from "./schedule-editor";

const VARIATIONS = ["enabled", "disabled"];

const RULES: Rule[] = [
  {
    id: nextId(),
    name: "Beta users",
    query: EMPTY_QUERY,
    outcome: newOutcome("enabled"),
  },
  {
    id: nextId(),
    name: "Europe ramp",
    query: EMPTY_QUERY,
    outcome: { ...newOutcome(), mode: "progressive" },
  },
];

const inDays = (days: number) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return localMidnight(d);
};

function StatefulScheduleEditor({ initial }: { initial: ScheduleStep[] }) {
  const t = useTranslate();
  const [schedule, setSchedule] = useState(initial);
  return (
    <ScheduleEditor
      t={t}
      variationNames={VARIATIONS}
      rules={RULES}
      defaultOutcome={newOutcome("disabled")}
      schedule={schedule}
      setSchedule={setSchedule}
      flagOff={false}
    />
  );
}

const meta = {
  title: "Flags/ScheduleEditor",
  component: StatefulScheduleEditor,
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <div className="max-w-3xl">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof StatefulScheduleEditor>;

export default meta;
type Story = StoryObj<typeof meta>;

export const NoSteps: Story = { args: { initial: [] } };
export const Rollout: Story = {
  args: {
    initial: [
      { ...newScheduleStep(inDays(-2)), flagState: "enable" },
      {
        ...newScheduleStep(inDays(3)),
        defaultOutcome: {
          ...newOutcome(),
          mode: "percentage",
          percentages: { enabled: 25, disabled: 75 },
        },
      },
      {
        ...newScheduleStep(inDays(10)),
        defaultOutcome: newOutcome("enabled"),
        rules: [{ ruleId: RULES[0].id, outcome: newOutcome("disabled") }],
      },
    ],
  },
};
export const EmptyStep: Story = { args: { initial: [newScheduleStep(inDays(1))] } };
export const TurnsOff: Story = {
  args: { initial: [{ ...newScheduleStep(inDays(5)), flagState: "disable" }] },
};
