import { useCustom, useTranslate } from "@refinedev/core";
import { Link } from "react-router";
import { Progress } from "@/components/ui/progress";
import {
  relativeTime,
  rolloutPercent,
  rolloutStatus,
} from "@/components/flags/rollout-curve";
import { API_URL } from "@/providers/constants";
import type { Flag, FlagInstance } from "@/types/api";
import { CARD_LIMIT } from "./dashboard";
import { SectionCard, SectionEmpty } from "./section-card";

// RolloutsCard shows where each progressive rollout stands today.
export function RolloutsCard({ rollouts }: { rollouts: FlagInstance[] }) {
  const t = useTranslate();
  return (
    <SectionCard
      title={t("home.rollouts.title")}
      link={{ to: "/flags", label: t("home.rollouts.all") }}
    >
      {rollouts.length === 0 && <SectionEmpty>{t("home.rollouts.empty")}</SectionEmpty>}
      <ul className="divide-y">
        {rollouts.slice(0, CARD_LIMIT).map((f) => (
          <RolloutRow key={f.id} flag={f} />
        ))}
      </ul>
    </SectionCard>
  );
}

// The list summary has no dates, so each row reads its flag (shared ["flag", id]
// cache with the detail page) to place "now" on the rollout window.
// ponytail: one request per row (max CARD_LIMIT); a dashboard summary endpoint
// would fold these into one. See TODOS.md.
function RolloutRow({ flag }: { flag: FlagInstance }) {
  const t = useTranslate();
  const { query } = useCustom<Flag>({
    url: `${API_URL}/flags/${flag.id}`,
    method: "get",
    queryOptions: { queryKey: ["flag", flag.id] },
  });
  const pr = query.data?.data?.payload?.defaultRule?.progressiveRollout;
  const startTs = pr?.initial?.date ? new Date(pr.initial.date).getTime() : NaN;
  const endTs = pr?.end?.date ? new Date(pr.end.date).getTime() : NaN;
  const known = !Number.isNaN(startTs) && !Number.isNaN(endTs);

  const now = Date.now();
  const pct = known
    ? rolloutPercent(now, startTs, endTs, pr?.initial?.percentage ?? 0, pr?.end?.percentage ?? 100)
    : undefined;
  let detail = "";
  if (known) {
    const status = rolloutStatus(now, startTs, endTs);
    detail = t(`home.rollouts.${status}`, {
      when: relativeTime(status === "scheduled" ? startTs : endTs, now),
    });
  }

  return (
    <li className="px-5 py-3">
      <div className="flex items-center gap-2">
        <Link to={`/flags/${flag.id}`} className="min-w-0 flex-1 truncate font-mono text-sm hover:underline">
          {flag.name}
        </Link>
        <span className="text-sm font-semibold tabular-nums">{pct === undefined ? "–" : `${pct}%`}</span>
      </div>
      <Progress value={pct ?? 0} className="mt-2 h-1.5" aria-label={flag.name} />
      <div className="mt-1.5 text-xs text-muted-foreground">
        {flag.disabled ? t("home.rollouts.disabled") : detail}
      </div>
    </li>
  );
}
