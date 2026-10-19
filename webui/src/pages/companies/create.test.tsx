import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useForm as useRHForm } from "react-hook-form";
import { HttpError } from "@/providers/http";

vi.mock("@refinedev/core", () => ({
  useTranslate: () => (key: string) => key,
}));

// A plain function, not vi.fn: vitest reports a spy's rejected promise as a
// test failure even when the component catches it.
let onFinish: (values: unknown) => Promise<unknown>;
let sent: unknown[];
// Real react-hook-form underneath, with Refine's submit stubbed out.
vi.mock("@refinedev/react-hook-form", () => ({
  useForm: (opts: Parameters<typeof useRHForm>[0]) => ({
    ...useRHForm(opts),
    refineCore: { onFinish: (v: unknown) => onFinish(v), formLoading: false },
  }),
}));

vi.mock("@/components/refine-ui/views/create-view", () => ({
  CreateView: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CreateViewHeader: () => null,
}));

import { CompanyCreatePage } from "./create";

async function fill(email: string) {
  const user = userEvent.setup();
  render(<CompanyCreatePage />);
  await user.type(screen.getByPlaceholderText("companies.create.displayNamePlaceholder"), "Acme");
  if (email) await user.type(screen.getByPlaceholderText("companies.create.adminEmailPlaceholder"), email);
  await user.click(screen.getByRole("button", { name: "companies.create.submit" }));
}

describe("CompanyCreatePage", () => {
  beforeEach(() => {
    sent = [];
    onFinish = async (v) => sent.push(v);
  });

  const tests = [
    { name: "sends the admin email", email: "jane@acme.com", wantSent: true, wantMsg: false },
    { name: "requires the admin email", email: "", wantSent: false, wantMsg: true },
    // type="email" makes the browser block the submit before zod runs.
    { name: "rejects a malformed admin email", email: "jane", wantSent: false, wantMsg: false },
  ];
  for (const tt of tests) {
    it(tt.name, async () => {
      await fill(tt.email);
      if (tt.wantSent) {
        await waitFor(() =>
          expect(sent).toEqual([{ displayName: "Acme", description: "", adminEmail: tt.email }]),
        );
      } else {
        if (tt.wantMsg) {
          expect(await screen.findByText("companies.create.adminEmailRequired")).toBeInTheDocument();
        }
        expect(sent).toEqual([]);
      }
    });
  }

  it("shows the server's adminEmail error on the field", async () => {
    onFinish = () =>
      Promise.reject(new HttpError("validation failed", 400, { adminEmail: ["company admin is required"] }));
    await fill("jane@acme.com");
    expect(await screen.findByText("company admin is required")).toBeInTheDocument();
  });
});
