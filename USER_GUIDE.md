# User Guide — Shift (שיפט)

A practical walkthrough of the production tracking and gamification platform for
the filling and packaging lines.

The interface is entirely in Hebrew and right-to-left. Names, product names and
notes can be typed freely in **Hebrew, Arabic or English** — the system stores
and displays all three natively. Every number on screen is a Western digit
(`0-9`), always.

---

## Contents

1. [The screens at a glance](#1-the-screens-at-a-glance)
2. [Supervisor: first-time setup](#2-supervisor-first-time-setup)
3. [Running a batch on the floor](#3-running-a-batch-on-the-floor)
4. [Logging pallets and how points are split](#4-logging-pallets-and-how-points-are-split)
5. [Pauses and downtime](#5-pauses-and-downtime)
6. [Changing the team mid-batch](#6-changing-the-team-mid-batch)
7. [Finishing a batch](#7-finishing-a-batch)
8. [TV Mode](#8-tv-mode)
9. [Leaderboards and races](#9-leaderboards-and-races)
10. [Daily statistics](#10-daily-statistics)
11. [History and reports](#11-history-and-reports)
12. [Admin reference](#12-admin-reference)
13. [FAQ and rules of thumb](#13-faq-and-rules-of-thumb)

---

## 1. The screens at a glance

| Screen | Hebrew | What it is for |
| --- | --- | --- |
| Station | תחנת עבודה | The floor screen. One card per production line, live timers, pallet logging, pauses. |
| Daily | סטטיסטיקה יומית | Today's production: pallets per product, per line, per hour. |
| Leaderboard | לוח דירוג | Volume and efficiency standings, for any race — running or archived. |
| History | היסטוריה | The shift ledger with pause breakdowns and CSV export. |
| Admin | ניהול | Workers, production lines, products, races, settings, reports. |

The header always shows the storage indicator:

- **PostgreSQL** (green) — data is being written to the production database.
- **אחסון מקומי** (amber) — the temporary local store. Fine for a demo, **not**
  for a real shift.

The header also shows the current **primary race** — the one your pallets are
being counted into.

> **TV Mode works on every screen.** Leave any page untouched for a few seconds
> and it becomes a full-screen scoreboard. See [section 8](#8-tv-mode).

---

## 2. Supervisor: first-time setup

Do this once, in this order.

### 2.1 Add the crew — ניהול → עובדים

**הוספת עובד** opens a form with three fields:

| Field | Hebrew | Notes |
| --- | --- | --- |
| Full name | שם מלא | Type in Hebrew, Arabic or English — all three work. |
| Employee id | מספר עובד | Used on reports and payroll. Must be unique. |
| Profile emoji | אימוג׳ אישי | **Must be unique across the whole crew.** |

The emoji picker greys out and strikes through any emoji already taken, so a
collision is impossible to miss. If two supervisors save the same emoji at the
same moment, the server rejects the second one with a Hebrew error.

> **Why the emoji rule?** On a leaderboard read from five metres away, an emoji
> is faster to recognise than a name. Two people with the same one makes the
> board unreadable.

An employee who already appears in production history cannot be hard-deleted —
they are **deactivated** instead (**השבתה**), which removes them from the
selection lists while keeping every point they ever earned. The screen tells you
which of the two happened.

### 2.2 Configure production lines — ניהול → קווי ייצור

Lines are **fully dynamic**. The system is not limited to two — add as many as
the factory runs, and the station dashboard grows a card for each one
automatically.

| Field | Hebrew | Notes |
| --- | --- | --- |
| Line name | שם הקו | Shown on the floor. Free text — Hebrew, Arabic or English. |
| Short code | קוד קצר | Letters and digits, e.g. `LINE_C`. Must be unique. Appears in dense tables and CSV exports. |
| Display order | סדר תצוגה | Lower number = shown first. The ▲ ▼ buttons reorder directly. |
| Line active | קו פעיל | Inactive lines are hidden from the station screen but keep their history. |

A line that is **currently running a batch** cannot be deleted — finish or cancel
the batch first. A line that has batch history is **deactivated** rather than
deleted, so old reports keep a readable line name.

### 2.3 Configure products — ניהול → מוצרים ומשטחים

**הוספת מוצר** asks for:

| Field | Hebrew | Example |
| --- | --- | --- |
| Product name | שם המוצר | `נוזל רצפות 1 ליטר` |
| SKU | מק״ט | `FLR-1L` |
| Size | נפח / גודל | `1 ליטר` |
| Cartons per layout | קרטונים בפריסה | `12` |
| **Point value per carton** | ערך נקודות לקרטון | `1.5` |
| Predefined pallet sizes | גדלי משטח | `משטח A = 28`, `משטח B = 32` |

**Point value is the fairness dial.** A heavy 4-litre softener is far harder to
fill and pack than a 750 ml glass cleaner, so give it a higher value. This
multiplier is what makes the leaderboard reflect effort rather than raw carton
count.

Two pallet sizes with the same carton count are rejected — the dropdown would be
ambiguous.

### 2.4 Open a race — ניהול → מרוצים

See [section 9](#9-leaderboards-and-races). You cannot start a batch until a race
is open, because every point must belong to a scoring window.

---

## 3. Running a batch on the floor

Open **תחנת עבודה**. You get **one card per active production line**, side by
side — two lines, three lines, however many the factory runs. Each is completely
independent: its own product, crew, timer, pallets and pauses.

### Starting a batch

On a free line, tap **פתיחת אצווה**. The dialog asks for two things only:

1. **בחירת מוצר** — pick the product. The panel underneath immediately shows its
   size, cartons per layout, point value and available pallet sizes, so you can
   confirm you loaded the right line.
2. **בחירת צוות** — tick the crew starting now. Each row shows the worker's
   emoji, name and employee id. **בחירת הכול** selects everyone.

Add an optional note (e.g. `אצווה בוקר, קו מהיר`) and tap **התחל אצווה**.

> **There is no race to choose.** Every batch automatically contributes points to
> **every race that is open**, so there is nothing to configure and nothing to get
> wrong. The dialog shows which races are currently open, purely for information.

**The timer starts the instant the batch is created.** The card turns green with
a pulsing **פעיל** badge and a glowing live timer.

> If you see **קו זה כבר מריץ אצווה פעילה**, that line is busy. Finish or cancel
> the running batch first — a line can never run two batches at once.

### What the line card shows

| Element | Meaning |
| --- | --- |
| Line name and code | Which physical line this is |
| Race badges | Every race this batch is currently feeding points into |
| Giant timer | Total elapsed time since the batch was created |
| `משטחים שנרשמו` | Pallet count |
| `קרטונים` | Total cartons |
| `נקודות` | Total points generated by this batch |
| `נק׳ לשעה` | Points per active hour, computed live |
| `זמן עבודה נטו` | Elapsed time minus all pause time |
| `זמן מושבת` | Total pause time |
| Team chips | Each member with the points they have earned on this batch |
| `משטחים אחרונים` | The last few pallets logged |
| `היסטוריית השבתות` | Every pause with its reason and duration |

### The dashboard headline

Above the line cards sits today's production, led by the number the floor
actually counts:

```
📦 47  משטחים שיוצרו היום      ← the headline
🧃 1,204 קרטונים
⭐ 1,180 נקודות
⏱ 06:12:40 זמן עבודה  (עם 00:48:12 זמן מושבת)
```

The **מצב מסך בעוד N שנ׳** badge shows how many seconds remain before the screen
switches to TV Mode.

---

## 4. Logging pallets and how points are split

Tap **+ הוסף משטח**.

### Select, then confirm — never a single tap

There is no dropdown and no confirmation-free logging. The dialog opens on a grid
of **preset boxes**, one per configured pallet size:

```
┌─────────────────┐  ┌─────────────────┐
│    סטנדרטי      │  │    סטנדרטי      │
│       📦        │  │       📦        │
│    משטח A       │  │    משטח B       │
│       28        │  │       32        │
│     קרטונים     │  │     קרטונים     │
│  +42 נק׳         │  │  +48 נק׳         │
└─────────────────┘  └─────────────────┘
```

1. **Tap a box.** It highlights and is marked **✓ נבחר**. *Nothing is written
   yet.*
2. A confirmation bar appears showing exactly what you selected: the carton
   count, the points it will award, and how many races it will be credited to.
3. Tap **אישור** to log it, or **ביטול** to clear the selection and start again.

**Why the extra tap.** On a factory tablet a hesitant or repeated tap used to
produce duplicate pallets. Now a tap only records intent; only **אישור** writes
anything. A second guard inside the dialog also blocks a double-fired confirm, so
one confirm always produces exactly one pallet.

After a successful log the dialog stays open and the result is echoed at the top:

```
✓ 42 נק׳ חולקו בין 3 עובדים    28 קרטונים · 14 × 3    ייזקף ל-2 מרוצים
```

So a run of pallets is still fast: select, confirm, select, confirm.

### Irregular pallet

The **מספר קרטונים אחר** box sits on the same screen as the presets. Type a
carton count, tap the selection button, then **אישור** in the confirmation bar —
the same two-step flow, so an irregular pallet cannot be mis-tapped either.

### Adding a note

The note field applies to the **next** pallet you log, and clears itself
afterwards — so you can annotate one pallet (e.g. `משטח פגום בקרטון אחד`) without
it leaking onto the next ten.

### The split rule

```
palletPoints = cartons × product point value
each member active at that instant receives palletPoints / memberCount
```

Two things follow, and both matter:

1. **Only the crew present at that moment shares the pallet.** Someone who
   already went home does not earn points for work they did not do.
2. **The split is exact.** 42 points across 4 people is 10.5 each; 100 across 3
   is 33.34 / 33.33 / 33.33 — the remainder is distributed rather than lost. The
   per-member shares always add up to the pallet total, to the last 0.01.

### Every race gets the points

The pallet is credited to **all races that are open at that moment**, at once. If
two races are running, one pallet of 42 points appears as 42 points in both
boards — and if one of those races weights the product differently, its figure is
adjusted by its own multiplier. The dialog tells you how many races will receive
it before you confirm.

### Logged the wrong pallet?

**Undo:** the most recent pallet can be removed from the batch API
(`DELETE /api/batches/:id/pallets`), which reverses both the pallet and every
point award it produced. Use it for a mis-tap; it is deliberately the *last*
pallet only.

---

## 5. Pauses and downtime

Tap **השהיה** on a running line.

1. Pick a reason — one is required:
   - `חסר בקבוקים / חומרי גלם` — bottle or raw-material shortage
   - `תחזוקת מכונה` — machine maintenance
   - `החלפה / ניקיון` — changeover or cleaning
   - `הפסקת עובדים` — crew break
   - `החזקת איכות` — quality hold
   - `אחר` — other
2. Optionally add a free-text note (e.g. `החלפת תבנית לקו 2 ליטר`).

The card flips to amber with a pulsing **בהשהיה** badge, and the timer keeps
running while the **זמן מושבת** counter climbs separately.

Tap **חזרה לעבודה** to resume. The pause duration is banked.

### Why the structured reason matters

A free-text note cannot be totalled. The preset category is what makes the
**דוח השבתות** (downtime report) possible: how many hours were lost to material
shortages versus maintenance, month over month. That is the number that justifies
a purchase order or a process change.

### The effect on the efficiency leaderboard

Pause time is **completely excluded** from active working time. A crew that sat
through a three-hour breakdown does not get those three hours counted as
"working hours" — so their points-per-hour reflects how they performed while the
line was actually running. This is the whole point of tracking pauses separately.

---

## 6. Changing the team mid-batch

People arrive late and leave early. Tap **עדכון צוות**.

### Adding someone

Everyone active but not yet on the batch is listed. Tap **הוספה**. They start
earning from the next pallet onward.

### Removing someone

Tap **הסרה מהאצווה** next to their name.

> **The rule:** points already earned are theirs to keep. Every pallet logged
> from this moment on is split **strictly among the members who are still
> active**.

The dialog states this in an amber banner, and the **היסטוריית נוכחות באצווה**
table at the bottom records exactly when each person joined and left — so there
is never an argument about who was on the line at 14:20.

A batch must always keep at least one member; the last removal is blocked.

---

## 7. Finishing a batch

Tap **סיום אצווה** → confirm.

The dialog shows the final numbers before you commit:

| Figure | Hebrew |
| --- | --- |
| Total elapsed | משך כולל |
| Net working time | זמן עבודה נטו |
| Downtime | זמן מושבת |
| Points | נקודות |
| Pallets / cartons | משטחים / קרטונים |
| Points per hour | נק׳ לשעה |
| Team size | צוות |

…plus a per-member point list, so each worker can see what they earned.

If a pause is still open it is closed automatically, and the dialog warns you
first. Add optional closing notes and tap **סיים ושמור בהיסטוריה**.

The batch moves to **היסטוריה**, the line card goes back to **הקו פנוי**, and
the points stay on the leaderboard for the rest of the race.

### Cancelling instead

**ביטול אצווה ללא שמירה** at the bottom of the card discards the batch and
everything attached to it — members, pallets, points, pauses. This is for "we
opened the wrong line", not for normal operation. It asks for confirmation
because it cannot be undone.

---

## 8. TV Mode

Leave **any screen** untouched — no mouse movement, no key press, no touch — for
**10 seconds**, and the display switches itself into a full-screen animated
scoreboard. Any mouse movement, click, touch or key press snaps straight back to
the page you were on.

TV Mode is no longer limited to the station dashboard: park a wall display on the
leaderboard or the daily screen and it will still take over. It is suppressed
while a dialog is open, so it never yanks a form out from under you.

The idle threshold is configurable in
**ניהול → הגדרות → זמן חוסר פעילות לפני מצב מסך**.

### What it cycles through

| Panel | Content |
| --- | --- |
| 🏆 דירוג נפח | Top 8 by accumulated points, with animated bars |
| ⚡ דירוג יעילות | Top 8 by points per active hour; unqualified entries are dimmed |
| 🏭 אצוות פעילות | Every running line with giant live timers, counters and team emojis |
| 📅 ייצור היום לפי מוצר | Pallets produced per product today — the floor's own metric |
| 📊 סטטיסטיקת המרוץ | Race totals, prize, today's production and downtime |

### Choosing which panels appear

**ניהול → הגדרות → שקופיות במצב מסך** has a checkbox per panel. Tick only what
this site wants to show:

- A line that does not want the efficiency board can switch it off.
- A site that only cares about today's output can show **just** the daily board.
- Untick everything to disable TV Mode content entirely — the overlay then says so
  rather than showing a blank screen.

**בחירת הכול** and **ניקוי** set them all at once, and the screen shows how many
are selected. The order of the ticked panels is the rotation order.

Each panel stays on screen for **8 seconds** by default; change it in
**הגדרות → משך תצוגת שקופית במצב מסך**. The progress bar at the bottom shows the
current slide, and the header carries a live wall clock plus the default race name
and prize.

### Why it exists

It turns an idle screen into a motivator. A crew walking past sees exactly where
they stand, and the leaderboard becomes part of the shift rather than a report
nobody reads. Point a wall-mounted display at any page, disable sleep, and forget
about it.

---

## 9. Leaderboards and races

Open **לוח דירוג**. The board is always scoped to **one race**. Three filter tabs
sit above the race list:

| Tab | Shows |
| --- | --- |
| **מרוצים פעילים** | Only races running now. **This is the default.** |
| **ארכיון** | Only finished races |
| **הכל** | Everything |

The page opens on **מרוצים פעילים**, so you see the live standings straight away
instead of scrolling past months of archive. Each tab shows how many races it
contains, and the choice is kept in the URL — so a specific race view is a link
you can bookmark or send to someone.

### The two boards

Open **לוח דירוג**.

**נפח (Volume)** — total points accumulated in the race. Rewards output. Simple,
visible, motivating.

**יעילות — נקודות לשעה (Efficiency, PPH)** — points divided by *net active
hours*. Rewards throughput per hour actually worked. This is the board that
cannot be gamed by simply staying late.

The same underlying ledger feeds both, so they can never disagree.

### The minimum-hours threshold

**סף זכאות** is shown at the top of both boards. A worker who has not yet
accumulated that many net active hours inside the race is marked
**לא זכאי** — they still appear on the board, but dimmed and ranked below every
qualified worker, with the exact shortfall spelled out
(e.g. `חסרות 6.50 שעות פעילות לזכאות`).

This exists to remove **hour-stuffing bias**: without it, someone who logged two
very productive hours could beat someone who worked thirty, which is both unfair
and a bad signal for the floor.

Default is 30 hours. Change it per race in **ניהול → מרוצים**, or set the default
for future races in **ניהול → הגדרות**.

### Points across races

**Every open race scores from every running batch, at the same time.** There is no
"which race is this batch for" question anywhere in the system, because a pallet
is credited to all of them at once.

What that means in practice:

- **Opening a race mid-shift changes nothing on the floor.** The next pallet
  logged on any line appears on the new board within seconds. No batch to restart,
  no crew to tell, no production lost.
- **A batch appears on several boards at once**, which is expected. Each board
  computes it from its own ledger rows.
- **Each race applies its own multiplier.** If a race weights a product higher, the
  same pallet is worth more there — visible on that race's board and in the pallet
  CSV export.
- **The points already scored never move.** An archived race keeps exactly what it
  accumulated while it was open.

The **default board** (marked ★, shown in the app header and on TV Mode) is purely
a display preference. Switching it with **הגדר כברירת מחדל** does not change what
anyone scores — it only changes which board opens by default.

### Starting a new race

**ניהול → מרוצים → פתיחת מרוץ חדש**. Fill in:

- **שם המרוץ** — e.g. `מרוץ נובמבר`
- **תיאור הפרס** — e.g. `שובר 500 ₪ לצוות המוביל + יום חופש`
- **תאריך התחלה** — leave empty to start now
- **תאריך סיום** — optional. Leave empty for an open-ended race; set a date and
  the race **closes itself** when that moment passes
- **סף שעות פעילות לזכאות**
- **מרוץ ראשי** — tick to make this the default board to display

When you save:

- the new race opens with a **fresh zero score**,
- it becomes the default board (if you left the box ticked),
- **every running batch starts contributing to it on the very next pallet**.

**Nothing is deleted, nothing stops, and nothing needs reconfiguring.** The crews
do not even notice — there is no batch to restart, because batches were never tied
to a race in the first place.

### Several races at once

The platform runs **as many concurrent races as you want**, and every one of them
scores from every running batch. So you can run a site-wide monthly race alongside
a focused weekly efficiency sprint, and both accumulate correctly from the same
pallets.

Exactly one race is the **default board** — marked ★ in the admin list, shown in
the app header, and the board the leaderboard opens on. It is a display
preference, nothing more. To change it, tap **הגדר כברירת מחדל** on any active
race.

### Ending a race — archive or delete

Every active race offers two actions:

**🗄️ סיום מרוץ** — *Finish.* Closes the race and moves it to the archive. This is
the normal path and it is **non-destructive**: the race keeps all its points, and
its final standings stay viewable under the **ארכיון** tab forever. If it was the
default board, the newest remaining active race is promoted automatically.

**🗑 מחיקה** — *Delete.* Removes the race **permanently, together with every point
scored in it.** The confirmation dialog fetches the actual impact first and shows
you exactly what will be destroyed:

```
מה יימחק
11,343.8 נקודות
1,290 רשומות נקודות
286 משטחים
12 עובדים
```

Nothing else is affected — no other race, no batch, no pallet — because race
attribution lives only in the point ledger. Use this to clean up a test race you
created by mistake. Use **סיום מרוץ** if you want to keep the data.

### Races that end by themselves

Set an **end date** on a race and it **closes automatically** the moment that time
passes — the next time any screen loads. There is no job to schedule and no window
in which a finished race could still be accumulating points.

A race whose deadline has passed is marked **מועד הסיום עבר — ייסגר בטעינה
הבאה** in the admin list, and appears under the **ארכיון** tab with the note
**הסתיים אוטומטית בהגיע מועד הסיום**.

### Per-race point multipliers

Point values live on the product, but a race can weight a product differently —
a promotion, a quality push, a new SKU ramping up. Tap
**✎ מכפילי נקודות למרוץ הזה** on any race to override them per product.

Leave a field empty to fall back to the product's own value. Pallets already
logged keep the multiplier they were scored with, so changing a multiplier never
rewrites history.

Because every open race scores every pallet, two races with different multipliers
for the same product will legitimately show different totals for the same work —
that is the feature working, not a discrepancy.

### Viewing any race's leaderboard

The scope tabs narrow the race list, and each race card shows its own points,
pallets and worker count. Tap one to view its standings — both the scope and the
chosen race are stored in the URL
(`/leaderboard?scope=archived&raceId=...`), so any view is a shareable,
bookmarkable link.

The archive table at the bottom of the leaderboard does the same thing, and shows
each race's window, prize and threshold.

---

## 10. Daily statistics

Open **סטטיסטיקה יומית** (or tap **סטטיסטיקה יומית** on the station dashboard).

This screen is deliberately **pallet-first**. Pallets are what the floor counts
and carries, so they lead:

```
📦 47        🧃 1,204      ⭐ 1,180
משטחים שיוצרו   קרטונים       נקודות
```

### פילוח לפי מוצר — the headline table

The question a shift supervisor actually asks is *"how many pallets of each
product did we get out today"*, so that is the primary ranking:

| # | Product | Pallets | Cartons | Points | Share |
| --- | --- | --- | --- | --- | --- |
| 1 | נוזל כלים 2 ליטר | **22** | 528 | 792 | 47% |
| 2 | מרכך כביסה 4 ליטר | **14** | 280 | 630 | 30% |
| 3 | מנקה זכוכית 750 מ״ל | **11** | 396 | 356 | 23% |

### Also on the screen

- **פילוח לפי קו** — output per line, with active and paused time, and a live
  badge for lines still running.
- **פילוח לפי שעה** — the day's production curve, with the peak hour marked.
- **עובדים בולטים היום** — who contributed most today, by points, pallets,
  cartons and active time.
- **ייצוא הדוח היומי** — the whole screen as one sectioned CSV file.

Use the date picker (or the **היום** / **אתמול** shortcuts) to look back at any
day.

The same per-product pallet board is a panel inside the TV Mode loop, so the
answer is on the wall as well as on screen.

---

## 11. History and reports

### The history ledger — היסטוריה

Defaults to the last 14 days. Filter by date range, product, or worker.

Each row is one completed batch and carries everything payroll and production
review need:

| Column | Hebrew |
| --- | --- |
| Date | תאריך |
| Product (with size) | מוצר |
| Line | קו |
| Start / finish | התחלה / סיום |
| Total elapsed | משך כולל |
| **Net working time** | זמן עבודה |
| Downtime | זמן מושבת |
| Cartons | קרטונים |
| Points | נקודות |
| Team (emoji + name) | צוות |

Tap **פרטים** on any row to open the full batch: all summary figures, the exact
team, and the **פירוט השבתות** table — each pause reason with its occurrence
count, total duration and share of the batch's downtime.

### CSV exports — ניהול → דוחות וייצוא

Set the period, then download any of four reports:

| Report | Hebrew | Contains |
| --- | --- | --- |
| Shift ledger | יומן אצוות מפורט | Every batch: times, net working time, downtime, line, pallets, cartons, points, PPH, team, pause breakdown, race, notes |
| Worker summary | סיכום נקודות לעובד | Per worker: races, batches, pallets, cartons, total points, active hours, **PPH**, attributed downtime |
| Downtime | דוח השבתות | Pause time grouped by reason, with occurrences, totals, averages and affected batches |
| Pallet ledger | יומן משטחים | Every pallet with its race and its exact per-member point split |
| Daily production | דוח ייצור יומי | One sectioned file: day summary, per-product pallets, per-line totals, top workers |

All files are UTF-8 **with a byte order mark** and a `sep=,` hint, so Excel on a
Hebrew Windows install and Google Sheets both open them with headers, Hebrew text
and digits intact — no mojibake. Hebrew headers, Western digits, always.

**Use cases:**

- **Payroll** — the worker summary gives total points and net active hours per
  person, which is what a points-based bonus is calculated from.
- **Maintenance** — the downtime report shows whether you are losing more hours
  to material shortages or to machine faults. That is a purchase decision.
- **Disputes** — the pallet ledger shows, for any pallet, which race it counted
  into, who was on the line and what each of them received. No ambiguity.
- **Shift handover** — the daily report is one printable file per day.

---

## 12. Admin reference

**ניהול** has six tabs.

### עובדים — Workers

Add, edit, deactivate and delete. Emoji and employee id are both unique. Workers
with production history are deactivated rather than deleted, preserving their
points. Search by name or employee id.

### קווי ייצור — Production lines

Add, rename, reorder, deactivate and delete lines. The station dashboard renders
one card per active line in the configured order, so the factory can grow from
two lines to five without a deployment. A line that is currently running a batch
cannot be deleted; a line with history is deactivated instead. See
[section 2.2](#22-configure-production-lines--ניהול--קווי-ייצור).

### מוצרים ומשטחים — Products & pallets

Add, edit and delete products. Each carries its size, cartons per layout, point
value per carton, and a set of predefined pallet sizes. Products with batch
history are deactivated rather than deleted. Editing a product's pallet sizes
updates them in place, so historical pallet references stay valid.

### מרוצים — Races

Open new races, run several concurrently, choose which is the default board, edit
start and end dates, set per-race point multipliers, and close a race either by
**archiving** it (keeps everything) or **deleting** it (destroys its points, with
the impact shown first). Races with an end date archive themselves when it passes.
See [section 9](#9-leaderboards-and-races).

### הגדרות — Settings

| Setting | Hebrew | Effect |
| --- | --- | --- |
| Factory name | שם המפעל | Shown in the app chrome |
| TV idle timeout | זמן חוסר פעילות לפני מצב מסך | Seconds before TV Mode engages (default 10), on every page |
| TV slide duration | משך תצוגת שקופית במצב מסך | Seconds each TV panel stays on screen (default 8) |
| **TV panels** | שקופיות במצב מסך | **Checkboxes choosing which panels appear in the TV Mode loop.** Untick all to disable the content |
| Default race threshold | סף שעות ברירת מחדל למרוץ חדש | Applied to every newly opened race |

### דוחות וייצוא — Reports & export

Five reports. See [section 11](#11-history-and-reports).

---

## 13. FAQ and rules of thumb

**How many lines can run at once?**
As many as you configure. Each active line gets its own card, its own product,
crew, timer, pallets and pauses. Add lines in **ניהול → קווי ייצור**.

**Can two lines run at the same time?**
Yes — that is the design, and it is not limited to two.

**Can a worker be on both lines at once?**
The system allows it, but it is almost always a data-entry mistake. If it
happens, the person's points are simply the sum of both batches.

**Can several races run at the same time?**
Yes, and every one of them scores from every running batch. There is no race to
choose when starting a batch, and no re-pointing when a race opens — the points
just appear on all open boards. See [section 9](#9-leaderboards-and-races).

**What happens to a running batch when I start a new race?**
Nothing visible. The batch keeps its timer and its team, and its next pallet is
credited to the new race as well as any other race that is open. No restart, no
lost production, no crew to notify.

**I closed a race by mistake. Can I get it back?**
Yes. Archiving never deletes anything, so the race and all its points are intact
under the **ארכיון** tab. Reopen it from the API (`PATCH /api/races/:id` with a
new status) if you need it running again.

**What is the difference between סיום מרוץ and מחיקה?**
**סיום מרוץ** archives it — everything is kept and stays viewable. **מחיקה**
deletes the race *and every point scored in it*, permanently. The delete dialog
shows you exactly how many points, awards, pallets and workers will be destroyed
before you confirm. When in doubt, archive.

**Can I delete a race?**
Yes, from **Admin → מרוצים → מחיקה**. It is deliberately destructive and
deliberately explicit: the confirmation states the real impact first. Archiving is
the safer alternative and costs nothing.

**A race vanished from the active list.**
Its end date passed, so it archived itself. Find it under the **ארכיון** tab.

**Do I need to configure anything when I open a new race?**
Only the name, prize and threshold. Batches, lines and crews need no changes at
all — that is the point of concurrent scoring.

**What happens to points if I remove someone and they come back later?**
Their earlier points stay on their ledger. They start a fresh membership interval
when they rejoin, and pallets logged in between went only to the people who were
actually there.

**Does pausing hurt the leaderboard?**
It does not add hours. A long stoppage leaves your active hours unchanged, so
your points-per-hour is measured only over time the line was running.

**Someone forgot to log pallets for an hour. Can we fix it retroactively?**
Not in the current build — a pallet is always logged against the team active at
that instant, and the interface only offers "now". Use the note field to record
the discrepancy, and enter the pallets as soon as it is noticed. Correcting
history retroactively is deliberately out of scope, because it would undermine
the audit trail the leaderboard depends on.

**Why do I have to tap אישור after choosing a pallet size?**
Because a single tap used to log a pallet, and on a tablet that produced duplicate
rows from a hesitant or repeated tap. Now a tap only *selects* — nothing is
written until you press **אישור**. It costs one extra tap and removes an entire
class of data-entry errors.

**The pallet dialog's product/size list looks out of date.**
That is intentional while the dialog is open. The dashboard refreshes every few
seconds, and letting that refresh rebuild the controls mid-interaction is what
used to make dropdowns close themselves. Close and reopen the dialog to pick up
the latest lists.

**I logged a pallet twice by accident.**
Use **undo** on the batch API (`DELETE /api/batches/:id/pallets`) to remove the
most recent pallet and every point it produced. Do it promptly — it only reverses
the *last* pallet.

**The timer looks wrong on a resumed tablet.**
The server is the source of truth. The screen re-syncs every 4 seconds; give it a
moment. If it stays wrong, check the tablet's clock.

**Why is my name shown in English while everything else is Hebrew?**
Because you typed it that way. Names, product names and notes are free text and
are stored exactly as entered — Hebrew, Arabic and English all work, including
mixed within a single field.

**Do I need to refresh after logging a pallet?**
No. Points are credited immediately and the leaderboard updates within a second.

**TV Mode took over while I was reading a form.**
It should not — it is suppressed whenever a dialog is open. If it does, the
timeout is too short; raise it in **ניהול → הגדרות**.

**What if the storage badge turns amber?**
The floor is writing to the temporary local store. Data will survive a page
reload but not a server restart, and it is not shared between devices. Tell your
supervisor — the deployment needs `DATABASE_URL` configured. See
`DEPLOYS_GUIDE.md`.
