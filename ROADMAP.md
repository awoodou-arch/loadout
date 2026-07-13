# Loadout — Future Features

A running list of planned features, captured for later implementation. Nothing
here is built yet. Each entry has enough detail to pick up and build without
re-deriving the intent.

Status legend: 🔲 not started · 🟡 in progress · ✅ shipped

---

## 🔲 1. Historical 1/2/3/5 RM tracking

**Goal:** Track how each lift's rep-maxes change over time, instead of only
storing the current value.

**Problem today:** The Maxes tab overwrites a lift's max whenever you update it
(`maxes[lift][rep] = value`), keeping only the latest number plus a "last
updated" date. There's no way to see progression.

**Proposed design:**
- Store a per-lift **history array** of entries: `{ rep, weight, date }`
  (rep ∈ {1,2,3,5}).
- Derive the "current max" (used for the percentage-based weight calculations on
  the Today/Program screens) from the most recent — or highest — entry per rep,
  so the existing calc logic keeps working.
- Migrate existing `maxes` data: turn each current `{1,2,3,5}` value into a
  single history entry dated `updated` (or today if missing). No data loss.
- Keep the Maxes tab's quick-edit inputs; saving one appends a new history entry
  rather than silently overwriting.

**Open questions:**
- "Current" = latest by date, or highest weight ever? (Latest is more honest for
  percentage work; highest is a nicer PR flex.) Leaning: latest by date drives
  calcs, highest shown as an all-time PR badge.

---

## 🔲 2. Manual RM entry

**Goal:** Log a rep-max result directly, including for past dates.

**Proposed design:**
- A form (likely on the Maxes tab) to add an entry with:
  - **Lift** — pick from existing lifts or add a new one (reuse the existing
    "add another lift" key-normalization).
  - **Rep range** — 1 / 2 / 3 / 5 RM.
  - **Weight** (lb).
  - **Date** — defaults to today, editable so historical results can be
    backfilled.
- Appends to the lift's history array from feature #1 (this is the primary way
  to populate that history).
- Nice-to-have: edit/delete an individual history entry to fix mistakes.

**Depends on:** #1 (shared history data model).

---

## 🔲 3. Multi-lift strength chart on the Progress tab

**Goal:** Visualize strength over time — select any number of lifts that have
history and graph them together on one chart.

**Proposed design:**
- On the Progress tab, add a multi-select of lifts that have history data.
- Plot each selected lift as its own line on a shared chart (weight vs. date),
  reusing/extending the existing SVG line-chart used for body weight.
- Distinct color + a legend per lift.
- Handle differing date ranges and sparse data (lifts logged on different days)
  on a common time axis.

**Open questions:**
- Which rep-max to plot per lift — default to 1RM, or let the user choose the
  rep (1/2/3/5)? Leaning: a rep-range toggle (default 1RM), all selected lifts
  share the same rep view.
- Absolute weight only, or offer an "indexed to start = 100%" view so lifts of
  very different magnitudes are comparable on one axis? (Front squat vs. snatch
  differ a lot in absolute lb.)

**Depends on:** #1 (needs history to plot).

---

## ✅ 4. Backup / Export & Import — shipped (v10)

Library tab now has a **Backup & restore** card: Download (or Copy) a JSON file
with all your data, and restore from a file. Repo auto-commit (option 2 below)
is still not built — export is download/manual only.

<details><summary>Original design notes</summary>

**Goal:** Protect against data loss (bad cache-clear, new phone, new browser)
and make data portable. All app data lives in `localStorage`, which is
per-browser and per-device with no sync, so a manual backup is the safety net.

**Proposed design:**
- **Export:** one button that dumps all `loadout:*` keys (programs, active,
  maxes, logs, bodyweights) into a single JSON file and downloads it to the
  device.
- **Import:** load a previously exported JSON file to restore. Decide
  replace-all vs. merge (leaning: replace-all with a confirm, plus a timestamp
  in the export so you know which backup is which).

**Can the backup be stored as a file in the repo?**
Not automatically from the app. A static site on GitHub Pages has no write
access to the repo, and putting a GitHub token in public client-side code would
expose it. Realistic options:
1. **Download + manual upload (default).** Export downloads a JSON file; you
   drag-drop it into the repo yourself when you want a versioned copy — same
   flow you used to upload the programs. Simple and safe.
2. **Token-based auto-commit (optional, power-user).** A "connect GitHub" flow
   where you paste a fine-grained personal access token (stored in
   `localStorage`) so the app commits the backup via the GitHub API. Works, but
   you're trusting the token to browser storage — only worth it if the
   convenience matters. Would be opt-in, never required.

Leaning: build option 1 first (covers the real need — a safe, portable copy),
consider option 2 later only if wanted.

</details>

---

## Notes for whoever implements these

- Data model changes (#1) touch `getMaxes`/`saveMaxes` and `calcTarget` in
  `app.js`; include a one-time migration so existing users keep their numbers.
- When adding any new bundled asset or changing cached files, bump `CACHE` in
  `sw.js` and update its asset list (see the service-worker notes in README).
- Verify each change by driving the app in a browser before shipping, and keep
  commits small and themed.
