import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { useForm as useRHForm } from "react-hook-form";

const h = vi.hoisted(() => ({ mono: false }));

vi.mock("@refinedev/core", () => ({
  useTranslate: () => (key: string) => key,
  useCustom: () => ({
    query: {
      data: {
        data: [{ id: "u1", companyId: "c1", userId: "u1", email: "jane@acme.com", name: "Jane", role: "member" }],
      },
      refetch: vi.fn(),
    },
  }),
  useCustomMutation: () => ({ mutate: vi.fn() }),
}));
vi.mock("@refinedev/react-hook-form", () => ({ useForm: useRHForm }));
vi.mock("@/providers/ui-config", () => ({ isMonoCompany: () => h.mono }));

import { CompanyMembersCard } from "./members";

describe("CompanyMembersCard remove button", () => {
  const tests = [
    { name: "multi company: members can be removed", mono: false, wantRemove: true },
    { name: "mono company: the server refuses removals, so no button", mono: true, wantRemove: false },
  ];
  for (const tt of tests) {
    it(tt.name, () => {
      h.mono = tt.mono;
      render(<CompanyMembersCard companyId="c1" />);
      expect(screen.getByText("jane@acme.com")).toBeInTheDocument();
      const remove = screen.queryByRole("button", { name: "company.members.removeAria" });
      expect(remove !== null).toBe(tt.wantRemove);
    });
  }
});
