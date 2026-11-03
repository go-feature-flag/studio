// ContextTab: edit a flagset's evaluation-context enrichment via the shared
// EnrichmentEditor. The settings page owns the draft and the save bar; it
// bumps `editorKey` to reseed the editor after a save or discard.

import { useTranslate } from "@refinedev/core";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EnrichmentEditor } from "./enrichment-editor";
import type { Flagset } from "@/types/api";

export function ContextTab({
  flagset,
  editorKey,
  canWrite,
  onChange,
}: {
  flagset: Flagset;
  editorKey: number;
  canWrite: boolean;
  onChange: (obj: Record<string, unknown>, valid: boolean) => void;
}) {
  const t = useTranslate();
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("flagset.settings.context")}</CardTitle>
      </CardHeader>
      <CardContent>
        <EnrichmentEditor
          key={editorKey}
          initial={flagset.evaluationContextEnrichment ?? undefined}
          onChange={onChange}
          readOnly={!canWrite}
        />
      </CardContent>
    </Card>
  );
}
