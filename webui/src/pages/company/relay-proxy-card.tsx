import { useState } from "react";
import { useCustom, useCustomMutation, useTranslate } from "@refinedev/core";
import { InfoIcon, KeyRound, RefreshCw } from "lucide-react";
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
import { CopyButton } from "@/components/ui/copy-button";
import { EmptyState } from "@/components/ui/empty-state";
import { errMessage } from "@/lib/errors";
import { formatExactDateTime } from "@/lib/relative-time";
import { API_URL } from "@/providers/constants";

type RelayProxySecret = { secret: string; createdAt: string };

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
  const [confirmRotate, setConfirmRotate] = useState(false);
  const secret = (query.data?.data as RelayProxySecret | null | undefined) ?? null;
  const pending = mutation.isPending;

  const generate = () =>
    mutate(
      { url, method: "post", values: {}, successNotification: false, errorNotification: false },
      {
        onSuccess: () => {
          toast.success(t("company.relayProxy.generated"));
          setConfirmRotate(false);
          query.refetch();
        },
        onError: (err) => toast.error(t("company.relayProxy.generateError"), { description: errMessage(err) }),
      },
    );

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
            <Button onClick={generate} disabled={pending}>
              <KeyRound className="h-4 w-4" />
              {pending ? t("company.relayProxy.generating") : t("company.relayProxy.generate")}
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="overflow-hidden rounded-md border">
              <div className="flex items-center justify-between gap-2 border-b bg-muted/40 px-3 py-1.5">
                <span className="font-mono text-xs font-medium text-muted-foreground">
                  goff-proxy.yaml
                </span>
                <CopyButton value={config} label={t("common.copy")} />
              </div>
              <CodeBlock code={config} language="yaml" rounded={false} />
            </div>
            <p className="text-sm text-muted-foreground">{t("company.relayProxy.hint")}</p>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground">
                {t("company.relayProxy.createdAt", { date: formatExactDateTime(secret.createdAt) })}
              </span>
              <Button variant="outline" onClick={() => setConfirmRotate(true)}>
                <RefreshCw className="h-4 w-4" />
                {t("company.relayProxy.rotate")}
              </Button>
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
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>{t("common.cancel")}</AlertDialogCancel>
            {/* A plain Button, not AlertDialogAction: the dialog stays open until the request ends. */}
            <Button variant="destructive" onClick={generate} disabled={pending}>
              {pending ? t("company.relayProxy.generating") : t("company.relayProxy.rotate")}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

CompanyRelayProxyCard.displayName = "CompanyRelayProxyCard";
