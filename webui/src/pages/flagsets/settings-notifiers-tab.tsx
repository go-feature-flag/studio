// NotifiersTab: list a flagset's relay proxy notifiers, switch them on and off,
// and add, edit or remove them through NotifierDialog. Every change saves the
// whole list.

import { useState } from "react";
import { useCustom, useCustomMutation, useTranslate } from "@refinedev/core";
import { toast } from "sonner";
import { BellIcon, InfoIcon, PencilIcon, PlusIcon } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { CodeChip } from "@/components/ui/code-chip";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { API_URL } from "@/providers/constants";
import { errMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";
import type { Notifier, NotifierKind } from "@/types/api";
import { NotifierDialog, NotifierLogo } from "./notifier-dialog";

// dialog: null when closed; index null when adding.
type DialogState = { index: number | null } | null;

export function NotifiersTab({ flagsetId, canManage }: { flagsetId: string; canManage: boolean }) {
  const t = useTranslate();
  const url = `${API_URL}/flagsets/${flagsetId}/notifiers`;
  const { query } = useCustom<Notifier[]>({
    url,
    method: "get",
    queryOptions: { queryKey: ["flagset-notifiers", flagsetId] },
  });
  const notifiers = Array.isArray(query.data?.data) ? query.data!.data : [];
  const { mutate, mutation } = useCustomMutation();
  const [dialog, setDialog] = useState<DialogState>(null);

  const save = (next: Notifier[]) =>
    mutate(
      { url, method: "put", values: { notifiers: next }, successNotification: false, errorNotification: false },
      {
        onSuccess: () => {
          toast.success(t("flagset.settings.notifiers.saved"));
          setDialog(null);
          query.refetch();
        },
        onError: (err) =>
          toast.error(t("flagset.settings.notifiers.saveError"), { description: errMessage(err) }),
      },
    );

  const label = (k: NotifierKind) => t(`flagset.settings.notifiers.${k}.label`);
  const defaultName = (kind: NotifierKind) => {
    const same = notifiers.filter((n) => n.kind === kind).length;
    return same ? `${label(kind)} ${same + 1}` : label(kind);
  };
  const on = notifiers.filter((n) => n.enabled).length;
  const index = dialog?.index ?? null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("flagset.settings.notifiers.title")}</CardTitle>
        <CardDescription>{t("flagset.settings.notifiers.subtitle")}</CardDescription>
        {notifiers.length > 0 && (
          <p className="text-xs font-medium text-muted-foreground">
            {t("flagset.settings.notifiers.summary", { count: notifiers.length, on, off: notifiers.length - on })}
          </p>
        )}
        {canManage && notifiers.length > 0 && (
          <CardAction>
            <Button onClick={() => setDialog({ index: null })}>
              <PlusIcon />
              {t("flagset.settings.notifiers.add")}
            </Button>
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {!canManage && (
          <Alert variant="warning">
            <InfoIcon className="h-4 w-4" />
            <AlertDescription>{t("flagset.settings.notifiers.readOnly")}</AlertDescription>
          </Alert>
        )}

        {query.isLoading ? (
          <div className="flex flex-col gap-2" aria-busy="true" aria-label={t("common.loading")}>
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : notifiers.length === 0 ? (
          <EmptyState variant="inline" className="flex flex-col items-center gap-3 py-10 text-sm">
            <BellIcon className="size-5" />
            <div className="flex flex-col gap-1">
              <span className="font-medium text-foreground">{t("flagset.settings.notifiers.emptyTitle")}</span>
              <span>{t("flagset.settings.notifiers.emptyDesc")}</span>
            </div>
            {canManage && (
              <Button onClick={() => setDialog({ index: null })}>
                <PlusIcon />
                {t("flagset.settings.notifiers.addFirst")}
              </Button>
            )}
          </EmptyState>
        ) : (
          <ul className="divide-y overflow-hidden rounded-lg border bg-background">
            {notifiers.map((n, i) => {
              const target = n.kind === "webhook" ? n.endpointUrl : n.webhookUrl;
              return (
                <li key={i} className="flex items-center gap-3 py-3 pr-3 pl-4">
                  <span
                    className={cn(
                      "grid size-9 shrink-0 place-items-center rounded-md border bg-card",
                      !n.enabled && "opacity-55 grayscale",
                    )}
                  >
                    <NotifierLogo kind={n.kind} className="size-5" />
                  </span>
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="truncate text-sm font-medium">{n.name}</span>
                      <Badge variant="secondary">{label(n.kind)}</Badge>
                    </div>
                    {target ? (
                      <CodeChip size="sm" className="max-w-full self-start truncate text-muted-foreground">
                        {target}
                      </CodeChip>
                    ) : (
                      <span className="text-xs text-warning">{t("flagset.settings.notifiers.noUrl")}</span>
                    )}
                  </div>
                  <span className="text-xs font-medium text-muted-foreground">
                    {n.enabled ? t("flagset.settings.notifiers.on") : t("flagset.settings.notifiers.off")}
                  </span>
                  <Switch
                    checked={n.enabled}
                    disabled={!canManage || mutation.isPending}
                    aria-label={t("flagset.settings.notifiers.toggle", { name: n.name })}
                    onCheckedChange={(enabled) =>
                      save(notifiers.map((x, j) => (j === i ? { ...x, enabled } : x)))
                    }
                  />
                  {canManage && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8 text-muted-foreground"
                      aria-label={t("flagset.settings.notifiers.edit", { name: n.name })}
                      onClick={() => setDialog({ index: i })}
                    >
                      <PencilIcon />
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>

      {dialog && (
        <NotifierDialog
          initial={index === null ? null : notifiers[index]}
          defaultName={defaultName}
          saving={mutation.isPending}
          onClose={() => setDialog(null)}
          onRemove={() => save(notifiers.filter((_, j) => j !== index))}
          onSave={(n) =>
            save(index === null ? [...notifiers, n] : notifiers.map((x, j) => (j === index ? n : x)))
          }
        />
      )}
    </Card>
  );
}
