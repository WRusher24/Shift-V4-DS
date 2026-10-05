# שיפט — Shift

**Production tracking and gamification platform for filling and packaging lines.**

Built for a detergents factory: two lines running simultaneously, live timers,
pallet-level point attribution, downtime capture, race leaderboards, and a
full-screen TV Mode scoreboard for the factory floor.

The entire user interface is native **Hebrew** and right-to-left. Names, product
names and notes can be typed in **Hebrew, Arabic or English**. Every number on
screen is a Western digit (`0-9`), always.

---

## Quick start

```bash
npm install
npm run dev
```

Open <http://localhost:3000>.

**No database, no configuration, no seeding step.** With `DATABASE_URL` empty
the app runs on a local JSON store and generates a complete demo factory on first
load — 12 workers with unique emojis, **3 dynamic production lines**, 6 detergent
products with pallet configurations, **two concurrent races** (one primary) plus
an archive, two weeks of batch history, today's production, and **two batches
running right now**.

For production, point it at Neon PostgreSQL — see **[DEPLOYS_GUIDE.md](./DEPLOYS_GUIDE.md)**.

---

## Documentation

| Document | Contents |
| --- | --- |
| **[DEPLOYS_GUIDE.md](./DEPLOYS_GUIDE.md)** | Local setup, environment variables, Neon provisioning, migrations, seeding, verification, Vercel deployment, architecture, troubleshooting |
| **[USER_GUIDE.md](./USER_GUIDE.md)** | How supervisors configure the system and how the crew runs a shift — batches, pallets, pauses, team changes, TV Mode, leaderboards, CSV reports |

---

## What it does

### Station — one card per configured line
The factory is not limited to two lines. Supervisors add, rename, reorder and
retire production lines from the admin console, and the dashboard grows a card
for each active one — each with a giant glowing live timer, product, active crew,
and live pallet / carton / point / PPH counters.

### Pallet logging with a confirm step
No dropdown. The dialog opens on a grid of large preset boxes; tapping one
**selects** it, and an explicit **אישור** commits. A tap alone never writes, which
removes duplicate rows from hesitant or repeated taps on a tablet. The dialog
stays open so a run of pallets is still quick.

### Concurrent race scoring
**Every open race scores from every running batch, at the same time.** A pallet is
attributed to each race that is open when it is logged — one ledger row per
(worker × open race). So:

- there is **no race to choose** when starting a batch;
- opening a race mid-shift needs no batch restart and loses no production;
- a batch legitimately appears on several boards at once;
- each race applies its own point multiplier to the same pallet.

Race attribution lives in exactly one place (`point_awards.race_id`), which keeps
each per-race leaderboard a single indexed scan and makes deleting a race a clean
cascade that touches nothing else.

### Global TV Mode
Leave **any** page untouched for 10 seconds and it becomes a full-screen animated
scoreboard: volume board, efficiency board, live batches, **pallets per product
today**, and race totals. Panel duration is configurable (default 8 s), and so is
**which panels appear at all** — tick the ones this site wants, untick the rest.
Any input restores the page instantly.

### Point splitting that is exact and fair
```
palletPoints = cartons × product point value
each member active at that instant receives palletPoints / memberCount
```
Computed in integer milli-points, so `sum(shares) === total` always holds — a
100-point pallet across 3 people yields 33.34 / 33.33 / 33.33, never a lost
remainder.

### Mid-batch team changes
Workers join and leave without disrupting anything. Points already earned are
kept; every *subsequent* pallet splits strictly among whoever is still active.

### Races that close themselves
Set an end date and the race archives itself the moment it passes — checked on
every read, so there is no scheduler to run and no window in which a finished race
still accumulates points. Races can also be closed manually (**סיום מרוץ**,
non-destructive) or deleted outright (**מחיקה**, which shows the exact impact —
points, awards, pallets, workers — before you confirm).

