# Deployment Guide — Shift (שיפט)

Production tracking and gamification platform for filling and packaging lines.
Next.js (App Router) · Tailwind CSS · Drizzle ORM · Neon PostgreSQL.

This guide covers local setup, environment configuration, database provisioning,
seeding, verification, and deployment to Vercel.

---

## Table of contents

1. [Prerequisites](#1-prerequisites)
2. [Quick start (zero configuration)](#2-quick-start-zero-configuration)
3. [Environment variables](#3-environment-variables)
4. [Provisioning Neon PostgreSQL](#4-provisioning-neon-postgresql)
5. [Migrations and seeding](#5-migrations-and-seeding)
6. [Running locally](#6-running-locally)
7. [Verifying the installation](#7-verifying-the-installation)
8. [Deploying to Vercel](#8-deploying-to-vercel)
9. [npm scripts reference](#9-npm-scripts-reference)
10. [Architecture overview](#10-architecture-overview)
11. [Troubleshooting](#11-troubleshooting)
12. [Production hardening checklist](#12-production-hardening-checklist)

---

## 1. Prerequisites

| Requirement | Version | Notes |
| --- | --- | --- |
| Node.js | **20 LTS or newer** (22 recommended) | `node -v` |
| npm | 10 or newer | Ships with Node 20+ |
| A Neon account | free tier is enough | Only needed for PostgreSQL mode |
| A Vercel account | free tier is enough | Only needed for deployment |

No global tooling is required — everything runs from the project's
`devDependencies`.

---

## 2. Quick start (zero configuration)

The application ships with a built-in **Local File Mode**. With no database
configured it boots against a JSON document on disk and **auto-seeds itself** on
first load with a full demo factory: 12 workers with unique emojis, **3 dynamic
production lines**, 6 detergent products with pallet configurations, **three
races — two of them running concurrently** plus an archive, two weeks of batch
history, today's production, and **two batches running right now**.

```bash
npm install
npm run dev
```

Open <http://localhost:3000>.

That is the entire setup. Local File Mode is intended for development,
evaluation, demos and automated tests. **Do not use it in production** — the
filesystem on serverless platforms is ephemeral and read-only.

> The local store carries a schema version. After an upgrade that changes the
> document shape it is discarded and regenerated automatically, so a stale demo
> store never blocks a new feature.

---

## 3. Environment variables

Copy the template and fill it in:

```bash
cp .env.example .env.local
```

### Required for PostgreSQL mode

| Variable | Required | Description |
| --- | --- | --- |
| `DATABASE_URL` | Yes (production) | Neon **pooled** connection string. Used by the running application. |
| `DATABASE_URL_UNPOOLED` | Recommended | Neon **direct** connection string. Used by `db:migrate`, `db:seed` and `db:reset`. Falls back to `DATABASE_URL`. |

Example:

```dotenv
DATABASE_URL=postgresql://user:pass@ep-cool-name-123456-pooler.eu-central-1.aws.neon.tech/shift?sslmode=require
DATABASE_URL_UNPOOLED=postgresql://user:pass@ep-cool-name-123456.eu-central-1.aws.neon.tech/shift?sslmode=require
```

> **Leave `DATABASE_URL` empty to use Local File Mode.** The data layer selects
> its adapter automatically — no code changes, no feature flags.

### Optional

| Variable | Default | Description |
| --- | --- | --- |
| `SHIFT_FORCE_LOCAL_STORE` | `false` | Set to `true` to use the JSON store even when `DATABASE_URL` is set. Handy for offline UI work. |
| `SHIFT_LOCAL_STORE_PATH` | `.data/shift-db.json` | Where the JSON store lives. |
| `SHIFT_MIN_RACE_HOURS` | `30` | Default minimum active hours for a newly opened race. |
| `SHIFT_TV_IDLE_SECONDS` | `10` | Idle seconds before the dashboard switches to full-screen TV Mode. |
| `SHIFT_TV_SLIDE_SECONDS` | `8` | How long each TV Mode panel stays on screen. |
| `NEXT_DIST_DIR` | `.next` | Build output directory. Override on sandboxed/read-only CI runners where Next cannot clean `.next`. |

All `SHIFT_*` operational values can also be changed at runtime from
**Admin → הגדרות** (Settings); the database value wins over the environment
variable once set. Which TV Mode panels are shown is a database-only setting
(`tv_panels`), edited with checkboxes in the same screen.

---

## 4. Provisioning Neon PostgreSQL

1. Create a project at <https://console.neon.tech>.
2. Choose a region close to the factory (latency matters on the floor).
3. Open **Connection Details** and copy **two** strings:
   - the **Pooled connection** → `DATABASE_URL`
   - the **Direct connection** → `DATABASE_URL_UNPOOLED`
4. Paste both into `.env.local`.

The application uses the `@neondatabase/serverless` HTTP driver, so no TCP
socket, connection pool or `pg` native binding is needed. That is what makes it
work identically in local Node, Vercel's Node runtime and Vercel Edge.

---

## 5. Migrations and seeding

The schema lives in `lib/db/schema.ts` (Drizzle) and the hand-audited SQL lives
in `drizzle/0000_init.sql`.

```bash
# Apply every migration in ./drizzle, once each (tracked in __shift_migrations)
npm run db:migrate

# Populate the demo dataset (no-op if the database already has workers)
npm run db:seed

# One-shot: migrate + seed
npm run db:setup
```

Useful variants:

```bash
npm run db:seed -- --force     # wipe operational data, then reseed
npm run db:reset               # wipe only
npm run db:reset -- --seed     # wipe, then reseed
npm run db:generate            # regenerate SQL from schema.ts after edits
npm run db:push                # push schema straight to the DB (dev only)
```

`db:reset` refuses to run against a host whose name looks like a production
branch (`prod`, `production`, `main`) unless you pass `-- --yes-really`.

### What the seed creates

| Entity | Count | Notes |
| --- | --- | --- |
| Workers | 12 | Hebrew, Arabic and English names; every emoji unique |
| **Production lines** | 3 | `קו A`, `קו B`, `קו מילוי 3` — proves lines are dynamic, not hard-coded |
| Products | 6 | Detergent SKUs with size, carton layout and point value |
| Pallet sizes | 12 | Two predefined options per product (e.g. 28 and 32 cartons) |
| Races | 3 | **Two ACTIVE concurrently** (one primary) plus an archive, each with points |
| Race point overrides | 2 | A different multiplier per race on the same product |
| Batches | ~60 | Two weeks of history, today's production, **two running at once** |
| Pallet logs | ~1,000 | Each fanned out across every race that was open at the time |
| Point awards | ~4,400 | Including ~850 fan-out rows — pallets that scored in 2+ races |

The seed is deterministic (seeded PRNG), so every install produces identical
numbers — useful for screenshots, demos and regression comparisons.

### Migrations

| File | Contents |
| --- | --- |
| `drizzle/0000_init.sql` | Initial schema: workers, products, pallet sizes, races, batches, pallets, point awards, pauses, settings, reporting views |
| `drizzle/0001_dynamic_lines_and_multi_race.sql` | Dynamic `production_lines`, multiple concurrent races with a single primary, `race_product_points` overrides, per-pallet race attribution, TV slide setting |
| `drizzle/0002_concurrent_race_scoring.sql` | Concurrent scoring: race attribution moves entirely onto `point_awards` (one row per worker × open race); `batches.race_id` and `pallet_logs.race_id` dropped; `point_awards.race_id` becomes `ON DELETE CASCADE`; template lineage removed; `tv_panels` setting |

Both `0001` and `0002` upgrade a **populated** database in place and delete no
operational rows. `0002` is the significant one: it removes the redundant race
columns so there is exactly one source of truth for attribution, while every
existing award keeps its race and therefore reads back identically.

### Seed data in Local File Mode

No command is needed. On the first request, if the JSON store is empty, the
same dataset is generated automatically. To regenerate it, delete
`.data/shift-db.json` and reload the page.

---

## 6. Running locally

```bash
npm run dev          # development server on http://localhost:3000
npm run build        # production build
npm run start        # serve the production build
npm run typecheck    # strict TypeScript check, no emit
npm run lint         # Next.js lint
```

On a factory floor the dashboard is normally opened in kiosk mode:

```bash
# Chrome / Edge, full screen, no browser chrome
chrome --kiosk http://localhost:3000
```

---

## 7. Verifying the installation

### Type checking

```bash
npm run typecheck
```

### Seed and ledger verification (no server needed)

```bash
npm run verify:seed
```

Generates the seed into a throwaway local store and asserts the fan-out ledger
with three independent checks:

1. **Attribution** — every award belongs to a race that was *open* at the moment
   its pallet was logged.
2. **Completeness** — every pallet scored in *every* race that was open then. This
   is the check that catches a silently missing fan-out row; a pure value
   reconciliation cannot, because it derives its pallet set from the awards
   themselves.
3. **Value** — for each race, `sum(awards) == sum(cartons × that race's effective
   multiplier)`. Catches a wrong multiplier.

It is the fastest way to validate a change to the seed or to the attribution
rules, and it is what CI should run.

### End-to-end smoke test

With a server running, execute the smoke test against it. It asserts the
platform's core invariants over real HTTP and cleans up after itself:

```bash
npm run dev                       # terminal 1
npm run test:smoke                # terminal 2 — defaults to :3006
node scripts/smoke-test.mjs http://localhost:3000   # or an explicit base URL
```

Coverage (147 assertions):

- health endpoint and storage diagnostics, including line, race and archive counts
- station state: one card per configured line, a primary race, every active race,
  the TV idle timeout, the TV slide duration and the TV panel rotation
- **concurrent scoring**: one pallet from one batch is attributed to *every*
  active race at once, each race's leaderboard gains those points immediately, and
  each race's pallet count increases by exactly one
- **a newly opened race starts receiving points from a running batch
  immediately** — no batch restart
- **destructive race deletion**: the impact report is correct, the deletion
  removes the race's own awards, and every *other* race's totals are unchanged
- **automatic archiving**: a race created with a past end date is archived on the
  spot, lands under the FINISHED scope, and records why it closed
- **TV panel selection**: a subset round-trips, order is canonicalised, an empty
  rotation is valid, and an unknown key is rejected with 422
- batch setup carries **no race field** and the batch view is not bound to a race
- point split maths: `total = cartons × pointValue` and `sum(shares) === total`
  exactly, including a non-divisible split
- dynamic line CRUD: create, duplicate-code rejection, appears on the dashboard,
  delete
- mid-batch team change: a removed worker keeps their points and all *subsequent*
  pallets split only among the remaining members
- pause start / resume, rejection of a second concurrent pause, and
  `active + paused === elapsed`
- pallet undo
- validation: zero cartons, missing cartons, duplicate emoji, second batch on a
  busy line
- daily statistics consistency
- Western-digit enforcement in every JSON payload
- all five CSV exports: 200, UTF-8 BOM **bytes**, `text/csv`, attachment
  disposition, Hebrew headers, Western digits only, no replacement characters,
  **exactly one BOM** and **exactly one `sep=,` hint**
- batch finish and line release

The test is **idempotent and self-cleaning**: it creates its own line, batch and
races, then removes them, so it can be run repeatedly against the same dataset.

### Manual checks

| What | Where |
| --- | --- |
| RTL + Hebrew chrome | any page — `<html lang="he" dir="rtl">` |
| Live timers, one card per line | `/` — start a batch on any configured line |
| **Confirm-before-log pallet entry** | `/` → **+ הוסף משטח** — select a preset, then אישור |
| **Global TV Mode** | leave **any** page untouched for 10 s (try `/leaderboard`) |
| TV panel duration + selection | `/admin` → **הגדרות** → slide duration and the panel checkboxes |
| Dual leaderboards per race | `/leaderboard` → scope tabs (פעילים / ארכיון / הכל) then pick a race |
| **Daily stats** | `/daily` — pallets per product, per line, per hour |
| **Dynamic lines** | `/admin` → **קווי ייצור** — add, rename, reorder, retire |
| **Race finish / delete** | `/admin` → **מרוצים** — סיום מרוץ (archive) or מחיקה (destructive, impact shown first) |
| **Auto-archiving** | create a race with a past end date and watch it archive immediately |
| History + pause breakdown | `/history` → **פרטים** on any row |
| CSV exports | `/admin` → **דוחות וייצוא** (five reports) |

---

## 8. Deploying to Vercel

### 8.1 Push the repository

```bash
git init
git add .
git commit -m "Shift — initial release"
git remote add origin <your-repo-url>
git push -u origin main
```

### 8.2 Import into Vercel

1. <https://vercel.com/new> → import the repository.
2. Framework preset is detected automatically as **Next.js**. Leave build and
   output settings untouched.
3. Add the environment variables **before** the first deploy:

   | Name | Value | Environments |
   | --- | --- | --- |
   | `DATABASE_URL` | Neon **pooled** string | Production, Preview, Development |
   | `DATABASE_URL_UNPOOLED` | Neon **direct** string | Production, Preview, Development |
   | `SHIFT_MIN_RACE_HOURS` | `30` | Production (optional) |
   | `SHIFT_TV_IDLE_SECONDS` | `10` | Production (optional) |

4. Deploy.

### 8.3 Migrate and seed the production database

Run these from your machine, pointed at the production database — or from
Vercel's build command. They are deliberately **not** part of the build, so a
deploy can never wipe or seed a live factory by accident.

```bash
DATABASE_URL_UNPOOLED="postgresql://...prod..." npm run db:migrate
DATABASE_URL_UNPOOLED="postgresql://...prod..." npm run db:seed
```

Then confirm the deployment:

```bash
curl https://your-app.vercel.app/api/health
```

Expect `"storageKind":"drizzle"`. If it reports `"local"`, `DATABASE_URL` is not
visible to the deployment — re-check the environment variables and redeploy.

### 8.4 Using Neon preview branches (recommended)

Vercel's Neon integration can create a database branch per preview deployment
and inject `DATABASE_URL` automatically. Enable it if you want each pull request
to get an isolated copy of the schema.

### 8.5 Post-deploy checklist

- [ ] `/api/health` reports `"storageKind":"drizzle"` and non-zero counts
- [ ] `/` renders with Hebrew chrome and both line cards
- [ ] A batch can be started, a pallet logged, and points appear instantly
- [ ] TV Mode engages after 10 seconds of inactivity and exits on any input
- [ ] A CSV export downloads and opens correctly in Excel
- [ ] A wall-mounted display has been pointed at the production URL

---

## 9. npm scripts reference

| Script | Purpose |
| --- | --- |
| `npm run dev` | Development server with hot reload |
| `npm run build` | Production build |
| `npm run start` | Serve the production build |
| `npm run typecheck` | Strict TypeScript check (`tsc --noEmit`) |
| `npm run lint` | Next.js lint |
| `npm run verify:seed` | Generate the seed in a throwaway store and assert the ledger (no server needed) |
| `npm run test:smoke` | End-to-end HTTP smoke test (server must be running) |
| `npm run verify` | `typecheck` + `verify:seed` + `test:smoke` |
| `npm run db:generate` | Regenerate SQL migrations from `lib/db/schema.ts` |
| `npm run db:migrate` | Apply migrations in `./drizzle` |
| `npm run db:push` | Push the schema directly (development only) |
| `npm run db:seed` | Seed the demo dataset |
| `npm run db:reset` | Delete all operational data |
| `npm run db:setup` | `db:migrate` + `db:seed` |

---

## 10. Architecture overview

```
app/
  layout.tsx                 <html lang="he" dir="rtl"> + app chrome
  page.tsx                   Station dashboard (server-rendered, then live)
  daily/ leaderboard/ history/ admin/
  api/                       HTTP surface (route handlers)
    state/                   single polling endpoint for the floor screens
    batches/                 start, pause, resume, pallets, members, finish
    lines/                   production line CRUD + reorder
    workers/ products/ settings/
    races/                   create, update, finish (archive), delete, impact,
                             primary, per-race point multipliers
    daily/                   daily production statistics
    reports/[report]/        CSV: batches | workers | downtime | pallets | daily
    health/                  storage diagnostics

components/
  layout/     app shell — owns the GLOBAL TV Mode idle timer
  ui/ station/ tv/ leaderboard/ history/ daily/ admin/

lib/
  domain/       pure logic — no I/O, fully unit-testable
    types.ts        canonical domain model
    points.ts       exact point splitting in integer milli-points
    intervals.ts    half-open interval algebra for active working time
    leaderboard.ts  volume + efficiency rankings, per-race
    batch.ts        live batch statistics
    format.ts       Western-digit number / duration / date formatting
  repo/         persistence — one interface, two adapters
    types.ts             Repository contract
    drizzle-repository.ts Neon PostgreSQL
    local-repository.ts   JSON file store (zero-config, versioned)
  client/       browser-only helpers
    hooks/useFrozenValue.ts   freeze dialog props so polling cannot disturb them
  services/     business rules, validation, Hebrew errors
    lines.ts        dynamic production lines
    races.ts        multi-active races, primary default, auto-archiving
    batches.ts      fan-out point attribution across all open races
    daily.ts        pallet-first daily statistics
    reports.ts      history ledger and CSV builders
  api/          request schemas + shared route plumbing
  i18n/he.ts    the entire Hebrew UI dictionary
  bootstrap.ts  first-boot auto-seed for Local File Mode

drizzle/0000_init.sql                          initial schema
drizzle/0001_dynamic_lines_and_multi_race.sql  lines, multi-race, per-pallet race
drizzle/0002_concurrent_race_scoring.sql       ledger-only attribution, cascades
scripts/                                       migrate · seed · reset · verify-seed · smoke-test
```

**Layering rule.** `domain` is pure and has no imports outside itself.
`services` depend on `domain` and on the `Repository` interface — never on a
database driver. `app/api` is a thin translation layer. This is why the same
code runs against Neon and against a JSON file with no branching in the
business logic.

### Key domain decisions

**Points are an immutable ledger, fanned out across races.** `point_awards` rows
are never updated or deleted, and every one carries its own `race_id`. When a
pallet is logged it is attributed to **every race that is open at that instant**,
producing one row per (worker × open race):

```
28 cartons × 3 crew × 2 open races = 6 award rows
```

That is what "all active batches contribute to all active races concurrently"
means in storage. Three consequences follow:

- **No race selection when starting a batch**, and no re-pointing when a race
  opens. A new race's counters start at zero because no award carries its id yet,
  and the next pallet logged on any line contributes to it automatically.
- **A batch is not tied to a race**, so it legitimately appears on several boards
  at once, each computed from its own award rows.
- **Each race applies its own multiplier**, so the same pallet can be worth
  different amounts in different races.

**Race attribution lives in exactly one place.** `batches.race_id` and
`pallet_logs.race_id` were removed in migration `0002`. A race's pallet set is
derived from its award rows, which keeps a per-race leaderboard a single indexed
scan and makes deleting a race a clean cascade that touches nothing else.

**`pallet_logs.total_points` is the base value.** It is `cartons × the product's
own pointValue`, not any race's override. Batch and daily totals are built from
it, so editing a race multiplier never shifts historical production figures.

**Working time is clipped to the race window.** `workerActive =
duration( clip(membership, batchWindow ∩ raceWindow) \ pauses )`. A race that
opened mid-shift only counts the hours worked after it opened, and a batch that
contributed to two races has its time split correctly between them.

**Point splitting is exact.** `cartons × pointValue` is converted to integer
milli-points, divided, and the remainder distributed one milli-point at a time.
The invariant `sum(shares) === pallet.total_points` always holds — plain float
division would leak a remainder on any non-divisible split.

**Races close themselves.** A race with an end date is archived the first time
anything reads races after that deadline (`archiveExpiredRaces`, called at the top
of every race read). One indexed query, idempotent, no scheduler and no window in
which a finished race can still accept points.

**Uniqueness is enforced in the database.** Worker emoji, employee id, line code,
one active batch per line, one active primary race, and one open pause per batch
are all partial unique indexes — not just service-layer checks. Two tablets
tapping at the same instant cannot corrupt the state.

**Lines and races are data, not code.** The factory can grow from two lines to
five, and run several concurrent races, entirely from the admin console.

### Known scaling characteristics

Leaderboard and report aggregation happens in application memory over the rows
belonging to one race window (or one filter range), not via SQL `GROUP BY`. At
the scale this platform targets — tens of workers, a few hundred batches per
race, a few thousand pallets — this is fast and keeps the business logic in one
auditable place. If a deployment grows past roughly 100k point-award rows per
race, replace the aggregations in `lib/services/leaderboard.ts` and
`lib/services/reports.ts` with the SQL views already provided in
`drizzle/0000_init.sql` (`v_race_volume`, `v_downtime_by_reason`).

---

## 11. Troubleshooting

### The app shows "אחסון מקומי" in the header instead of "PostgreSQL"

`DATABASE_URL` is not visible to the running process. Check `.env.local`
(local) or the Vercel environment variables (deployed), then restart. Confirm
with `curl http://localhost:3000/api/health`.

### `DATABASE_URL is not configured`

You ran a `db:*` script without a connection string. Either set it, or use
Local File Mode by simply running `npm run dev` with `DATABASE_URL` empty.

### `EPERM: operation not permitted, open '.next/trace'`

Seen on sandboxed or locked-down CI runners where Next.js cannot create or clean
its own build directory. Point the build at a fresh directory:

```bash
NEXT_DIST_DIR=.next-ci npm run build
```

### `SAFE_DELETE_BULK_REJECTED` during build

A sandbox guard blocked Next.js from bulk-deleting stale files in `.next`. Same
fix as above — build into a fresh `NEXT_DIST_DIR`. Nothing in the project needs
to be deleted.

### `line_busy` when starting a batch

The line already has an ACTIVE batch. Finish it, or cancel it from the line card
(**ביטול אצווה ללא שמירה**).

### `line_running` when deleting a line

The line is currently running a batch. Finish or cancel the batch first —
deleting the line would orphan a live shift in the production ledger.

### `no_active_race` when starting a batch

It is no longer an error — a batch can be started with no race open, and the UI
shows a warning that points will not be scored. Production tracking is useful on
its own, and blocking the floor on race configuration would be wrong. Open a race
in **Admin → מרוצים → פתיחת מרוץ חדש** and the next pallet logged on any line
starts scoring in it.

### The leaderboard looks empty after a new race was opened

That is correct. A new race starts at zero — no point award carries its id yet.
Switch the scope tabs to **ארכיון** or **הכל** and pick an earlier race to see its
standings. The next pallet logged on any line will appear on the new board within
seconds.

### A race disappeared from the active list

Its configured end date has passed, so it was archived automatically the first
time races were read after that moment. Find it under the **ארכיון** scope tab, or
in **Admin → מרוצים → מרוצים קודמים**. To bring it back, clear or move its end
date.

### Deleting a race warns about losing points

Correct, and intentional. Deleting a race cascades to `point_awards`, so every
point scored in it is destroyed. The dialog fetches the real impact first and
states the exact number of points, awards, pallets and workers involved. Use
**סיום מרוץ** instead if you want to keep the data — it archives the race and
costs nothing.

### TV Mode shows nothing

Every panel has been switched off in **הגדרות → שקופיות במצב מסך**. Tick at least
one, or press **בחירת הכול**.

### TV Mode does not engage

TV Mode is suppressed while a dialog is open, and it needs the station payload
to have loaded at least once. Check the idle timeout in
**Admin → הגדרות → זמן חוסר פעילות לפני מצב מסך**. The countdown badge on the
station dashboard shows the remaining seconds.

### The emoji is rejected as already in use

That is the uniqueness rule working as designed. Every worker must have a
distinct emoji so they are identifiable at a glance on the floor. Taken emojis
are struck through in the picker.

### CSV opens with garbled Hebrew in Excel

The exports already include a UTF-8 BOM and a `sep=,` hint. If it is still
wrong, open the file via **Data → From Text/CSV** and pick **UTF-8**; some
locale-specific Excel builds ignore the BOM for `.csv` files.

### Deleting a worker or product did not remove it

Workers and products that already appear in production history are
**deactivated** rather than deleted, so the payroll ledger stays intact. The UI
reports this explicitly.

---

## 12. Production hardening checklist

The platform ships with sensible defaults. Before going live on a real line,
consider:

- [ ] **Authentication.** There is no login layer. Put the deployment behind
      Vercel Password Protection, an identity-aware proxy, or add Next.js
      middleware with your SSO provider. Admin routes (`/admin`, and the
      `/api/workers|products|races|settings` endpoints) should be restricted to
      supervisors.
- [ ] **Backups.** Enable Neon point-in-time restore, and schedule a periodic
      export of the CSV reports as an off-platform archive.
- [ ] **Monitoring.** Wire `/api/health` into your uptime monitor and alert on
      `ok: false`.
- [ ] **Timezone.** All timestamps are stored as `timestamptz` (UTC). The UI
      renders them in the device's local time, which is what a single-site
      factory wants. For a multi-site rollout, pin an explicit display time zone.
- [ ] **Race thresholds.** Set `min_active_hours` deliberately — it is the
      control that stops hour-stuffing from deciding the efficiency prize.
- [ ] **Race cadence.** For a recurring monthly race, close the previous one with
      **סיום + שימוש כתבנית** so the prize, threshold and point multipliers carry
      over automatically.
- [ ] **Point multipliers.** Review the per-race multipliers in
      **מרוצים → מכפילי נקודות למרוץ הזה** after adding a new SKU, so it is
      weighted correctly from day one.
- [ ] **Line list.** Retire decommissioned lines rather than deleting them, so
      their historical batches keep a readable name in reports.
- [ ] **Device setup.** Install the station URL as a PWA/kiosk shortcut and
      disable sleep on the wall displays.
