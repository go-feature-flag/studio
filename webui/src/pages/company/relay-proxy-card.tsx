import { useEffect, useId, useState } from "react";
import { useCustom, useCustomMutation, useTranslate } from "@refinedev/core";
import { Trans } from "react-i18next";
import { ClockIcon, InfoIcon, KeyRound, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { CodeBlock } from "@/components/ui/code-block";
import { CodeChip } from "@/components/ui/code-chip";
import { CopyButton } from "@/components/ui/copy-button";
import { EmptyState } from "@/components/ui/empty-state";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { errMessage } from "@/lib/errors";
import { formatExactDateTime, formatRelativeTime } from "@/lib/relative-time";
import { API_URL } from "@/providers/constants";
import { HttpError } from "@/providers/http";

// previousExpiresAt: when the secret the last rotation replaced stops working;
// previousSecretEnd: its last 5 characters, to recognize it.
type RelayProxySecret = {
  secret: string;
  createdAt: string;
  previousExpiresAt?: string;
  previousSecretEnd?: string;
};

// How long a rotation keeps the current secret valid (server max: 30 days).
const KEEP_OPTIONS = [
  { key: "none", seconds: 0 },
  { key: "hour", seconds: 60 * 60 },
  { key: "day", seconds: 24 * 60 * 60 },
  { key: "week", seconds: 7 * 24 * 60 * 60 },
  { key: "month", seconds: 30 * 24 * 60 * 60 },
] as const;
const DEFAULT_KEEP = String(KEEP_OPTIONS[2].seconds);
// setTimeout fires at once past this delay (~24.8 days).
const MAX_TIMEOUT = 2 ** 31 - 1;

// The relay proxy loads its flagSets from this URL; it must be the address the
// relay proxy reaches Studio at, which is usually the one the browser uses.
function relayProxyConfig(secret: string, origin = window.location.origin): string {
  const url = new URL(`${API_URL}/relay-proxy/flagsets.json`, origin).href;
  return `studio:\n  url: ${url}\n  headers:\n    Authorization:\n      - Bearer ${secret}\n`;
}

// The secret reads every flagset and API key of the company, so the endpoint
// (like the company page) is company admin only.
export function CompanyRelayProxyCard({ companyId }: { companyId: string }) {
  const t = useTranslate();
  const url = `${API_URL}/companies/${companyId}/relay-proxy-secret`;
  // No type argument: useCustom only accepts object payloads, and this one is null until generated.
  const { query } = useCustom({
    url,
    method: "get",
    queryOptions: { queryKey: ["relay-proxy-secret", companyId] },
  });
  const { mutate, mutation } = useCustomMutation();
  const rotationBlockedId = useId();
  const [confirmRotate, setConfirmRotate] = useState(false);
  const [confirmRevoke, setConfirmRevoke] = useState(false);
  const [keepSeconds, setKeepSeconds] = useState(DEFAULT_KEEP);
  const [now, setNow] = useState(Date.now);
  const secret = (query.data?.data as RelayProxySecret | null | undefined) ?? null;
  const pending = mutation.isPending;

  const previousExpiresAt = secret?.previousExpiresAt;
  const previousValid = !!previousExpiresAt && Date.parse(previousExpiresAt) > now;
  const previousSecret = `*****${secret?.previousSecretEnd ?? ""}`;
  useEffect(() => {
    if (!previousExpiresAt) return;
    const expiresAt = Date.parse(previousExpiresAt);
    if (!Number.isFinite(expiresAt)) return;
    // Long grace periods exceed the browser's timeout limit. Recheck in chunks
    // so a page left open still enables rotation when the previous secret expires.
    let timer: ReturnType<typeof setTimeout>;
    const update = () => {
      const currentTime = Date.now();
      setNow(currentTime);
      const remaining = expiresAt - currentTime;
      if (remaining > 0) timer = setTimeout(update, Math.min(remaining, MAX_TIMEOUT));
    };
    timer = setTimeout(update, Math.max(0, Math.min(expiresAt - Date.now(), MAX_TIMEOUT)));
    return () => clearTimeout(timer);
  }, [previousExpiresAt]);

  // The first secret has no previous one to keep: an empty body.
  const generate = (values: { keepPreviousSeconds?: number } = {}) =>
    mutate(
      { url, method: "post", values, successNotification: false, errorNotification: false },
      {
        onSuccess: () => {
          toast.success(t("company.relayProxy.generated"));
          setConfirmRotate(false);
          setNow(Date.now());
          query.refetch();
        },
        onError: (err) => {
          toast.error(t("company.relayProxy.generateError"), { description: errMessage(err) });
          if (err instanceof HttpError && err.status === 409) query.refetch();
        },
      },
    );

  const revokePrevious = () =>
    mutate(
      { url: `${url}/previous`, method: "delete", values: {}, successNotification: false, errorNotification: false },
      {
        onSuccess: () => {
          toast.success(t("company.relayProxy.previousRevoked"));
          setConfirmRevoke(false);
          query.refetch();
        },
        onError: (err) =>
          toast.error(t("company.relayProxy.revokePreviousError"), { description: errMessage(err) }),
      },
    );

  const openRotate = () => {
    setKeepSeconds(DEFAULT_KEEP);
    setConfirmRotate(true);
  };

  const config = secret ? relayProxyConfig(secret.secret) : "";

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("company.relayProxy.title")}</CardTitle>
        <CardDescription className="mt-1.5">
          {t("company.relayProxy.description")}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {query.isError ? (
          <Alert variant="destructive">
            <InfoIcon className="h-4 w-4" />
            <AlertDescription>{t("company.relayProxy.error")}</AlertDescription>
          </Alert>
        ) : query.isLoading ? (
          <EmptyState variant="inline">{t("common.loading")}</EmptyState>
        ) : !secret ? (
          <div className="flex flex-col items-start gap-3">
            <p className="text-sm text-muted-foreground">{t("company.relayProxy.noSecret")}</p>
            <Button onClick={() => generate()} disabled={pending}>
              <KeyRound className="h-4 w-4" />
              {pending ? t("company.relayProxy.generating") : t("company.relayProxy.generate")}
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <Alert>
              <InfoIcon />
              <AlertDescription>{t("company.relayProxy.hint")}</AlertDescription>
            </Alert>
            <div className="overflow-hidden rounded-md border">
              <div className="flex items-center justify-between gap-2 border-b bg-muted/40 px-3 py-1.5">
                <span className="font-mono text-xs font-medium text-muted-foreground">
                  goff-proxy.yaml
                </span>
                <CopyButton value={config} label={t("common.copy")} />
              </div>
              <CodeBlock code={config} language="yaml" rounded={false} />
            </div>
            {previousValid && (
              <Alert variant="warning">
                <ClockIcon />
                <AlertDescription className="flex flex-wrap items-center justify-between gap-2 text-foreground">
                  <span>
                    <Trans
                      i18nKey="company.relayProxy.previousValid"
                      values={{
                        secret: previousSecret,
                        date: formatExactDateTime(previousExpiresAt),
                        relative: formatRelativeTime(previousExpiresAt),
                      }}
                      components={{ code: <CodeChip /> }}
                    />
                  </span>
                  <Button size="sm" variant="outline" onClick={() => setConfirmRevoke(true)}>
                    {t("company.relayProxy.revokePrevious")}
                  </Button>
                </AlertDescription>
              </Alert>
            )}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground">
                {t("company.relayProxy.createdAt", { date: formatExactDateTime(secret.createdAt) })}
              </span>
              <div className="flex flex-wrap items-center justify-end gap-3">
                {previousValid && (
                  <p id={rotationBlockedId} className="flex max-w-xs items-start gap-1.5 text-sm text-foreground">
                    <InfoIcon className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
                    {t("company.relayProxy.rotationBlocked")}
                  </p>
                )}
                <Button
                  variant="outline"
                  onClick={openRotate}
                  disabled={pending || previousValid}
                  aria-describedby={previousValid ? rotationBlockedId : undefined}
                >
                  <RefreshCw className="h-4 w-4" />
                  {t("company.relayProxy.rotate")}
                </Button>
              </div>
            </div>
          </div>
        )}
      </CardContent>

      <AlertDialog open={confirmRotate} onOpenChange={(open) => !pending && setConfirmRotate(open)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("company.relayProxy.rotateTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("company.relayProxy.rotateDesc")}</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex flex-col gap-2">
            <Label htmlFor="relay-proxy-keep-previous">{t("company.relayProxy.keepPrevious")}</Label>
            <Select value={keepSeconds} onValueChange={setKeepSeconds} disabled={pending}>
              <SelectTrigger
                id="relay-proxy-keep-previous"
                aria-label={t("company.relayProxy.keepPrevious")}
                className="w-full"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {KEEP_OPTIONS.map((o) => (
                  <SelectItem key={o.key} value={String(o.seconds)}>
                    {t(`company.relayProxy.keepOptions.${o.key}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {previousValid && (
              <p className="text-sm text-muted-foreground">
                {t("company.relayProxy.rotationBlocked")}
              </p>
            )}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>{t("common.cancel")}</AlertDialogCancel>
            {/* A plain Button, not AlertDialogAction: the dialog stays open until the request ends. */}
            <Button
              variant="destructive"
              onClick={() => generate({ keepPreviousSeconds: Number(keepSeconds) })}
              disabled={pending || previousValid}
            >
              {pending ? t("company.relayProxy.generating") : t("company.relayProxy.rotate")}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmRevoke} onOpenChange={(open) => !pending && setConfirmRevoke(open)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("company.relayProxy.revokePreviousTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("company.relayProxy.revokePreviousDesc")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>{t("common.cancel")}</AlertDialogCancel>
            <Button variant="destructive" onClick={revokePrevious} disabled={pending}>
              {t("company.relayProxy.revokePrevious")}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

CompanyRelayProxyCard.displayName = "CompanyRelayProxyCard";
