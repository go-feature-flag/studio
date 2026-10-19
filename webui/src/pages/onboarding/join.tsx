import { useGetIdentity, useLogout, useTranslate } from "@refinedev/core";
import { useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { User } from "@/types/api";
import { cn } from "@/lib/utils";

export function OnboardingJoinPage() {
  const t = useTranslate();
  const navigate = useNavigate();
  const { data: identity } = useGetIdentity<User>();
  const { mutate: logout } = useLogout();

  return (
    <div
      className={cn(
        "flex",
        "min-h-svh",
        "items-center",
        "justify-center",
        "px-6",
        "py-12"
      )}
    >
      <Card className="w-full max-w-xl">
        <CardHeader>
          <CardTitle>{t("onboarding.join.title")}</CardTitle>
          <CardDescription>{t("onboarding.join.subtitle")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {identity?.email && (
            <div className="rounded-md border bg-muted p-4 font-mono text-sm">
              {identity.email}
            </div>
          )}
          <div className="flex justify-between gap-2">
            <Button variant="ghost" onClick={() => navigate("/onboarding")}>
              {t("common.back")}
            </Button>
            <Button variant="outline" onClick={() => logout({})}>
              {t("onboarding.join.signOut")}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

OnboardingJoinPage.displayName = "OnboardingJoinPage";
