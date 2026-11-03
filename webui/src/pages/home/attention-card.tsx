import type { ReactNode } from "react";
import { useTranslate } from "@refinedev/core";
import { Link } from "react-router";
import type { FlagInstance } from "@/types/api";
import { CARD_LIMIT, staleVariation } from "./dashboard";
import { SectionCard, SectionEmpty } from "./section-card";

// AttentionCard lists what a team should act on: flags serving one variation
// to everyone (safe to clean up) and flags nobody owns.
export function AttentionCard({
  stale,
  unowned,
  count,
}: {
  stale: FlagInstance[];
  unowned: number;
  // Distinct flags needing attention (a flag can be both stale and unowned).
  count: number;
}) {
  const t = useTranslate();
  const rows = stale.slice(0, CARD_LIMIT);
  return (
    <SectionCard title={t("home.attention.title")} count={count}>
      {rows.length === 0 && unowned === 0 && (
        <SectionEmpty>{t("home.attention.empty")}</SectionEmpty>
      )}
      <ul className="divide-y">
        {rows.map((f) => (
          <Row
            key={f.id}
            dot="bg-warning"
            title={<code className="font-mono">{f.name}</code>}
            detail={t("home.attention.stale", { variation: staleVariation(f) })}
            to={`/flags/${f.id}`}
            action={t("home.attention.review")}
          />
        ))}
        {unowned > 0 && (
          <Row
            dot="bg-muted-foreground"
            title={t("home.attention.noOwner", { count: unowned })}
            detail={t("home.attention.noOwnerHint")}
            to="/flags?owner=__unassigned__"
            action={t("home.attention.view")}
          />
        )}
      </ul>
    </SectionCard>
  );
}

function Row({
  dot,
  title,
  detail,
  to,
  action,
}: {
  dot: string;
  title: ReactNode;
  detail: string;
  to: string;
  action: string;
}) {
  return (
    <li className="flex items-center gap-3 px-5 py-3">
      <span aria-hidden="true" className={`size-2 shrink-0 rounded-full ${dot}`} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm">{title}</div>
        <div className="truncate text-xs text-muted-foreground">{detail}</div>
      </div>
      <Link to={to} className="text-xs font-medium underline underline-offset-4">
        {action}
      </Link>
    </li>
  );
}
