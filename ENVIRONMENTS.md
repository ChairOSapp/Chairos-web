# Environments: dev → staging → main

Three tiers. `dev` is where you work day to day, `staging` is the
pre-production checkpoint, `main` is production and its workflow is
unchanged.

## 1. Branch workflow

```
dev  --(merge when stable)-->  staging  --(merge when verified)-->  main
```

- Push active work to `dev` directly. Frequent pushes expected, less stable.
- Once a batch of work on `dev` looks good, merge `dev` → `staging`.
- Once `staging` has been verified (manually click through the app, check the
  auto-deployed preview), merge `staging` → `main`. This is production —
  same review discipline as today, nothing about `main`'s workflow changed.

All three branches exist locally and on `origin`:

```bash
git checkout dev
git push origin dev
```

## 2. Vercel — auto-deploy per branch

**Status: not yet configured.** This repo's Vercel project is on a personal
(non-team) account that the Vercel MCP integration can't reach, and the
Vercel CLI isn't installed locally, so this step needs to be done by hand
(or by an agent after `vercel login` has been run interactively — that step
requires a browser and can't be scripted).

Steps to finish this:

1. `npm i -g vercel` (if not already installed).
2. `vercel login`, then `vercel link` from the repo root to connect it to
   the existing Vercel project.
3. In the Vercel dashboard → Project → Settings → Git:
   - Confirm **Production Branch** is `main` (unchanged).
   - Every other branch auto-deploys as a Preview by default — `dev` and
     `staging` pushes will already trigger preview builds with no extra
     config once the repo is linked.
4. In Project → Settings → Domains, add:
   - `staging.chairos.cc` → assign it to the `staging` **branch** (not
     Production). Vercel will show a CNAME/A record to add — Cloudflare is
     confirmed as the DNS host for `chairos.cc`, so add that record there
     (proxy status doesn't matter for the CNAME target, but keep it
     consistent with the other subdomains already on the zone).
   - `dev` stays on Vercel's auto-generated preview URL
     (`chairos-web-git-dev-<team>.vercel.app`) — acceptable per spec since
     dev is expected to be less stable; a `dev.chairos.cc` domain can be
     added later the same way if wanted.

## 3. Supabase — separate branches for dev and staging

**Status: done.** Two persistent Supabase branches exist, each its own
isolated Postgres database (not shared with each other or with
production):

| Branch  | Project ref (Supabase) |
|---------|-------------------------|
| dev     | `gqkqmhgxbditsfrcktkq`  |
| staging | `kuaqtycamwriqbyedwvz`  |
| main (production) | `gobjeojkyrqoibkbeaau` |

Cost: ~$0.0134/hour each (~$9.68/mo per branch, ~$19.36/mo combined),
approved and running.

**Note on how these got created:** production's tracked migration history
was missing the original base-schema creation (`profiles`, `shops`,
`appointments`, etc. were created directly against the database outside of
any migration file, before migration tracking started on this project).
That's invisible day-to-day, but it meant Supabase branching — which
replays the full migration history from an empty database — failed
immediately on the very first migration. Fixed in two steps:
1. Inserted a baseline schema migration (version `20260101000000`, also
   saved locally at `supabase/migrations/20260101000000_baseline_schema.sql`)
   that captures production's actual current schema (49 tables, 99 RLS
   policies, functions, and triggers) as a single starting point.
2. Since that baseline already represents the *complete* current schema,
   the 76 original incremental migration rows after it in
   `supabase_migrations.schema_migrations` became redundant and started
   colliding with it (e.g. `CREATE POLICY` on something the baseline
   already created) — so those rows were removed from the tracked history.
   This only changes what a *future* full replay executes; it does not
   touch production's actual live tables, which were never re-run.

Also worth knowing: one existing migration
(`pin_search_path_stripe_schema_functions`) referenced the `stripe` schema
(Stripe Sync Engine tables), which is bootstrapped directly against
production outside of migration history entirely — branches don't have it.
That migration is now guarded to skip cleanly when the `stripe` schema
isn't present, both in the tracked history and in the local file at
`supabase/migrations/20260824115200_pin_search_path_stripe_schema_functions.sql`.

