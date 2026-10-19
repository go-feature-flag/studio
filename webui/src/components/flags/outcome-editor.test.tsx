import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import {
  OutcomeEditor,
  newOutcome,
  newProg,
  type Outcome,
  type Tr,
} from "./flag-form";

// t returns the i18n key verbatim, so we can assert on raw keys (matches
// the convention used in rules-editor.test.tsx for the editor components).
const t = ((key: string) => key) as unknown as Tr;

const variationNames = ["on", "off"];

// percentageOutcome builds an Outcome in percentage mode, which is the only
// mode that renders the Tips callout.
const percentageOutcome = (): Outcome => ({
  ...newOutcome(),
  mode: "percentage",
});

describe("OutcomeEditor percentage Tips callout", () => {
  it("shows the Tips callout in edit mode (default)", () => {
    const { queryByText } = render(
      <OutcomeEditor
        t={t}
        variationNames={variationNames}
        outcome={percentageOutcome()}
        onChange={() => {}}
      />,
    );

    expect(queryByText("flag.wizard.percentTips")).not.toBeNull();
  });

  it("hides the Tips callout in creation mode", () => {
    const { queryByText } = render(
      <OutcomeEditor
        t={t}
        variationNames={variationNames}
        outcome={percentageOutcome()}
        onChange={() => {}}
        isCreate
      />,
    );

    expect(queryByText("flag.wizard.percentTips")).toBeNull();
  });
});

// progressiveOutcome builds an Outcome in progressive mode, overriding the
// initial/end variation refs (default "" = nothing selected).
const progressiveOutcome = (prog: Partial<Outcome["prog"]> = {}): Outcome => ({
  ...newOutcome(),
  mode: "progressive",
  prog: { ...newProg(), ...prog },
});

describe("OutcomeEditor progressive variation error state", () => {
  it("marks an unselected variation select as aria-invalid", () => {
    const { getAllByRole } = render(
      <OutcomeEditor
        t={t}
        variationNames={variationNames}
        outcome={progressiveOutcome()}
        onChange={() => {}}
      />,
    );

    // Progressive mode renders the initial and end variation triggers as the
    // first two comboboxes, in DOM order: [0] initial, [1] end.
    const [initial, end] = getAllByRole("combobox");
    expect(initial).toHaveAttribute("aria-invalid", "true");
    expect(end).toHaveAttribute("aria-invalid", "true");
  });

  it("does not mark a selected variation select as aria-invalid", () => {
    const { getAllByRole } = render(
      <OutcomeEditor
        t={t}
        variationNames={variationNames}
        outcome={progressiveOutcome({
          initialVariation: "on",
          endVariation: "off",
        })}
        onChange={() => {}}
      />,
    );

    const [initial, end] = getAllByRole("combobox");
    expect(initial).toHaveAttribute("aria-invalid", "false");
    expect(end).toHaveAttribute("aria-invalid", "false");
  });

  // A stale ref (a variation that was renamed/deleted and is no longer in
  // variationNames) is non-empty but invalid: outcomeValid gates saving on
  // names.includes(...), so the error state must match that predicate, not a
  // bare empty-string check.
  it("marks a stale variation ref as aria-invalid", () => {
    const { getAllByRole } = render(
      <OutcomeEditor
        t={t}
        variationNames={variationNames}
        outcome={progressiveOutcome({
          initialVariation: "deleted",
          endVariation: "off",
        })}
        onChange={() => {}}
      />,
    );

    const [initial, end] = getAllByRole("combobox");
    expect(initial).toHaveAttribute("aria-invalid", "true");
    expect(end).toHaveAttribute("aria-invalid", "false");
  });
});
