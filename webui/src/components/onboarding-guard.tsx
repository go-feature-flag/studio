import { useGetIdentity } from "@refinedev/core";
import { Navigate, useLocation } from "react-router";
import type { PropsWithChildren } from "react";
import { getCachedCompany } from "@/providers/auth";
import { isMonoCompany } from "@/providers/ui-config";
import type { User } from "@/types/api";

export function OnboardingGuard({ children }: PropsWithChildren) {
  const { data: identity, isLoading } = useGetIdentity<User>();
  const location = useLocation();

  if (isLoading || !identity) return null;

  const company = getCachedCompany();
  const onboarding = location.pathname.startsWith("/onboarding");

  // Mono company: the super admin sets up the single company on first login.
  if (isMonoCompany() && identity.isSuperAdmin && !company && !onboarding) {
    return <Navigate to="/onboarding/setup" replace />;
  }
  if (!identity.isSuperAdmin && !company && !onboarding) {
    return <Navigate to="/onboarding" replace />;
  }

  return <>{children}</>;
}

OnboardingGuard.displayName = "OnboardingGuard";
