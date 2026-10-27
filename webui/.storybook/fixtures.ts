import type {
  AuditEntry,
  Company,
  CompanyMember,
  Flag,
  Flagset,
  FlagsetAPIKey,
  FlagVersion,
  MeResponse,
  Team,
  TeamMember,
  User,
} from "../src/types/api";

// Shared fake data for stories. The preview's data provider serves these by URL
// suffix; stories pick an identity via `parameters: { identity }` and can force
// a request's state via `parameters: { data: { "<suffix>": value | LOADING | FAILED } }`.

// Sentinels for `parameters.data`: a request that never settles, or one that fails.
export const LOADING = Symbol("loading");
export const FAILED = Symbol("failed");

const user = (over: Partial<User>): User => ({
  id: "u-ada",
  email: "ada@acme.dev",
  name: "Ada Lovelace",
  isSuperAdmin: false,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
  ...over,
});

const stamp = { createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" };

export const COMPANIES: Company[] = [
  {
    id: "acme",
    displayName: "Acme Corp",
    description: "Makers of fine anvils and rocket skates",
    ...stamp,
  },
  { id: "globex", displayName: "Globex", description: "", ...stamp },
];

export const TEAMS: Team[] = [
  { id: "t-core", companyId: "acme", name: "Core platform", description: "Checkout, search and the storefront backbone", ...stamp },
  { id: "t-growth", companyId: "acme", name: "Growth", description: "Onboarding and pricing experiments", ...stamp },
  { id: "t-mobile", companyId: "acme", name: "Mobile", description: "iOS and Android apps", ...stamp },
];

export const IDENTITIES = {
  member: {
    user: user({}),
    company: { companyId: "acme", companyDisplayName: "Acme Corp", role: "member" },
    membership: [
      { teamId: "t-core", teamName: "Core platform", role: "editor" },
      { teamId: "t-growth", teamName: "Growth", role: "viewer" },
    ],
  },
  singleTeamMember: {
    user: user({}),
    company: { companyId: "acme", companyDisplayName: "Acme Corp", role: "member" },
    membership: [{ teamId: "t-core", teamName: "Core platform", role: "editor" }],
  },
  companyAdmin: {
    user: user({ id: "u-grace", email: "grace@acme.dev", name: "Grace Hopper" }),
    company: { companyId: "acme", companyDisplayName: "Acme Corp", role: "admin" },
    membership: [],
  },
  superAdmin: {
    user: user({
      id: "u-linus",
      email: "linus@acme.dev",
      name: "Linus Torvalds",
      isSuperAdmin: true,
    }),
    company: null,
    membership: [],
  },
} satisfies Record<string, MeResponse>;

export const FLAGSETS: Flagset[] = [
  {
    id: "fs-web",
    teamId: "t-core",
    name: "web-storefront",
    description: "Flags served to the public web shop",
    apiKeyCount: 2,
    flagCount: 14,
    enabledFlagCount: 9,
    evaluationContextEnrichment: { env: "production", region: "eu-west-1", tier: 2 },
    defaultTestingEvaluationContext: { targetingKey: "user-42", country: "FR", beta: true },
    ...stamp,
  },
  {
    id: "fs-mobile",
    teamId: "t-core",
    name: "mobile-app",
    description: "iOS and Android clients",
    apiKeyCount: 1,
    flagCount: 6,
    enabledFlagCount: 2,
    ...stamp,
  },
  {
    id: "fs-internal",
    teamId: "t-core",
    name: "internal-tools",
    description: "",
    apiKeyCount: 0,
    flagCount: 0,
    enabledFlagCount: 0,
    ...stamp,
  },
];

export const FLAG: Flag = {
  id: "f-checkout",
  flagsetId: "fs-web",
  name: "checkout-redesign",
  disabled: false,
  currentVersion: 4,
  payload: {
    variations: { enabled: true, disabled: false },
    targeting: [
      { name: "Beta testers", query: 'beta eq true', variation: "enabled" },
      {
        name: "French market",
        query: 'country eq "FR"',
        percentage: { enabled: 30, disabled: 70 },
      },
    ],
    defaultRule: { variation: "disabled" },
    metadata: {
      owner: "ada@acme.dev",
      description: "New one-page checkout flow",
      tags: ["checkout", "q4-launch"],
    },
    trackEvents: true,
  },
  ...stamp,
};

// Newest first, as GET /audit returns them.
const audit = (
  id: number,
  occurredAt: string,
  over: Partial<AuditEntry> & Pick<AuditEntry, "action" | "targetType" | "targetId">,
): AuditEntry => ({
  id,
  occurredAt,
  actorUserId: "u-ada",
  actorEmail: "ada@acme.dev",
  companyId: "acme",
  teamId: "t-core",
  ...over,
});

export const AUDIT_ENTRIES: AuditEntry[] = [
  audit(108, "2026-10-27T14:32:00Z", {
    action: "update",
    targetType: "flag",
    targetId: "f-checkout",
    flagsetId: "fs-web",
    flagId: "f-checkout",
    before: { defaultRule: { variation: "disabled" }, trackEvents: false },
    after: { defaultRule: { variation: "enabled" }, trackEvents: true },
  }),
  audit(107, "2026-10-27T13:05:00Z", {
    action: "update",
    targetType: "flag",
    targetId: "f-search",
    flagsetId: "fs-web",
    flagId: "f-search",
    after: { disabled: true },
  }),
  audit(106, "2026-10-27T11:48:00Z", {
    actorUserId: "u-grace",
    actorEmail: "grace@acme.dev",
    action: "create",
    targetType: "api_key",
    targetId: "k-ci",
    flagsetId: "fs-web",
    after: { label: "ci-relay-proxy", flagsetId: "fs-web" },
  }),
  audit(105, "2026-10-27T09:15:00Z", {
    action: "create",
    targetType: "flag",
    targetId: "f-onboarding",
    flagsetId: "fs-mobile",
    flagId: "f-onboarding",
    after: { variations: { on: true, off: false }, defaultRule: { variation: "off" } },
  }),
  audit(104, "2026-10-26T17:40:00Z", {
    actorUserId: "u-grace",
    actorEmail: "grace@acme.dev",
    action: "create",
    targetType: "team_member",
    targetId: "u-linus",
    after: { userId: "u-linus", role: "editor" },
  }),
  audit(103, "2026-10-26T15:20:00Z", {
    action: "update",
    targetType: "flagset",
    targetId: "fs-web",
    flagsetId: "fs-web",
    before: { description: "" },
    after: { description: "Flags served to the public web shop" },
  }),
  audit(102, "2026-10-26T10:02:00Z", {
    action: "rollback",
    targetType: "flag",
    targetId: "f-pricing",
    flagsetId: "fs-web",
    flagId: "f-pricing",
    before: { defaultRule: { variation: "v3" } },
    after: { defaultRule: { variation: "v2" } },
    metadata: { restoredVersion: 2 },
  }),
  audit(101, "2026-10-26T08:00:00Z", {
    actorUserId: null,
    actorEmail: null,
    action: "delete",
    targetType: "flag",
    targetId: "f-legacy",
    flagsetId: "fs-mobile",
    flagId: "f-legacy",
    before: { variations: { on: true, off: false }, disable: true },
  }),
];

// checkout-redesign's history, oldest first; FLAG is version 4.
const version = (
  versionNumber: number,
  createdAt: string,
  comment: string,
  payload: Flag["payload"],
): FlagVersion => ({
  id: `fv-${versionNumber}`,
  flagId: FLAG.id,
  versionNumber,
  payload: payload!,
  comment,
  createdBy: "u-ada",
  createdByName: "Ada Lovelace",
  createdAt,
});

export const FLAG_VERSIONS: FlagVersion[] = [
  version(1, "2026-10-20T09:00:00Z", "", {
    variations: { enabled: true, disabled: false },
    defaultRule: { variation: "disabled" },
  }),
  version(2, "2026-10-22T10:30:00Z", "feat(flags): beta testers get the new checkout", {
    ...FLAG.payload,
    targeting: FLAG.payload!.targeting!.slice(0, 1),
    metadata: undefined,
    trackEvents: false,
  }),
  version(3, "2026-10-24T16:10:00Z", "feat(flags): open checkout to 30% of FR", {
    ...FLAG.payload,
    trackEvents: false,
  }),
  version(4, "2026-10-27T14:32:00Z", "chore(flags): track evaluation events", FLAG.payload),
];

export const API_KEYS: FlagsetAPIKey[] = [
  {
    id: "k-prod",
    flagsetId: "fs-web",
    label: "production relay proxy",
    apiKey: "goff_live_3f9a1c7e2b8d4a6f9e0c1b2a3d4e5f60",
    createdBy: "u-grace",
    createdByName: "Grace Hopper",
    createdAt: "2026-09-02T08:15:00Z",
  },
  {
    id: "k-ci",
    flagsetId: "fs-web",
    label: "ci-relay-proxy",
    apiKey: "goff_live_8c2e4b6a0d1f3e5c7b9a2d4f6e8c0a1b",
    createdBy: "u-grace",
    createdByName: "Grace Hopper",
    createdAt: "2026-10-27T11:48:00Z",
  },
];

const companyMember = (
  u: Pick<CompanyMember, "userId" | "email" | "name" | "role">,
): CompanyMember => ({ id: u.userId, companyId: "acme", ...u });

export const COMPANY_MEMBERS: CompanyMember[] = [
  companyMember({ userId: "u-grace", email: "grace@acme.dev", name: "Grace Hopper", role: "admin" }),
  companyMember({ userId: "u-ada", email: "ada@acme.dev", name: "Ada Lovelace", role: "member" }),
  companyMember({ userId: "u-linus", email: "linus@acme.dev", name: "Linus Torvalds", role: "member" }),
  companyMember({ userId: "u-margaret", email: "margaret@acme.dev", name: "Margaret Hamilton", role: "member" }),
];

// Members of TEAMS[0] (Core platform).
export const TEAM_MEMBERS: TeamMember[] = [
  { id: "u-ada", teamId: "t-core", userId: "u-ada", email: "ada@acme.dev", name: "Ada Lovelace", role: "editor", createdAt: stamp.createdAt },
  { id: "u-linus", teamId: "t-core", userId: "u-linus", email: "linus@acme.dev", name: "Linus Torvalds", role: "viewer", createdAt: stamp.createdAt },
];
