import { useState } from "react";
import { useCustom, useTranslate } from "@refinedev/core";
import { ChevronDownIcon, InfoIcon, RefreshCw } from "lucide-react";
import { dump as yamlDump } from "js-yaml";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { CodeBlock } from "@/components/ui/code-block";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { CopyButton } from "@/components/ui/copy-button";
import { errMessage } from "@/lib/errors";
import { API_URL } from "@/providers/constants";

type PreviewProps = { companyId: string; secret: string; secretCreatedAt: string };

export function RelayProxyConfigPreview(props: PreviewProps) {
  const t = useTranslate();
  const [open, setOpen] = useState(false);
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="group overflow-hidden rounded-md border">
      <CollapsibleTrigger className="flex w-full cursor-pointer items-center justify-between gap-2 bg-muted/40 px-3 py-2 text-left text-sm font-medium">
        {t("company.relayProxy.preview.title")}
        <ChevronDownIcon className="size-4 shrink-0 transition-transform group-data-[state=open]:rotate-180" />
      </CollapsibleTrigger>
      <CollapsibleContent>
        {/* Unmounting drops the query subscription: every opening loads a fresh response. */}
        {open && <ConfigurationContent key={`${props.companyId}:${props.secretCreatedAt}`} {...props} />}
      </CollapsibleContent>
    </Collapsible>
  );
}

function ConfigurationContent({ companyId, secret, secretCreatedAt }: PreviewProps) {
  const t = useTranslate();
  const { query } = useCustom<Record<string, unknown>>({
    url: `${API_URL}/relay-proxy/flagsets.json`,
    method: "get",
    config: { headers: { Authorization: `Bearer ${secret}` } },
    meta: { rawResponse: true },
    errorNotification: false,
    queryOptions: {
      // The default key includes headers. Use a credential-free key and do not
      // retain a configuration (which contains credentials) after closing it.
      queryKey: ["relay-proxy-configuration", companyId, secretCreatedAt],
      gcTime: 0,
      staleTime: 0,
      refetchOnMount: "always",
      refetchOnWindowFocus: false,
      retry: false,
      // Let fetch report offline failures so the preview offers Retry instead of pausing invisibly.
      networkMode: "always",
    },
  });

  if (query.isFetching) {
    return <p role="status" className="border-t p-3 text-sm text-muted-foreground">{t("common.loading")}</p>;
  }
  if (query.isError) {
    return (
      <div className="border-t p-3">
        <Alert variant="destructive">
          <InfoIcon />
          <AlertDescription>
            <p>{t("company.relayProxy.preview.error")}</p>
            <p>{errMessage(query.error)}</p>
            <Button variant="outline" size="sm" onClick={() => query.refetch()}>
              {t("company.relayProxy.preview.retry")}
            </Button>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const code = yamlDump(query.data?.data, { lineWidth: -1 });
  return (
    <div className="border-t">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2">
        <p className="text-xs text-muted-foreground">{t("company.relayProxy.preview.description")}</p>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={() => query.refetch()}>
            <RefreshCw className="size-3.5" />
            {t("company.relayProxy.preview.refresh")}
          </Button>
          <CopyButton value={code} label={t("company.relayProxy.preview.copy")} />
        </div>
      </div>
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- Scrollable code must accept keyboard focus; the rule cannot detect overflow. */}
      <div role="region" aria-label={t("company.relayProxy.preview.codeLabel")} tabIndex={0} className="max-h-96 overflow-auto">
        <CodeBlock code={code} language="yaml" rounded={false} />
      </div>
    </div>
  );
}
