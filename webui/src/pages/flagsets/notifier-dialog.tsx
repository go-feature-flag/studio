// NotifierDialog adds or edits one notifier of a flagset. The kind is chosen
// before it opens (the tab's kind cards); the parent saves the whole list.

import { useState } from "react";
import { useTranslate } from "@refinedev/core";
import { PlusIcon, Trash2Icon, WebhookIcon, XIcon } from "lucide-react";
import slackLogo from "@/assets/notifiers/slack.svg";
import discordLogo from "@/assets/notifiers/discord.svg";
import teamsLogo from "@/assets/notifiers/microsoftteams.svg";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { Notifier, NotifierKind } from "@/types/api";
import { Setting } from "./setting";

const LOGOS: Partial<Record<NotifierKind, string>> = {
  slack: slackLogo,
  discord: discordLogo,
  microsoftteams: teamsLogo,
};

// NotifierLogo shows the brand's own logo; the generic webhook has none.
export function NotifierLogo({ kind, className }: { kind: NotifierKind; className?: string }) {
  const src = LOGOS[kind];
  if (!src) return <WebhookIcon aria-hidden className={className} />;
  return <img src={src} alt="" className={cn("object-contain", className)} />;
}

export function isHttpUrl(v: string | undefined): boolean {
  try {
    const u = new URL((v ?? "").trim());
    return (u.protocol === "http:" || u.protocol === "https:") && u.host !== "";
  } catch {
    return false;
  }
}

type HeaderRow = { name: string; value: string };
type Draft = { name: string; kind: NotifierKind; enabled: boolean; url: string; secret: string; headers: HeaderRow[] };

const toDraft = (n: Notifier): Draft => ({
  name: n.name,
  kind: n.kind,
  enabled: n.enabled,
  url: (n.kind === "webhook" ? n.endpointUrl : n.webhookUrl) ?? "",
  secret: n.secret ?? "",
  headers: Object.entries(n.headers ?? {}).map(([name, value]) => ({ name, value })),
});

function fromDraft(d: Draft): Notifier {
  const base = { name: d.name.trim(), kind: d.kind, enabled: d.enabled };
  if (d.kind !== "webhook") return { ...base, webhookUrl: d.url.trim() };
  const headers = Object.fromEntries(
    d.headers.filter((h) => h.name.trim()).map((h) => [h.name.trim(), h.value]),
  );
  return {
    ...base,
    endpointUrl: d.url.trim(),
    ...(d.secret ? { secret: d.secret } : {}),
    ...(Object.keys(headers).length ? { headers } : {}),
  };
}

