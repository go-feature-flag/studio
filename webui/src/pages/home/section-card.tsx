import type { ReactNode } from "react";
import { Link } from "react-router";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

// SectionCard is the frame of every dashboard panel: a title row (optional
// count badge and "see all" link) over a borderless list.
export function SectionCard({
  title,
  count,
  link,
  children,
}: {
  title: string;
  count?: number;
  link?: { to: string; label: string };
  children: ReactNode;
}) {
  return (
    <Card className="gap-0 overflow-hidden py-0">
      <div className="flex items-center gap-2 border-b px-5 py-3">
        <h2 className="text-sm font-semibold">{title}</h2>
        {!!count && (
          <Badge className="rounded-full border-transparent bg-warning/10 text-2xs text-warning">
            {count}
          </Badge>
        )}
        {link && (
          <Link to={link.to} className="ml-auto text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground">
            {link.label}
          </Link>
        )}
      </div>
      {children}
    </Card>
  );
}

// SectionEmpty is the muted one-liner a panel shows when it has no rows.
export function SectionEmpty({ children }: { children: ReactNode }) {
  return <p className="px-5 py-6 text-center text-sm text-muted-foreground">{children}</p>;
}
