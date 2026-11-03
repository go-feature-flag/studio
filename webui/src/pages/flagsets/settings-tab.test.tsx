import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

vi.mock("@refinedev/core", () => ({
  useTranslate: () => (key: string) => key,
}));

import { SettingsTab } from "./settings-testing-context-tab";

const textarea = () => screen.getByRole("textbox") as HTMLTextAreaElement;

describe("SettingsTab", () => {
  it("renders the value and reports edits", () => {
    const onChange = vi.fn();
    render(<SettingsTab value='{"a":1}' invalid={false} canWrite onChange={onChange} />);
    expect(textarea().value).toBe('{"a":1}');
    fireEvent.change(textarea(), { target: { value: "{}" } });
    expect(onChange).toHaveBeenCalledWith("{}");
  });

  const states = [
    { name: "valid shows the hint", invalid: false, want: "flagset.settings.defaultTestingContextHint" },
    { name: "invalid shows the error", invalid: true, want: "flagset.settings.defaultTestingContextInvalid" },
  ];
  for (const tt of states) {
    it(tt.name, () => {
      render(<SettingsTab value="{" invalid={tt.invalid} canWrite onChange={vi.fn()} />);
      expect(screen.getByText(tt.want)).toBeInTheDocument();
      expect(textarea()).toHaveAttribute("aria-invalid", String(tt.invalid));
    });
  }

  it("is read-only without write access", () => {
    render(<SettingsTab value="{}" invalid={false} canWrite={false} onChange={vi.fn()} />);
    expect(textarea()).toHaveAttribute("readonly");
  });
});