Going forward, new branches (and any full migration replay) work
correctly — both `dev` and `staging` reached `FUNCTIONS_DEPLOYED` and were
verified to have matching table/policy counts against production.

Both branches are seeded independently (separate rows, separate UUIDs —
not copied between them) with the same realistic test pattern:
- **Fade District Barbershop** (barbershop, Austin TX) — owner Marcus Webb,
  2 services (Classic Haircut $35, Beard Trim $20)
- **Luxe Salon & Spa** (salon, Denver CO) — owner Elena Torres, 2 services
  (Signature Cut & Style $85, Color & Highlights $150)
- **Iron & Ink Tattoo** (tattoo, Portland OR) — owner Jordan Reyes, 2
  services (Small Tattoo $100, Half-Sleeve Session $400)
- One **Solo Chair** profile — Casey Nguyen, `plan_type = 'solo'`, no shop

Owner accounts use `owner1/2/3@<branch>-seed.chairos.cc` and
`solo@<branch>-seed.chairos.cc` emails (e.g. `owner1@dev-seed.chairos.cc`
on the dev branch, `owner1@staging-seed.chairos.cc` on staging) — these are
real `auth.users` rows (with the same trigger-driven `profiles` creation as
a real signup) with a placeholder password, not sent through any email
provider, so they're safe to use for manual login testing on those
branches. The `vertical_config` reference table (staff labels per vertical)
was also seeded on both — it's static lookup data the app needs to render
correctly, and a schema-only baseline doesn't carry table *data* across.

## 4. Environment variable isolation

| Variable set | dev | staging | production (main) |
|---|---|---|---|
| Stripe | test mode | test mode | **live** (unchanged) |
| Square | sandbox | sandbox | **live** (unchanged) |
| Resend | separate `dev-staging` API key | same key as dev | production's existing key (unchanged) |
| Twilio | test credentials | test credentials | **live** (unchanged) |
| Supabase | `gqkqmhgxbditsfrcktkq` project keys | `kuaqtycamwriqbyedwvz` project keys | `gobjeojkyrqoibkbeaau` keys (unchanged) |

Gathered so far (test/sandbox only, scoped to dev+staging — see note below
on where these actually need to end up):

- **Stripe test mode**: publishable key, secret key, and two matching test
  products created (`Shop Owner` $79/mo, `Barber Booking Application`
  $25/mo) so `STRIPE_PRICE_SHOP` / `STRIPE_PRICE_SOLO` have test
  equivalents. `STRIPE_WEBHOOK_SECRET` still needs a webhook endpoint
  created at https://dashboard.stripe.com/test/webhooks once dev/staging
  have real deployment URLs to point it at (step 2 above).
- **Resend**: a `dev-staging` API key was created (Sending-access only,
  separate from production's key so dev/staging sends are distinguishable
  in the Resend logs). Point any test client email addresses in seed data
  at `delivered@resend.dev` / `bounced@resend.dev` (Resend's simulation
  addresses) or your own `+test` alias — never a real client's address.
- **Twilio**: done. Used Twilio's own dedicated **Test credentials** (a
  separate Test Account SID / Test Auth Token pair Twilio provides
  specifically for safe testing — they can't send real SMS or incur
  charges), found under Twilio Console → Account → API keys & tokens →
  Test credentials. `TWILIO_PHONE_NUMBER` for dev/staging should use one
  of Twilio's [magic test numbers](https://www.twilio.com/docs/iam/test-credentials#test-sms-messages)
  (e.g. `+15005550006`, the "valid number" test case) rather than a real
  purchased number.
