import type { ReactNode } from "react";
import { Label } from "@/components/ui/label";

// A labelled setting with its description above the control (or beside it,
// for switches); the control references the hint via `${id}-hint`.
export function Setting({
  id,
  label,
  hint,
  inline,
  children,
}: {
  id: string;
  label: string;
  hint: ReactNode;
  inline?: boolean;
  children: ReactNode;
}) {
  const text = (
    <div className="flex flex-col gap-1">
      <Label htmlFor={id}>{label}</Label>
      <p id={`${id}-hint`} className="text-xs text-muted-foreground">
        {hint}
      </p>
    </div>
  );
  if (inline) {
    return (
      <div className="flex items-start justify-between gap-4">
        {text}
        {children}
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      {text}
      {children}
    </div>
  );
}
