import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

const useList = vi.fn(() => ({
  result: { data: [] },
  query: { isLoading: false },
}));
vi.mock("@refinedev/core", () => ({
  useGetIdentity: () => ({ data: { isSuperAdmin: true } }),
  useList: () => useList(),
  useTranslate: () => (key: string) => key,
}));
vi.mock("@/hooks/use-active-company", () => ({
  useActiveCompany: () => ({
    activeCompanyId: null,
    setActiveCompanyId: vi.fn(),
    isSuperAdmin: true,
  }),
}));
vi.mock("@/providers/ui-config", () => ({ isMonoCompany: vi.fn() }));

import { isMonoCompany } from "@/providers/ui-config";
import { CompanySwitcher } from "./company-switcher";

const mockMono = isMonoCompany as unknown as ReturnType<typeof vi.fn>;

describe("CompanySwitcher", () => {
  beforeEach(() => useList.mockClear());

  it("is hidden and fetches nothing in mono company mode", () => {
    mockMono.mockReturnValue(true);
    const { container } = render(<CompanySwitcher />);
    expect(container).toBeEmptyDOMElement();
    expect(useList).not.toHaveBeenCalled();
  });

  it("renders for a super admin in multi company mode", () => {
    mockMono.mockReturnValue(false);
    render(<CompanySwitcher />);
    expect(screen.getByText("company.switcher.select")).toBeInTheDocument();
  });
});
