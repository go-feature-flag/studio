import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import type { AuditEntry, Flag, FlagInstance, Flagset } from "@/types/api";

const h = vi.hoisted(() => ({
  team: { activeTeamId: "team-1" as string | null },
  canWrite: true,
  useCustom: vi.fn(),
}));

vi.mock("@refinedev/core", () => ({
  // Echo interpolation options so counts and names are assertable.
  useTranslate: () => (key: string, opts?: Record<string, unknown>) =>
    opts ? `${key} ${JSON.stringify(opts)}` : key,
  useCustom: (args: { url: string }) => h.useCustom(args),
  useGetIdentity: () => ({ data: { name: "Ada Lovelace", email: "ada@acme.dev" } }),
}));
vi.mock("@/hooks/use-active-team", () => ({ useActiveTeam: () => h.team }));
vi.mock("@/providers/access-control", () => ({ canWriteTeam: () => h.canWrite }));
vi.mock("@/components/refine-ui/views/list-view", () => ({
  ListView: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import { HomePage } from "./index";

const DAY = 24 * 60 * 60 * 1000;
const iso = (offset: number) => new Date(Date.now() + offset).toISOString();

const flagsets: Flagset[] = [
  { id: "fs-1", name: "web", flagCount: 3, enabledFlagCount: 2, updatedAt: iso(-DAY) } as Flagset,
];
const flag = (over: Partial<FlagInstance> & Pick<FlagInstance, "id" | "name">): FlagInstance => ({
  flagsetId: "fs-1",
  flagsetName: "web",
  type: "boolean",
  disabled: false,
  updatedAt: iso(-DAY),
  ownerId: "u-1",
  ...over,
});
const flags: FlagInstance[] = [
  flag({ id: "f-stale", name: "stale-flag", distribution: { off: 100 }, targetingRuleCount: 0 }),
  flag({ id: "f-roll", name: "roll-flag", ownerId: undefined, progressiveRollout: { from: 0, to: 100 } }),
  flag({ id: "f-split", name: "split-flag", distribution: { a: 50, b: 50 } }),
];
const rollFlag = {
  id: "f-roll",
  payload: {
    defaultRule: {
      progressiveRollout: {
        initial: { variation: "off", percentage: 0, date: iso(-DAY) },
        end: { variation: "on", percentage: 100, date: iso(DAY) },
      },
    },
  },
} as Flag;
const activity: AuditEntry[] = [
  { id: 1, occurredAt: iso(-60_000), actorEmail: "bob@acme.dev", action: "create", targetType: "flag", targetId: "f-stale", flagsetId: "fs-1" },
];

function mockApi() {
  const res = (data: unknown) => ({ query: { data: { data }, isLoading: false } });
  h.useCustom.mockImplementation(({ url }: { url: string }) => {
    if (url.endsWith("/flagsets")) return res(flagsets);
    if (url.includes("/flags?")) return res({ data: flags, total: flags.length });
    if (url.endsWith("/flags/f-roll")) return res(rollFlag);
    if (url.includes("pageSize=1&") || url.endsWith("pageSize=1")) return res({ data: [], total: 7 });
    if (url.includes("/audit?")) return res({ data: activity, total: 1 });
    throw new Error(`unexpected ${url}`);
  });
}

function LocationProbe() {
  const { pathname, search } = useLocation();
  return <div data-testid="loc">{pathname + search}</div>;
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/"]}>
      <LocationProbe />
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="*" element={null} />
      </Routes>
    </MemoryRouter>,
  );
}

const stat = (label: string) => screen.getByText(label).nextElementSibling?.textContent;

beforeEach(() => {
  h.team.activeTeamId = "team-1";
  h.canWrite = true;
  h.useCustom.mockReset();
  mockApi();
});

describe("HomePage", () => {
  it("asks to pick a team when none is active", () => {
    h.team.activeTeamId = null;
    renderPage();
    expect(screen.getByText("home.noTeam")).toBeInTheDocument();
    expect(screen.queryByText("home.stats.flags")).not.toBeInTheDocument();
  });

  it("greets the user by first name", () => {
    renderPage();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent('{"name":"Ada"}');
  });

  it("shows the headline numbers", () => {
    renderPage();
    expect(stat("home.stats.flags")).toBe("3");
    expect(stat("home.stats.rollouts")).toBe("1");
    expect(stat("home.stats.changes")).toBe("7");
    expect(stat("home.stats.stale")).toBe("1");
    expect(screen.getByText('home.stats.flagsDetail {"total":3,"enabled":2,"disabled":1}')).toBeInTheDocument();
  });

  it("asks for attention on stale and unowned flags", () => {
    renderPage();
    expect(screen.getByText('home.attention.stale {"variation":"off"}')).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "home.attention.review" })).toHaveAttribute("href", "/flags/f-stale");
    expect(screen.getByText('home.attention.noOwner {"count":1}')).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "home.attention.view" })).toHaveAttribute("href", "/flags?owner=__unassigned__");
    // f-stale and f-roll are distinct flags, so two need attention.
    expect(screen.getByText(/home.summaryAttention \{"count":2\}/)).toBeInTheDocument();
  });

  it("places running rollouts on their window", () => {
    renderPage();
    expect(screen.getByRole("link", { name: "roll-flag" })).toHaveAttribute("href", "/flags/f-roll");
    expect(screen.getByText("50%")).toBeInTheDocument();
    expect(screen.getByText(/home\.rollouts\.live/)).toBeInTheDocument();
  });

  it("lists recent activity with resolved names", () => {
    renderPage();
    const card = within(screen.getByText("home.activity.title").closest<HTMLElement>("[data-slot=card]")!);
    expect(card.getByText("bob")).toBeInTheDocument();
    expect(card.getByText("stale-flag")).toBeInTheDocument();
    expect(card.getByText(/· web/)).toBeInTheDocument();
  });

  it("lists the team's flagsets", () => {
    renderPage();
    expect(screen.getByRole("link", { name: "web" })).toHaveAttribute("href", "/flagsets/fs-1");
  });

  const jumpTests = [
    { name: "jumps to the highlighted matching flag", type: "ROLL{Enter}", want: "/flags/f-roll" },
    { name: "jumps to a flag picked with the arrows", type: "flag{ArrowDown}{Enter}", want: "/flags/f-roll" },
    { name: "falls back to the flags list without a match", type: "check out{Enter}", want: "/flags?search=check%20out" },
  ];
  for (const tt of jumpTests) {
    it(tt.name, async () => {
      renderPage();
      await userEvent.type(screen.getByRole("combobox", { name: "home.jump" }), tt.type);
      expect(screen.getByTestId("loc")).toHaveTextContent(tt.want);
    });
  }

  it("suggests matching flags and offers the full search", async () => {
    renderPage();
    await userEvent.type(screen.getByRole("combobox", { name: "home.jump" }), "split");
    expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual([
      "split-flag",
      'home.jumpAll {"q":"split"}',
    ]);
    await userEvent.click(screen.getByRole("option", { name: /home\.jumpAll/ }));
    expect(screen.getByTestId("loc")).toHaveTextContent("/flags?search=split");
  });

  const createTests = [
    { name: "offers Create flag to team writers", canWrite: true, want: true },
    { name: "hides Create flag from viewers", canWrite: false, want: false },
  ];
  for (const tt of createTests) {
    it(tt.name, () => {
      h.canWrite = tt.canWrite;
      renderPage();
      const link = screen.queryByRole("link", { name: "nav.create" });
      if (tt.want) expect(link).toHaveAttribute("href", "/flags?create=1");
      else expect(link).not.toBeInTheDocument();
    });
  }
});
