import { useTranslate } from "@refinedev/core";
import { CodeChip } from "@/components/ui/code-chip";
import { formatExactDateTime, formatRelativeTime } from "@/lib/relative-time";
import type { AuditEntry } from "@/types/api";
import { ActorAvatar } from "../audit-log/actor-avatar";
import { actorName } from "../audit-log/format";
import { VerbChip } from "../audit-log/verb-chip";
import { auditKey } from "../audit-log/vocabulary";
import { targetName } from "./dashboard";
import { SectionCard, SectionEmpty } from "./section-card";

// ActivityCard is a compact read-only slice of the audit log: who did what,
// and when, for the team's latest events.
export function ActivityCard({
  entries,
  nameById,
}: {
  entries: AuditEntry[];
  nameById: Map<string, string>;
}) {
  const t = useTranslate();
  return (
    <SectionCard
      title={t("home.activity.title")}
      link={{ to: "/audit-log", label: t("home.activity.all") }}
    >
      {entries.length === 0 && <SectionEmpty>{t("home.activity.empty")}</SectionEmpty>}
      <ul className="divide-y">
        {entries.map((e) => {
          const flagset = e.flagsetId ? nameById.get(e.flagsetId) : undefined;
          return (
            <li key={e.id} className="flex items-start gap-3 px-5 py-3">
              <ActorAvatar e={e} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5 text-sm">
                  <b className="font-semibold">{actorName(e)}</b>
                  <VerbChip action={auditKey(e)} t={t} />
                  <CodeChip size="sm">{targetName(e, nameById)}</CodeChip>
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  <time dateTime={e.occurredAt} title={formatExactDateTime(e.occurredAt)}>
                    {formatRelativeTime(e.occurredAt)}
                  </time>
                  {flagset && e.targetType === "flag" && ` · ${flagset}`}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </SectionCard>
  );
}