### Downtime tracked separately
Pauses require a structured reason (material shortage, maintenance, changeover,
break, quality hold). Pause time is banked completely apart from active working
time, so the efficiency metric cannot be inflated by idle hours.

### Two leaderboards, per race
**נפח (Volume)** — total points in the race.
**יעילות (Efficiency, PPH)** — points per net active hour.
A configurable **minimum-hours threshold** marks workers as **לא זכאי** until
they qualify. Scope tabs (**מרוצים פעילים / ארכיון / הכל**) filter the race list
and the page opens on the active races.

### Daily statistics, pallet-first
A dedicated screen ranked by **pallets per product**, with per-line totals, an
hour-by-hour production curve and the day's top workers. The same board is a
panel in the TV Mode loop.

### Reports built for payroll and maintenance
Five CSV exports (shift ledger, worker summary, downtime, pallet ledger, daily
production), UTF-8 **with a byte order mark** and Hebrew headers, ready for Excel
and Google Sheets.

### Uniqueness enforced in the database
Worker emoji, employee id, line code, one active batch per line, one active
primary race, and one open pause per batch are all partial unique indexes — not
just service-layer checks. Two tablets tapping at the same instant cannot corrupt
the state.

---

## Tech stack

| Layer | Choice |
| --- | --- |
| Framework | Next.js 15 (App Router, React 19) |
| Styling | Tailwind CSS 3.4 — **logical properties only** (`ms-`, `me-`, `ps-`, `pe-`, `start-`, `end-`) so RTL never breaks |
| Database | Neon PostgreSQL via `@neondatabase/serverless` (stateless HTTP driver) |
| ORM | Drizzle ORM + hand-audited SQL migrations |
| Validation | Zod, with Western-digit normalisation on every numeric field |
| Local dev | Zero-config JSON file store — same code path, different adapter |

---

## Project layout

```
app/                 App Router pages and the HTTP API
components/          layout · ui · station · tv · leaderboard · history · daily · admin
lib/
  domain/            pure logic: points, intervals, leaderboards, formatting
  repo/              one Repository interface, two adapters (Neon / JSON)
  services/          business rules, validation, Hebrew error messages
  api/               request schemas and shared route plumbing
  i18n/he.ts         the entire Hebrew UI dictionary
drizzle/             schema migrations and reporting views
scripts/             migrate · seed · reset · smoke-test
```

`domain` is pure and imports nothing outside itself. `services` depend on
`domain` and on the `Repository` interface — never on a database driver. That is
why identical business logic runs against Neon and against a JSON file.

---

## Verification

```bash
npm run typecheck     # strict TypeScript, no emit
npm run verify:seed   # seed + ledger assertions, no server needed
npm run dev           # terminal 1
npm run test:smoke    # terminal 2 — 147 end-to-end HTTP assertions
```

**`verify:seed`** generates the dataset into a throwaway store and checks the
fan-out ledger three ways: every award belongs to a race that was *open* when its
pallet was logged; every pallet scored in *every* race that was open (the check
that catches a missing fan-out row); and every race's points reconcile with its
own multipliers.

**`test:smoke`** asserts the invariants that matter over real HTTP: concurrent
scoring across all open races, a newly opened race receiving points from a running
batch immediately, destructive race deletion leaving every other race untouched,
automatic archiving of expired races, TV panel selection, batch setup carrying no
race field, exact point splits including non-divisible ones, dynamic line CRUD,
mid-batch team removal, pause accounting, daily statistics consistency, every
validation path, and all five CSV exports — including a byte-level BOM check and a
direct mojibake check.

It is **idempotent and self-cleaning**: it creates its own line, batch and races
and then removes them, so it can be run repeatedly against the same dataset.

The production build is verified end to end:

```
✓ Compiled successfully
✓ Checking validity of types
✓ Generating static pages (3/3)
Route (app)                              33 routes
```

---

## License

Proprietary — internal factory tooling.
