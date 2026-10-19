import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";

vi.mock("@refinedev/core", () => ({
  useGetIdentity: () => ({
    data: { id: "u1", isSuperAdmin: true },
    isLoading: false,
  }),
}));
vi.mock("@/providers/auth", () => ({ getCachedCompany: () => null }));
vi.mock("@/providers/ui-config", () => ({ isMonoCompany: vi.fn() }));

import { isMonoCompany } from "@/providers/ui-config";
import { OnboardingGuard } from "./onboarding-guard";

const mockMono = isMonoCompany as unknown as ReturnType<typeof vi.fn>;

function renderGuard() {
  render(
    <MemoryRouter initialEntries={["/flags"]}>
      <Routes>
        <Route
          path="/flags"
          element={
            <OnboardingGuard>
              <div>flags page</div>
            </OnboardingGuard>
          }
        />
        <Route path="/onboarding/setup" element={<div>setup page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("OnboardingGuard (super admin without a company)", () => {
  beforeEach(() => mockMono.mockReset());

  it("redirects to /onboarding/setup in mono company mode", () => {
    mockMono.mockReturnValue(true);
    renderGuard();
    expect(screen.getByText("setup page")).toBeInTheDocument();
  });

  it("passes through in multi company mode", () => {
    mockMono.mockReturnValue(false);
    renderGuard();
    expect(screen.getByText("flags page")).toBeInTheDocument();
  });
});
