import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";

const h = vi.hoisted(() => ({
  companyId: "c1" as string | null,
  team: { name: "Platform" } as unknown,
  editable: false,
  companyAdmin: false,
}));

vi.mock("@refinedev/core", () => ({
  useTranslate: () => (key: string) => key,
  useCustom: () => ({ query: { data: h.team ? { data: h.team } : undefined } }),
}));
vi.mock("@/hooks/use-active-company", () => ({
  useActiveCompany: () => ({ activeCompanyId: h.companyId }),
}));
vi.mock("@/providers/access-control", () => ({
  canEditTeam: () => h.editable,
  canSync: () => ({ can: h.companyAdmin }),
}));
// The cards have their own tests; stub them to observe the props they get.
vi.mock("./team-details-card", () => ({
  TeamDetailsCard: (p: { teamId: string; editable: boolean }) => <p>details:{p.teamId}:{String(p.editable)}</p>,
}));
vi.mock("./team-members-card", () => ({
  TeamMembersCard: (p: { teamId: string; editable: boolean }) => <p>members:{p.teamId}:{String(p.editable)}</p>,
}));

import { TeamDetailPage } from "./team-detail";

function Location() {
  return <output>{useLocation().pathname}</output>;
}

const renderPage = (path = "/company/teams/t1") =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/" element={<p>home</p>} />
        <Route path="/company/teams" element={<p>teams list</p>} />
        <Route path="/company/teams/:teamId" element={<><TeamDetailPage /><Location /></>} />
        <Route path="/company/teams/:teamId/members" element={<><TeamDetailPage section="members" /><Location /></>} />
        <Route path="/no-param" element={<TeamDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );

beforeEach(() => {
  h.companyId = "c1";
  h.team = { name: "Platform" };
  h.editable = false;
  h.companyAdmin = false;
});

describe("TeamDetailPage", () => {
  const redirects = [
    { name: "no active company redirects to the teams list", companyId: null, path: "/company/teams/t1" },
    { name: "no team id redirects to the teams list", companyId: "c1", path: "/no-param" },
  ];
  for (const tt of redirects) {
    it(tt.name, () => {
      h.companyId = tt.companyId;
      renderPage(tt.path);
      expect(screen.getByText("teams list")).toBeInTheDocument();
    });
  }

  const titles = [
    { name: "shows the team name", team: { name: "Platform" }, want: "Platform" },
    { name: "falls back to a generic title while loading", team: undefined, want: "team.detail.title" },
  ];
  for (const tt of titles) {
    it(tt.name, () => {
      h.team = tt.team;
      renderPage();
      expect(screen.getByRole("heading", { name: tt.want })).toBeInTheDocument();
    });
  }

  const sections = [
    { name: "details section shows only the details card", path: "/company/teams/t1", editable: true, want: "details:t1:true", hidden: "members:t1:true" },
    { name: "members section shows only the members card", path: "/company/teams/t1/members", editable: true, want: "members:t1:true", hidden: "details:t1:true" },
    { name: "read-only team passes editable=false", path: "/company/teams/t1/members", editable: false, want: "members:t1:false", hidden: "details:t1:false" },
  ];
  for (const tt of sections) {
    it(tt.name, () => {
      h.editable = tt.editable;
      renderPage(tt.path);
      expect(screen.getByText(tt.want)).toBeInTheDocument();
      expect(screen.queryByText(tt.hidden)).not.toBeInTheDocument();
    });
  }

  const nav = [
    { name: "members tab links to the members route", from: "/company/teams/t1", click: /^nav\.members/, want: "/company/teams/t1/members" },
    { name: "details tab links back to the team root", from: "/company/teams/t1/members", click: /^nav\.details/, want: "/company/teams/t1" },
  ];
  for (const tt of nav) {
    it(tt.name, async () => {
      const user = userEvent.setup();
      renderPage(tt.from);
      await user.click(screen.getByRole("button", { name: tt.click }));
      expect(screen.getByRole("status")).toHaveTextContent(tt.want);
      expect(screen.getByRole("button", { name: tt.click })).toHaveAttribute("aria-current", "page");
    });
  }

  const access = [
    { name: "company admin sees the company crumbs", admin: true },
    { name: "team member sees no company crumbs", admin: false },
  ];
  for (const tt of access) {
    it(tt.name, () => {
      h.companyAdmin = tt.admin;
      renderPage();
      expect(screen.queryByRole("link", { name: "nav.company" }) !== null).toBe(tt.admin);
      expect(screen.queryByRole("link", { name: "nav.teams" }) !== null).toBe(tt.admin);
    });
  }
});