- **Square sandbox**: partially done. The Sandbox Application ID was
  retrieved directly (`sandbox-sq0idb-OQpdzUoGZ88nHmLcZDRMKg`). The
  Sandbox Access Token and Sandbox Application Secret are **copy-only** in
  Square's dashboard (Developer Console → ChairOS → Credentials/OAuth,
  Sandbox toggle) — Square deliberately doesn't render them on screen, only
  a copy-to-clipboard button, so they need to be pasted in directly by
  whoever has dashboard access rather than read off a screenshot.
  `SQUARE_WEBHOOK_SIGNATURE_KEY` needs an actual webhook subscription
  created against a real dev/staging URL first (Section 2), so that's
  still pending on Vercel being linked too.

**Once Vercel is linked** (step 2), these get set per-branch via
`vercel env add <NAME> preview --git-branch dev` (and again with
`--git-branch staging`), so they're scoped to exactly those two branches
and never touch Production's environment variables.

## 5. Rollback — the actual safety net

Two independent rollback paths, since auto-deploy means a bad change can
land before anyone reviews it.

### Vercel: roll back a bad deploy

1. Go to the Vercel dashboard → your project → **Deployments**.
2. Find the last known-good deployment for the affected branch (`dev` or
   `staging`) — filter by branch name at the top of the list.
3. Click the **⋯** menu on that deployment → **Promote to Production**
   (for `main`) or, for a `dev`/`staging` preview, simply push a revert
   commit — preview URLs always reflect the latest push, so the fastest
   preview-branch rollback is `git revert` + push, not a dashboard action.
   For `main` specifically, "Promote to Production" on an older deployment
   is the instant rollback button — no rebuild needed, it re-points
   production traffic at that existing build immediately.
4. Confirm the rollback: open the branch's URL and check the timestamp /
   content matches the older deployment.

This is built into every Vercel project regardless of plan — nothing to
configure, just know where the button is (Deployments tab → **⋯** → Promote
to Production) before you need it under pressure.

### Supabase: restore a branch after a bad migration

Automatic deploys mean a broken migration can apply before it's reviewed.
Two options, fastest first:

**Option A — reset the branch (fastest, loses branch-local data):**
1. Supabase Dashboard → your project → **Branches**.
2. Click the affected branch (`dev` or `staging`) → **Reset branch**.
   This tears it down and rebuilds it fresh from the current migration
   history — use this if the bad migration hasn't been merged into what
   `main`/production replays from, i.e. the fix is "make dev correct
   again," not "undo something already in production."
3. Re-run the seed step (Section 3) if you need the test data back.

**Option B — point-in-time restore from backup (when you need the actual
data back, not just a clean schema):**
1. Supabase Dashboard → **production** project (`gobjeojkyrqoibkbeaau`) →
   **Database** → **Backups**. Daily backups cover the whole project;
   branches are separate Postgres instances but inherit the same backup
   tooling — go to the branch's own project view (switch project via the
   ref, e.g. `kuaqtycamwriqbyedwvz` for staging) → **Database** → **Backups**
   → pick a timestamp before the bad migration → **Restore**.
2. Restoring creates a new point-in-time snapshot; verify the app works
   against it before treating the incident as resolved.

**In both cases:** the moment a bad migration is confirmed, also revert the
commit that introduced it on `dev`/`staging` in git — otherwise the next
auto-deploy just reintroduces the same schema change.

## 6. Verification checklist (Task 7)

- [ ] Push a trivial change to `dev` → confirm it auto-deploys, `staging`
      and `main` untouched. *(Pending: needs Vercel linked per Section 2.)*
- [ ] Merge `dev` → `staging` → confirm the same.
- [ ] Deliberately push a broken change, then roll it back (Section 5) →
      confirm the rollback restores working state.
- [ ] Confirm `main`/production was never touched during any of the above.

The git-branch side of this (creating `dev`/`staging`, merge flow) and the
Supabase side (isolated branches, baseline fix, seed data) are done and
independently verifiable right now. The deploy-and-rollback verification
in this section needs Vercel linked first (Section 2) — nothing to test
against yet without that.

<!-- verified: first Vercel auto-deploy trigger, 2026-09-09T14:37:27Z -->
