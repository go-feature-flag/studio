import { useState } from "react";
import type { ReactNode } from "react";
import { useCustom, useTranslate } from "@refinedev/core";
import { Link, Navigate, useParams } from "react-router";
import {
  ArrowUpRightIcon,
  FlagIcon,
  KeyRoundIcon,
  SettingsIcon,
  ZapIcon,
} from "lucide-react";
import { ListView } from "@/components/refine-ui/views/list-view";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { GeneralTab } from "./settings-general-tab";
import { ApiKeysTab } from "./settings-api-keys-tab";
import { ContextTab } from "./settings-context-tab";
import { SettingsTab } from "./settings-testing-context-tab";
import { DangerTab } from "./settings-danger-tab";
import { canEditTeam, effectiveTeamRole } from "@/providers/access-control";
import { API_URL } from "@/providers/constants";
import { cn } from "@/lib/utils";
import type { Flagset } from "@/types/api";
import { EmptyState } from "@/components/ui/empty-state";
import { PageBreadcrumb } from "@/components/ui/page-header";

type TabKey = "settings" | "keys" | "context";

export function FlagsetSettingsPage() {
  const t = useTranslate();
  const { id } = useParams<{ id: string }>();
  const [tab, setTab] = useState<TabKey>("settings");

  const { query } = useCustom<Flagset>({
    url: `${API_URL}/flagsets/${id}`,
    method: "get",
    queryOptions: { queryKey: ["flagset", id], enabled: !!id },
  });
  const flagset = query.data?.data;

  if (!id) return <Navigate to="/flagsets" replace />;

  const teamId = flagset?.teamId;
  // All flagset edits (general, context enrichment, API keys, delete) are
  // admin-only.
  const canManage = !!teamId && canEditTeam(teamId); // admin / super-admin
  // Listing API keys needs editor+; viewers don't get the Keys tab.
  const canReadKeys =
    !!teamId && (canEditTeam(teamId) || effectiveTeamRole(teamId) === "editor");
  const shownTab = tab === "keys" && !canReadKeys ? "settings" : tab;

  const allTabs: { key: TabKey; label: string; icon: ReactNode }[] =
    [
      { key: "settings", label: t("flagset.settings.settings"), icon: <SettingsIcon className="h-4 w-4" /> },
      { key: "keys", label: t("flagset.settings.apiKeys"), icon: <KeyRoundIcon className="h-4 w-4" /> },
      { key: "context", label: t("flagset.settings.context"), icon: <ZapIcon className="h-4 w-4" /> },
    ];
  const tabs = allTabs.filter((tb) => tb.key !== "keys" || canReadKeys);

  return (
    <ListView>
      <div className="flex flex-col gap-4">
        <PageBreadcrumb
          items={[
            { label: t("flagset.cardTitle"), to: "/flagsets" },
            { label: flagset?.name ?? t("flagset.settings.title") },
          ]}
        />

        <div className="flex items-center gap-3">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary/10 text-primary">
            <FlagIcon className="h-4 w-4" />
          </span>
          <h1 className="font-mono text-2xl font-bold tracking-tight">
            {flagset?.name ?? "…"}
          </h1>
          {flagset && (
            <Badge
              asChild
              className="bg-primary/10 text-primary [a&]:hover:bg-primary/20"
            >
              <Link to={`/flags?flagset=${id}`}>
                {t("flagset.settings.viewFlags", { count: flagset.flagCount })}
                <ArrowUpRightIcon />
              </Link>
            </Badge>
          )}
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-[184px_1fr]">
          <nav className="flex flex-col gap-1 md:sticky md:top-4 md:self-start">
            {tabs.map((tb) => (
              <Button
                key={tb.key}
                variant="ghost"
                aria-current={shownTab === tb.key ? "true" : undefined}
                onClick={() => setTab(tb.key)}
                className={cn(
                  "justify-start font-normal text-muted-foreground",
                  shownTab === tb.key && "bg-muted font-medium text-foreground",
                )}
              >
                {tb.icon}
                {tb.label}
              </Button>
            ))}
          </nav>

          <div className="min-w-0">
            {!flagset ? (
              <EmptyState>
                {t("common.loading")}
              </EmptyState>
            ) : shownTab === "keys" ? (
              <ApiKeysTab flagsetId={id} canManage={canManage} />
            ) : shownTab === "context" ? (
              <ContextTab flagset={flagset} canWrite={canManage} onSaved={() => query.refetch()} />
            ) : (
              <div className="flex flex-col gap-4">
                <GeneralTab flagset={flagset} canWrite={canManage} onSaved={() => query.refetch()} />
                <SettingsTab flagset={flagset} canWrite={canManage} onSaved={() => query.refetch()} />
                {/* Danger zone (delete flagset) is admin-only. */}
                {canManage && <DangerTab flagset={flagset} />}
              </div>
            )}
          </div>
        </div>
      </div>
    </ListView>
  );
}

FlagsetSettingsPage.displayName = "FlagsetSettingsPage";
