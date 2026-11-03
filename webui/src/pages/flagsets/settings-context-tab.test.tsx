import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Flagset } from "@/types/api";

vi.mock("@refinedev/core", () => ({
  useTranslate: () => (key: string) => key,
}));

import { ContextTab } from "./settings-context-tab";

const flagset = (enrichment?: Record<string, unknown> | null) =>
  ({ id: "fs-1", name: "prod", evaluationContextEnrichment: enrichment }) as Flagset;
const user = () => userEvent.setup({ pointerEventsCheck: 0 });
const valueInput = () => screen.getByPlaceholderText("flagset.value") as HTMLInputElement;

describe("ContextTab", () => {
  const edits = [
    { name: "reports a valid edit", initial: { region: "eu" }, text: "us", want: [{ region: "us" }, true] },
    { name: "reports an invalid number as invalid", initial: { n: 1 }, text: "abc", want: [{}, false] },
  ];
  for (const tt of edits) {
    it(tt.name, async () => {
      const onChange = vi.fn();
      const u = user();
      render(<ContextTab flagset={flagset(tt.initial)} editorKey={0} canWrite onChange={onChange} />);
      await u.clear(valueInput());
      await u.type(valueInput(), tt.text);
      expect(onChange).toHaveBeenLastCalledWith(...tt.want);
    });
  }

  it("reports an empty object when the flagset has no enrichment", () => {
    const onChange = vi.fn();
    render(<ContextTab flagset={flagset(null)} editorKey={0} canWrite onChange={onChange} />);
    expect(onChange).toHaveBeenCalledWith({}, true);
  });

  it("a new editorKey reseeds the editor from the flagset", async () => {
    const fs = flagset({ region: "eu" });
    const { rerender } = render(<ContextTab flagset={fs} editorKey={0} canWrite onChange={vi.fn()} />);
    await user().type(valueInput(), "-draft");
    rerender(<ContextTab flagset={fs} editorKey={1} canWrite onChange={vi.fn()} />);
    expect(valueInput().value).toBe("eu");
  });

  it("is read-only without write access", () => {
    render(<ContextTab flagset={flagset({ region: "eu" })} editorKey={0} canWrite={false} onChange={vi.fn()} />);
    expect(valueInput()).toBeDisabled();
  });
});
