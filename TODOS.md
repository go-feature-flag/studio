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

- [ ] **[Repository] Don't log every audit failure at ERROR.** `AuditRepo.Record` logs `context.Canceled` (client disconnect) and errors the caller already handles, so a caller that logs too gets duplicates and disconnects look like a broken audit pipeline. Skip `errors.Is(err, context.Canceled)` in the log, like the RBAC middleware does.
- [ ] **[Services] Skip audit entries for no-op writes.** Re-adding a member or `UpdateMember` with the same role (team and company) writes an update entry where before equals after; a rollback to the current version or a `FlagService.Update` with an identical payload writes a new identical version; `SetDisabled` to the current state, and `TeamService.Update`/`CompanyService.Update`/`FlagsetService.Update` with an empty body, bump `updated_at` and write an entry.
- [ ] **[Handlers] Complete the Swagger annotations.** `@Produce json` is missing on every company route, the team GET/DELETE routes, `/auth/me` and the flag/flagset DELETEs. Reads don't list 403/404, bodies don't list 413 (401 is only in the global description), and company `RemoveMember` documents 400 for a malformed id while the route answers 404. Generated clients may not parse those responses.
- [ ] **[Docs] Write a deployment guide.** There is none: operators have to read `config/config.go` to learn that a reverse proxy needs `server.trustedProxies` (otherwise every client shares the proxy's login rate-limit bucket), that migrations run at startup unless `db.migrate` is off, and which Postgres version is required.
- [ ] **[Docs] Write `docs/reference/api.md`.** The API description (`main.go`) and `handler/auth.go` point readers to it, but the file doesn't exist.
- [ ] **[Database] Test the migration round-trip and the flag type parity.** Nothing runs Down then Up again. The parity check in `repository/flag_repo_test.go` covers three payload types and looks the payload up by the type SQL returned, so a wrong SQL type still passes; run the `TestInferFlagType` table cases through `flag_versions.flag_type` keyed by flag name (lax jsonpath mode once typed `["a"]` as `string`).
- [ ] **[Repository] Build the test-harness `TRUNCATE` from the schema.** `allTables` in `internal/testutil/postgres.go` is complete today but hard-coded, so a new table without a foreign key to it would keep rows between tests. Build it from `pg_tables` (minus `goose_db_version`). The `harness.terminate` field is assigned but never read: drop it, or call it from a `TestMain` helper for runs with Ryuk disabled.
- [ ] **[Repository] Use a params struct for `UpsertFromOIDC`.** Its four positional strings (email, name, avatarURL, sub) let a swapped email and sub compile. Cover `AvatarURL`, `LastLoginAt` and `UpdatedAt` in the tests while there (they always pass `""` today).
- [ ] **[Repo] Add `CONTRIBUTING.md`.** The checklist in `.github/pull_request_template.md` links to it, so that link is broken today.

## P3 — Nice to have or blocked

- [ ] **[Roles] Rename `User.Role()`.** It returns a `CompanyRole`, while `Role` is also the name of the team role type, so callers can mix the two up. Something like `CompanyRoleOrEmpty()` is clearer.
- [ ] **[Roles] Fill two test gaps.** No `AtLeast` test checks that an unknown role (e.g. `Role("owner").AtLeast(RoleViewer)`) is denied, for team or company roles. `TestNewMeResponse` doesn't cover a user with `CompanyID` set but `CompanyRole` nil, which would return `company.role: ""`; the `users_company_role_pair` CHECK rules that state out in the DB, but the Go side has no test for it.
- [ ] **[Handlers] Make the `params` test helper reject an odd argument count.** A trailing key without a value is dropped silently, so a test can pass with an empty path param.
- [ ] **[Flag evaluation] Guard against a nil request.** `EvaluateFlag` reads `req.EvaluationContext` without a nil check, so a nil `*EvaluateFlagRequest` panics. The only caller always passes a request today; add a check (or take the struct by value) if another caller shows up.
- [ ] **[Flag evaluation] Test a percentage rule with no targeting key.** It only exercises the core engine's behaviour, not code in this package.
- [ ] **[Dev scripts] Stop pinning the dev port to 8080.** `.env.example`'s `GOFF_MGMT_OIDC_REDIRECTURL` assumes `goff.local:8080`, so `GOFF_MGMT_SERVER_PORT=9000` breaks the login callback. Derive the redirect URL from the port in `dev.sh` if other ports are needed (the Keycloak realm already accepts any port).
- [ ] **[Database] Add a company join date if the UI shows one.** `CompanyMember.CreatedAt` can only come from `users.created_at`, so "joined" would mean "account created". Add a `company_joined_at` column when a screen needs the real date.
- [ ] **[Repo] Update `AGENTS.md` once Studio has a working version.** It still describes a work in progress: `webui/` is listed as "not created yet" and it says no backward-compat shims are needed. When the API and UI ship, refresh the layout, commands and compatibility rules.
