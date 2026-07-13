# Loadout

A personal workout app: guided daily programs, set-by-set logging, body weight and
lift-max tracking. Runs as a installable web app (PWA) — no App Store, no Mac, no
backend, all data stored locally on your phone.

## Get it on your iPhone (one-time setup)

You need somewhere free to host these files so Safari can load them over HTTPS.
GitHub Pages is the easiest option and costs nothing.

1. Create a free GitHub account if you don't have one: https://github.com/signup
2. Create a new repository (e.g. `loadout`), public, no README/gitignore needed.
3. Upload every file in this folder into that repository (drag-and-drop works on
   github.com — use "Add file" → "Upload files").
4. In the repo, go to **Settings → Pages**, set "Source" to the `main` branch,
   root folder. Save.
5. GitHub gives you a URL like `https://yourname.github.io/loadout/`. It takes
   a minute or two to go live.
6. On your iPhone, open that URL in **Safari** (must be Safari, not Chrome).
7. Tap the Share icon → **Add to Home Screen**.

You'll now have a Loadout icon on your home screen that opens full-screen, works
offline, and keeps your data on-device.

**Updating later:** whenever you want to change the app, edit the files and
re-upload them to the same GitHub repo. The app checks for a new version each
time you open it (and while it's open) and refreshes itself when you're online,
so changes show up on their own — the version number at the bottom of the
Library page tells you which build you're on.

**Backups:** the Library tab has a **Backup & restore** card — download a JSON
file of all your data (maxes, logs, programs, history) and re-import it here or
on another phone. Because all data is stored on-device, this is your safety net
against clearing site data or switching phones.

## Using it

- **Library tab** — paste in a program (JSON, see format below) and tap Import,
  then "Start program" to make it active. Only one program is active at a time.
- **Today tab** — shows today's workout based on how many days it's been since
  you started the active program (the cycle repeats automatically). Log each
  set's weight/reps/RPE, add notes, and finish the workout to save it to history.
  Can't train today? Use **Push →** to bump today's session to tomorrow — the
  whole schedule slides back a day so you don't skip the workout.
- **Program tab** — the full cycle at a glance; tap any day to preview it.
- **Maxes tab** — your 1/2/3/5-rep maxes per lift. These power the automatic
  weight calculations for percentage-based sets, and double as your PR log.
  Update a number any time you hit a new max.
- **Progress tab** — an activity heatmap (GitHub-style: green = completed,
  gold = pushed, red = missed), workout history, streak, and a body weight
  trend chart.

Planned features are tracked in [`ROADMAP.md`](ROADMAP.md).

## Your programs are already included

Three programs converted from your TrueCoach Gmail exports ship with the app in
`sample-programs/`:

- **Squat Program** (68 days, Sep–Nov 2022)
- **Strength Program** (84 days, Mar–Jun 2024)
- **Olympic Lifting** (205 days, Nov 2022–Jul 2024)
- **Squat & Murph Builder** (84 days / 12 weeks) — a goal-built block focused on
  back-squat strength and Murph prep, with two posterior-chain/deadlift days a
  week and a Murph track that scales Quarter → Half → Three-Quarter → Full
  (vest included). Uses `back squat`, `front squat`, and `deadlift` maxes.

They're already ordered chronologically. In the **Library tab** you'll see a
"Starter programs" section — tap **Add** next to any of them (no copy-paste
needed), then **Start program** to begin at Day 1. The original calendar dates
don't matter: whenever you press Start, that day becomes Day 1 and the program
runs forward from there, cycling back to the beginning if you reach the end.

### Set your maxes first

Several blocks are percentage-based ("70% 1x5 based off front squat 1RM"). For
the app to show you actual weights, fill in the relevant maxes on the **Maxes
tab**. Across the three programs, these lifts are referenced:
`back squat`, `front squat`, `clean`, `clean & jerk`, `jerk`, `split jerk`, and
`snatch`. Any percentage set whose max isn't set yet will show the percentage
with a reminder to fill in that lift.

### What's structured vs. preserved as notes

Every workout keeps the coach's full prescription verbatim as readable notes, so
nothing is lost. On top of that, clean percentage sets ("80% 3x3") are
structured for automatic weight calculation. The messier prescriptions
(rest-pause, mechanical drop sets, AMRAP intervals, "build to a weight") are kept
as notes with generic loggable rows underneath — you read what to do and log
what you did. A couple of things worth knowing:

- Some Olympic days list two percentage "waves" on separate lines (an A-week and
  B-week option). The parser generates loggable rows for both, so you may see a
  few extra set slots — just fill in the ones you actually did and ignore the
  rest. The verbatim notes always show the intended structure.
- Auto-calc weights round to the nearest 5 lb.

## Re-running the converter

If you export more programs from Gmail later, `convert_mbox.py` turns TrueCoach
`.mbox` files into Loadout JSON. It needs Python with `beautifulsoup4` installed
(`pip install beautifulsoup4`). Edit the `jobs` list at the bottom to point at
your `.mbox` files and program names, then run `python3 convert_mbox.py`. Drop
the resulting `.json` files into `sample-programs/`, add them to the
`STARTER_PROGRAMS` list near the top of `app.js`, and add their filenames to the
cache list in `sw.js` so they work offline.

## Program JSON format

This is the format to use — either by hand, or by asking Claude in chat to build
or convert a program into this shape:

```json
{
  "name": "Program name",
  "days": [
    {
      "label": "Week 1 - Day 1",
      "type": "workout",
      "warmup": ["Warmup step one", "Warmup step two"],
      "blocks": [
        {
          "letter": "A",
          "name": "Exercise name",
          "notes": "Free-text coaching notes: tempo, cues, rest periods, substitutions.",
          "sets": [
            { "reps": 5, "percentage": 60, "basedOn": "clean" },
            { "reps": 5, "percentage": 65, "basedOn": "clean", "basedOnRep": 3 },
            { "reps": "12-15", "description": "Working set" },
            { "reps": "AMRAP", "description": "60s on, 60s off" }
          ]
        }
      ]
    },
    { "label": "Week 1 - Day 2", "type": "rest" }
  ]
}
```

Notes on the fields:
- `days` is the full cycle — it repeats automatically once you reach the end.
- A day is either `"type": "rest"` (no `blocks` needed) or `"type": "workout"`.
- A set with `percentage` + `basedOn` gets its weight calculated automatically
  from the matching lift in the Maxes tab (rounded to the nearest 5 lb).
  `basedOn` must match a lift key from the Maxes tab (e.g. `back_squat`,
  `front_squat`, `deadlift`, `bench`, `clean`, `snatch`, `overhead_press`, or
  any custom lift you've added there — use lowercase with underscores).
  `basedOnRep` is optional and defaults to `1` (the 1RM); set it to `2`, `3`,
  or `5` to base the percentage off that rep max instead.
- A set without `percentage` just needs `reps` (a number or a string like
  `"12-15"` or `"6+4"`) and an optional `description` for anything unusual
  (rest-pause, AMRAP, build-to-weight, etc). Logging works the same way
  regardless — you enter what you actually did.

When you want a new program (like a Murph-specific block), just describe the
goal to Claude in chat — it can draft the program directly in this format for
you to paste into the Import box.
