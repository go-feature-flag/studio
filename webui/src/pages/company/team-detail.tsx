import type { ReactNode } from "react";
import { useCustom, useTranslate } from "@refinedev/core";
import { SettingsIcon, UsersIcon, UsersRoundIcon } from "lucide-react";
import { Navigate, useNavigate, useParams } from "react-router";
import { ListView } from "@/components/refine-ui/views/list-view";
import { Button } from "@/components/ui/button";
import { TeamDetailsCard } from "./team-details-card";
import { TeamMembersCard } from "./team-members-card";
import { API_URL } from "@/providers/constants";
import { useActiveCompany } from "@/hooks/use-active-company";
import { canEditTeam, canSync } from "@/providers/access-control";
import { cn } from "@/lib/utils";
import type { Team, TeamMember } from "@/types/api";
import { PageBreadcrumb } from "@/components/ui/page-header";

type Section = "details" | "members";

// Same layout as the company page: breadcrumb, title, side nav, and the
// section card. Sections are routes so they can be linked to.
export function TeamDetailPage({ section = "details" }: { section?: Section }) {
  const t = useTranslate();
  const { activeCompanyId } = useActiveCompany();
  const { teamId } = useParams<{ teamId: string }>();
  const navigate = useNavigate();

  const { query } = useCustom<Team>({
    url: `${API_URL}/teams/${teamId}`,
    method: "get",
    queryOptions: { queryKey: ["team", teamId], enabled: !!teamId },
  });
  // Same query key as TeamMembersCard, so the count shares its cache.
  const { query: membersQuery } = useCustom<TeamMember[]>({
    url: `${API_URL}/teams/${teamId}/members`,
    method: "get",
    queryOptions: { queryKey: ["team-members", teamId], enabled: !!teamId },
  });
  const teamName = query.data?.data?.name ?? t("team.detail.title");
  const memberCount = Array.isArray(membersQuery.data?.data)
    ? membersQuery.data!.data.length
    : 0;

  if (!activeCompanyId || !teamId) {
    return <Navigate to="/company/teams" replace />;
  }

  const editable = canEditTeam(teamId);
  const showCompanyCrumbs = canSync("list", { requiresCompanyAdmin: true }).can;
  const basePath = `/company/teams/${teamId}`;
  const tabs: { key: Section; label: string; icon: ReactNode; path: string; count?: number }[] = [
    { key: "details", label: t("nav.details"), icon: <SettingsIcon className="h-4 w-4" />, path: basePath },
    {
      key: "members",
      label: t("nav.members"),
      icon: <UsersIcon className="h-4 w-4" />,
      path: `${basePath}/members`,
      count: memberCount,
    },
  ];

  return (
    <ListView>
      <div className="flex flex-col gap-4">
        <PageBreadcrumb
          items={[
            ...(showCompanyCrumbs
              ? [
                  { label: t("nav.company"), to: "/company" },
                  { label: t("nav.teams"), to: "/company/teams" },
                ]
              : []),
            { label: teamName },
          ]}
        />

        <div className="flex items-center gap-3">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary/10 text-primary">
            <UsersRoundIcon className="h-4 w-4" />
          </span>
          <h1 className="text-2xl font-bold tracking-tight">{teamName}</h1>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-[184px_1fr]">
          <nav className="flex flex-col gap-1 md:sticky md:top-4 md:self-start">
            {tabs.map((tb) => (
              <Button
                key={tb.key}
                variant="ghost"
                aria-current={section === tb.key ? "page" : undefined}
                onClick={() => navigate(tb.path)}
                className={cn(
                  "justify-start font-normal text-muted-foreground",
                  section === tb.key && "bg-muted font-medium text-foreground",
                )}
              >
                {tb.icon}
                {tb.label}
                {tb.count !== undefined && (
                  <span className="ml-auto text-xs tabular-nums text-muted-foreground">{tb.count}</span>
                )}
              </Button>
            ))}
          </nav>

          <div className="min-w-0">
            {section === "members" ? (
              <TeamMembersCard teamId={teamId} editable={editable} />
            ) : (
              <TeamDetailsCard teamId={teamId} editable={editable} />
            )}
          </div>
        </div>
      </div>
    </ListView>
  );
}

TeamDetailPage.displayName = "TeamDetailPage";
