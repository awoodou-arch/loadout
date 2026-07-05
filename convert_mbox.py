#!/usr/bin/env python3
"""Convert TrueCoach Gmail mbox exports into Loadout program JSON.

Sorts workouts chronologically by email date, assigns sequential days,
detects rest days, preserves each exercise block's prescription verbatim as
notes, and structures percentage-based sets so the app can auto-calculate
weights from your saved maxes.
"""
import mailbox, re, json, sys
from bs4 import BeautifulSoup
from email.utils import parsedate_to_datetime

# Map coach's "based off X 1RM" phrasing -> Loadout lift keys (must match Maxes tab)
LIFT_MAP = [
    (r'clean and jerk', 'clean_and_jerk'),
    (r'split jerk',      'split_jerk'),
    (r'front squat',     'front_squat'),
    (r'back squat',      'back_squat'),
    (r'overhead squat',  'overhead_squat'),
    (r'\bsnatch\b',      'snatch'),
    (r'\bclean\b',       'clean'),
    (r'\bjerk\b',        'jerk'),
    (r'\bsquat\b',       'back_squat'),
    (r'bench',           'bench'),
    (r'deadlift',        'deadlift'),
    (r'\bpress\b',       'overhead_press'),
]

def get_lines(msg):
    for part in msg.walk():
        if part.get_content_type() == 'text/html':
            html = part.get_payload(decode=True).decode('utf-8', errors='replace')
            soup = BeautifulSoup(html, 'html.parser')
            lines = [l.strip() for l in soup.get_text('\n').split('\n')]
            return [l for l in lines if l]
    return []

def core_lines(lines):
    """Trim TrueCoach boilerplate, keep the workout body."""
    out, capture = [], False
    for l in lines:
        if l.startswith("Here's your workout for"):
            capture = True
            continue
        if (l.startswith('- Your Coach') or l.startswith('Open in TrueCoach')
                or l.startswith('Questions about your programming')
                or l.startswith('Copyright')):
            break
        if capture:
            out.append(l)
    return out

# A block header looks like "A)", "B1)", "C)" etc.
BLOCK_RE = re.compile(r'^([A-H][0-9]?)\)\s*(.*)$')

def _match_lift(t):
    for pat, key in LIFT_MAP:
        if re.search(pat, t):
            return key
    return None

def detect_based_on(name, notes):
    """The coach's explicit 'based off <lift> 1RM' line is authoritative and
    must win over the exercise name (e.g. a 'Quarter Front Squat' block can be
    prescribed off the back squat max). Fall back to the name only if no such
    line exists."""
    for line in notes.split('\n'):
        if re.search(r'based\s*(?:off|on)', line, re.I):
            key = _match_lift(line.lower())
            if key:
                return key
    return _match_lift((name + ' ' + notes).lower())

# Percentage patterns like "80% 3x3", "70% 1x5", "85% 1x1", "40% 1x5"
PCT_SET_RE = re.compile(r'(\d{2,3}(?:\.\d)?)\s*%\s*(\d+)\s*x\s*(\d+)')
# Plain set patterns like "3x5", "2 sets x 6 reps", "4x5"
PLAIN_SET_RE = re.compile(r'(\d+)\s*(?:sets?\s*)?x\s*(\d+)')

def parse_block(name_line, body_lines):
    """Return a block dict: letter, name, notes (verbatim), sets (best-effort)."""
    m = BLOCK_RE.match(name_line)
    letter = m.group(1) if m else ''
    name = (m.group(2) if m else name_line).strip()
    notes = '\n'.join(body_lines).strip()

    based_on = detect_based_on(name, notes)

    sets = []
    # Try percentage-based sets first (each "% NxM" becomes N sets of M reps at that %)
    joined = ' '.join(body_lines)
    pct_matches = PCT_SET_RE.findall(joined)
    if pct_matches and based_on:
        for pct, nsets, reps in pct_matches:
            for _ in range(int(nsets)):
                sets.append({"reps": int(reps), "percentage": float(pct), "basedOn": based_on})
    else:
        # Fall back to plain NxM sets, or a couple of generic loggable rows
        plain = PLAIN_SET_RE.findall(joined)
        if plain:
            for nsets, reps in plain[:1]:  # use first clear "N x M" as the set/rep scheme
                for _ in range(int(nsets)):
                    sets.append({"reps": int(reps), "description": name})
        if not sets:
            # Unknown structure (AMRAP, drop set, intervals): give 3 generic loggable rows
            sets = [{"reps": "", "description": "See notes"} for _ in range(3)]

    block = {"letter": letter, "name": name, "notes": notes, "sets": sets}
    return block

def parse_email(lines):
    """Return a day dict from the core workout lines."""
    if not lines:
        return {"type": "rest", "label": "Rest day"}
    label = lines[0]
    if label.lower().strip() in ('rest day', 'rest'):
        return {"type": "rest", "label": "Rest day"}

    body = lines[1:]
    # Split into warmup and blocks
    warmup, blocks = [], []
    section = None  # 'warmup' or 'blocks'
    current_name, current_body = None, []

    def flush_block():
        if current_name is not None:
            blocks.append(parse_block(current_name, current_body))

    for l in body:
        if re.match(r'^warm ?up', l, re.I) or l.lower().startswith('warm up'):
            section = 'warmup'
            continue
        if BLOCK_RE.match(l):
            # starting a new block
            flush_block()
            section = 'blocks'
            current_name = l
            current_body = []
            continue
        if section == 'warmup':
            warmup.append(l)
        elif section == 'blocks':
            current_body.append(l)
        else:
            # pre-warmup preamble; attach to warmup bucket
            warmup.append(l)
    flush_block()

    day = {"type": "workout", "label": label}
    if warmup:
        day["warmup"] = warmup
    day["blocks"] = blocks
    return day

def convert(mbox_path, program_name):
    mb = mailbox.mbox(mbox_path)
    dated = []
    for msg in mb:
        try:
            dt = parsedate_to_datetime(msg.get('Date'))
        except Exception:
            dt = None
        lines = core_lines(get_lines(msg))
        dated.append((dt, lines))
    # sort chronologically by email date (None dates sink to the end)
    dated.sort(key=lambda x: (x[0] is None, x[0]))
    days = [parse_email(lines) for _, lines in dated]
    return {"name": program_name, "days": days}

if __name__ == '__main__':
    jobs = [
        ('Team_Training-Squat_Program.mbox',    'Squat Program'),
        ('Team_Training-Strength_Program.mbox', 'Strength Program'),
        ('Team_Training-Olympic_Lifting.mbox',  'Olympic Lifting'),
    ]
    for path, name in jobs:
        prog = convert('/mnt/user-data/uploads/' + path, name)
        out = '/home/claude/loadout/sample-programs/' + name.lower().replace(' ', '-') + '.json'
        with open(out, 'w') as f:
            json.dump(prog, f, indent=2)
        # quick stats
        workout_days = sum(1 for d in prog['days'] if d.get('type') == 'workout')
        rest_days = sum(1 for d in prog['days'] if d.get('type') == 'rest')
        pct_sets = sum(1 for d in prog['days'] if d.get('type')=='workout'
                       for b in d['blocks'] for s in b['sets'] if s.get('percentage'))
        print(f"{name}: {len(prog['days'])} days ({workout_days} workout, {rest_days} rest), "
              f"{pct_sets} auto-calc %-sets -> {out}")
