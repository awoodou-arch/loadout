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
re-upload them to the same GitHub repo — the home screen icon picks up changes
next time you open it (you may need to force-close and reopen once).

## Using it

- **Library tab** — paste in a program (JSON, see format below) and tap Import,
  then "Start program" to make it active. Only one program is active at a time.
- **Today tab** — shows today's workout based on how many days it's been since
  you started the active program (the cycle repeats automatically). Log each
  set's weight/reps/RPE, add notes, and finish the workout to save it to history.
- **Program tab** — the full cycle at a glance; tap any day to preview it.
- **Maxes tab** — your 1/2/3/5-rep maxes per lift. These power the automatic
  weight calculations for percentage-based sets, and double as your PR log.
  Update a number any time you hit a new max.
- **Progress tab** — workout history, streak, and a body weight trend chart.

A sample program is included at `sample-programs/squat-program.json` (built from
the TrueCoach emails you shared) — paste its contents into the Import box to see
a working example before importing your real programs.

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