export function NotifierDialog({
  initial,
  isNew,
  saving,
  onSave,
  onRemove,
  onClose,
}: {
  // The notifier to edit, or the blank one to add when isNew.
  initial: Notifier;
  isNew: boolean;
  saving: boolean;
  onSave: (n: Notifier) => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  const t = useTranslate();
  const [draft, setDraft] = useState<Draft>(() => toDraft(initial));
  const [confirmRemove, setConfirmRemove] = useState(false);
  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));
  const kindLabel = t(`flagset.settings.notifiers.${draft.kind}.label`);

  const urlBad = draft.url.trim() !== "" && !isHttpUrl(draft.url);
  const canSave = draft.name.trim() !== "" && isHttpUrl(draft.url) && !saving;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {t(`flagset.settings.notifiers.${isNew ? "addTitle" : "editTitle"}`, { kind: kindLabel })}
          </DialogTitle>
          <DialogDescription>{t(`flagset.settings.notifiers.${draft.kind}.hint`)}</DialogDescription>
        </DialogHeader>

        <NotifierForm draft={draft} set={set} urlBad={urlBad} />

        <DialogFooter className="items-center sm:justify-between">
          {!isNew ? (
            <Button
              variant="ghost"
              className="text-destructive hover:bg-destructive/10 hover:text-destructive sm:-ml-3"
              onClick={() => setConfirmRemove(true)}
              disabled={saving}
            >
              <Trash2Icon />
              {t("common.remove")}
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>
              {t("common.cancel")}
            </Button>
            <Button onClick={() => onSave(fromDraft(draft))} disabled={!canSave}>
              {isNew ? t("flagset.settings.notifiers.add") : t("flagset.settings.notifiers.save")}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>

      <AlertDialog open={confirmRemove} onOpenChange={setConfirmRemove}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("flagset.settings.notifiers.removeTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("flagset.settings.notifiers.removeDesc", { name: initial.name })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={onRemove}>{t("common.remove")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}

function NotifierForm({
  draft,
  set,
  urlBad,
}: {
  draft: Draft;
  set: (patch: Partial<Draft>) => void;
  urlBad: boolean;
}) {
  const t = useTranslate();
  const webhook = draft.kind === "webhook";
  const optional = (label: string) => `${label} · ${t("common.optional")}`;
  const setHeader = (i: number, patch: Partial<HeaderRow>) =>
    set({ headers: draft.headers.map((h, j) => (j === i ? { ...h, ...patch } : h)) });

  let urlHint = t("flagset.settings.notifiers.webhookUrlHint", {
    kind: t(`flagset.settings.notifiers.${draft.kind}.label`),
  });
  if (webhook) urlHint = t("flagset.settings.notifiers.endpointUrlHint");

  return (
    <div className="flex flex-col gap-4">
      <Setting id="notifier-name" label={t("flagset.settings.notifiers.name")} hint={t("flagset.settings.notifiers.nameHint")}>
        <Input
          id="notifier-name"
          aria-describedby="notifier-name-hint"
          value={draft.name}
          onChange={(e) => set({ name: e.target.value })}
        />
      </Setting>

      <Setting
        id="notifier-url"
        label={t(`flagset.settings.notifiers.${webhook ? "endpointUrl" : "webhookUrl"}`)}
        hint={urlBad ? <span className="text-destructive">{t("flagset.settings.notifiers.urlInvalid")}</span> : urlHint}
      >
        <Input
          id="notifier-url"
          type="url"
          className="font-mono"
          value={draft.url}
          aria-invalid={urlBad}
          aria-describedby="notifier-url-hint"
          onChange={(e) => set({ url: e.target.value })}
        />
      </Setting>

      {webhook && (
        <>
          <Setting
            id="notifier-secret"
            label={optional(t("flagset.settings.notifiers.secret"))}
            hint={t("flagset.settings.notifiers.secretHint")}
          >
            <Input
              id="notifier-secret"
              type="password"
              autoComplete="off"
              className="font-mono"
              aria-describedby="notifier-secret-hint"
              placeholder={t("flagset.settings.notifiers.secretPlaceholder")}
              value={draft.secret}
              onChange={(e) => set({ secret: e.target.value })}
            />
          </Setting>

          <div role="group" aria-labelledby="notifier-headers" className="flex flex-col gap-2">
            <Label id="notifier-headers">{optional(t("flagset.settings.notifiers.headers"))}</Label>
            {draft.headers.map((h, i) => (
              <div key={i} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_auto] items-center gap-2">
                <Input
                  className="font-mono"
                  aria-label={t("flagset.settings.notifiers.headerName")}
                  value={h.name}
                  onChange={(e) => setHeader(i, { name: e.target.value })}
                />
                <Input
                  className="font-mono"
                  aria-label={t("flagset.settings.notifiers.headerValue")}
                  value={h.value}
                  onChange={(e) => setHeader(i, { value: e.target.value })}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={t("flagset.settings.notifiers.removeHeader")}
                  onClick={() => set({ headers: draft.headers.filter((_, j) => j !== i) })}
                >
                  <XIcon />
                </Button>
              </div>
            ))}
            <Button
              variant="ghost"
              size="sm"
              className="-ml-3 self-start"
              onClick={() => set({ headers: [...draft.headers, { name: "", value: "" }] })}
            >
              <PlusIcon />
              {t("flagset.settings.notifiers.addHeader")}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
