# TODOs

Known follow-ups, most important first. Each item is tagged with the area it touches.

- **P0** — security holes and deploy blockers.
- **P1** — correctness bugs users will hit.
- **P2** — hardening, hygiene and decisions with a safe workaround.
- **P3** — nice to have, or blocked on something else.

## P0 — Security holes and deploy blockers

_Nothing open._

## P1 — Correctness bugs

_Nothing open._

## P2 — Hardening and hygiene

- [ ] **[Auth] Return a 4xx with a reason when the OIDC subject changed.** When an email is already bound to a different `oidc_sub`, `UpsertFromOIDC` returns `ErrIdentityMismatch`. The callback (`handler/auth.go`) only maps `ErrLoginRejected` to 400, so the user gets a 500 `{"message":"login failed"}` with nothing to act on. That happens in dev whenever the Keycloak container is recreated against an existing database. Map `ErrIdentityMismatch` to a 403 with a message saying the account is linked to another identity.

- [ ] **[WebUI] Raise page test coverage.** webui line coverage is 57%. The gaps are pages with few or no tests: `pages/flagsets` (32%, ~1,000 uncovered lines), `pages/company` (14%, ~990), `pages/flags` (64%, ~865; `flag-wizard.tsx` and `flag-detail-history-tab.tsx` are at 0%), `pages/audit-log` (18%, ~640). Any PR touching them will struggle with the 80% patch target. Add MSW-backed render tests per page, like `pages/flags/index.test.tsx`.

## P3 — Nice to have or blocked

- [ ] **[Roles] Rename `User.Role()`.** It returns a `CompanyRole`, while `Role` is also the name of the team role type, so callers can mix the two up. Something like `CompanyRoleOrEmpty()` is clearer.
- [ ] **[Roles] Fill two test gaps.** No `AtLeast` test checks that an unknown role (e.g. `Role("owner").AtLeast(RoleViewer)`) is denied, for team or company roles. `TestNewMeResponse` doesn't cover a user with `CompanyID` set but `CompanyRole` nil, which would return `company.role: ""`; the `users_company_role_pair` CHECK rules that state out in the DB, but the Go side has no test for it.
- [ ] **[Handlers] Make the `params` test helper reject an odd argument count.** A trailing key without a value is dropped silently, so a test can pass with an empty path param.
- [ ] **[Flag evaluation] Guard against a nil request.** `EvaluateFlag` reads `req.EvaluationContext` without a nil check, so a nil `*EvaluateFlagRequest` panics. The only caller always passes a request today; add a check (or take the struct by value) if another caller shows up.
- [ ] **[Flag evaluation] Test a percentage rule with no targeting key.** It only exercises the core engine's behaviour, not code in this package.
- [ ] **[Dev scripts] Stop pinning the dev port to 8080.** `.env.example`'s `GOFF_MGMT_OIDC_REDIRECTURL` assumes `goff.local:8080`, so `GOFF_MGMT_SERVER_PORT=9000` breaks the login callback. Derive the redirect URL from the port in `dev.sh` if other ports are needed (the Keycloak realm already accepts any port).
- [ ] **[Database] Add a company join date if the UI shows one.** `CompanyMember.CreatedAt` can only come from `users.created_at`, so "joined" would mean "account created". Add a `company_joined_at` column when a screen needs the real date.
- [ ] **[Repo] Update `AGENTS.md` once Studio has a working version.** It still describes a work in progress: `webui/` is listed as "not created yet" and it says no backward-compat shims are needed. When the API and UI ship, refresh the layout, commands and compatibility rules.
- [ ] **[WebUI] Fail CI on Storybook a11y violations.** `.storybook/preview.tsx` sets `a11y: { test: "todo" }`, so axe findings only show in the Storybook panel and never fail a build. The jsdom smoke test (`src/stories.test.tsx`) doesn't run axe. Add `@storybook/addon-vitest` with Playwright browser mode, fix the existing violations, then switch to `test: "error"`.
