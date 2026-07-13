/* ---------- storage ---------- */
const DB = {
  get(key, fallback) {
    try {
      const raw = localStorage.getItem('loadout:' + key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) { return fallback; }
  },
  set(key, value) {
    localStorage.setItem('loadout:' + key, JSON.stringify(value));
  }
};

function uid() { return Math.random().toString(36).slice(2, 10); }
function todayStr() { return new Date().toISOString().slice(0, 10); }
function fmtDate(d) {
  return new Date(d + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}
function daysBetween(a, b) {
  const ms = new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00');
  return Math.floor(ms / 86400000);
}
function round5(n) { return Math.round(n / 5) * 5; }

/* ---------- state accessors ---------- */
function getPrograms() { return DB.get('programs', []); }
function savePrograms(list) { DB.set('programs', list); }
function getActive() { return DB.get('active', null); } // {programId, startDate}
function setActive(v) { DB.set('active', v); }
function getMaxes() { return DB.get('maxes', {}); }
function saveMaxes(m) { DB.set('maxes', m); }
function getLogs() { return DB.get('logs', []); }
function saveLogs(l) { DB.set('logs', l); }
function getBodyweights() { return DB.get('bodyweights', []); }
function saveBodyweights(b) { DB.set('bodyweights', b); }

function getActiveProgram() {
  const active = getActive();
  if (!active) return null;
  const program = getPrograms().find(p => p.id === active.programId);
  if (!program) return null;
  return { program, active };
}

function getDayIndexForToday(program, active) {
  const offset = daysBetween(active.startDate, todayStr());
  const n = program.days.length;
  return ((offset % n) + n) % n;
}

/* percentage -> weight, using maxes.  set.basedOn = lift key, set.basedOnRep default 1 */
function calcTarget(set, maxes) {
  if (set.percentage == null || !set.basedOn) return null;
  const lift = maxes[set.basedOn];
  const repKey = String(set.basedOnRep || 1);
  if (!lift || lift[repKey] == null) return { missing: true };
  const raw = lift[repKey] * (set.percentage / 100);
  return { weight: round5(raw) };
}

const LIFT_LABELS = {
  back_squat: 'Back squat', front_squat: 'Front squat', deadlift: 'Deadlift',
  bench: 'Bench press', clean: 'Clean', snatch: 'Snatch', overhead_press: 'Overhead press',
  split_jerk: 'Split jerk', jerk: 'Jerk', clean_and_jerk: 'Clean & jerk', overhead_squat: 'Overhead squat'
};
function liftLabel(key) { return LIFT_LABELS[key] || key.replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase()); }

/* ---------- bundled starter programs (files shipped in the repo) ---------- */
const STARTER_PROGRAMS = [
  { file: 'sample-programs/squat-program.json', name: 'Squat Program' },
  { file: 'sample-programs/strength-program.json', name: 'Strength Program' },
  { file: 'sample-programs/olympic-lifting.json', name: 'Olympic Lifting' },
  { file: 'sample-programs/squat-murph-builder.json', name: 'Squat & Murph Builder' }
];

/* ---------- routing ---------- */
let route = localStorage.getItem('loadout:lastRoute') || 'today';
let routeParams = {};
function navigate(r, params) {
  route = r;
  routeParams = params || {};
  localStorage.setItem('loadout:lastRoute', r);
  render();
}

function render() {
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.route === route));
  const app = document.getElementById('app');
  app.innerHTML = '';
  const renderers = {
    today: renderToday, program: renderProgramOverview, 'program-day': renderProgramDay,
    progress: renderProgress, maxes: renderMaxes, library: renderLibrary
  };
  (renderers[route] || renderToday)(app);
}

document.querySelectorAll('.tab').forEach(t => t.addEventListener('click', () => navigate(t.dataset.route)));

/* ---------- helpers to build DOM quickly ---------- */
function el(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstChild;
}
function header(title, subtitle) {
  return `<div class="page-header"><p class="stencil">Loadout</p><h1 class="hero-label">${title}</h1>${subtitle ? `<p class="card-sub" style="margin-top:6px">${subtitle}</p>` : ''}</div>`;
}

/* ================= TODAY ================= */
function renderToday(app) {
  const info = getActiveProgram();
  if (!info) {
    app.appendChild(el(`
      <div>
        ${header('Today')}
        <div class="empty">
          <span class="stencil">No active program</span>
          Go to Library and start a program to see today's workout here.
          <div style="margin-top:16px"><button class="btn btn-accent" id="go-lib">Go to library</button></div>
        </div>
      </div>
    `));
    app.querySelector('#go-lib').onclick = () => navigate('library');
    return;
  }
  const { program, active } = info;
  const dayIndex = getDayIndexForToday(program, active);
  const day = program.days[dayIndex];
  const maxes = getMaxes();
  const dateKey = todayStr();
  const logKey = `${program.id}_${dateKey}`;
  let logs = getLogs();
  let entry = logs.find(l => l.key === logKey);

  const wrap = el(`<div>${header(day.label || `Day ${dayIndex + 1}`, `${program.name} · day ${dayIndex + 1} of ${program.days.length}`)}</div>`);
  app.appendChild(wrap);

  // "Life happened" control: push today's workout to tomorrow by nudging the
  // program start date forward a day, which cascades every future day back too.
  function appendReschedule(container) {
    const card = el(`
      <div class="card reschedule-card">
        <div class="reschedule-row">
          <div>
            <p class="card-title" style="margin:0">Can't train today?</p>
            <p class="card-sub" style="margin-top:2px">Push this workout to tomorrow — every day after shifts back one too.</p>
          </div>
          <button class="btn btn-ghost btn-sm" id="push-next">Push &rarr;</button>
        </div>
      </div>
    `);
    card.querySelector('#push-next').addEventListener('click', () => {
      if (!confirm("Push today's workout to tomorrow? Your whole program shifts back one day.")) return;
      const d = new Date(active.startDate + 'T00:00:00');
      d.setDate(d.getDate() + 1);
      active.startDate = d.toISOString().slice(0, 10);
      active.pushedOn = dateKey;      // mark today as intentionally skipped
      setActive(active);
      render();
    });
    container.appendChild(card);
  }

  // If today was pushed, show a skipped state instead of the (now earlier) slot.
  if (active.pushedOn === dateKey) {
    const tmr = new Date(dateKey + 'T00:00:00'); tmr.setDate(tmr.getDate() + 1);
    const off = daysBetween(active.startDate, tmr.toISOString().slice(0, 10));
    const n = program.days.length;
    const nextDay = program.days[((off % n) + n) % n];
    wrap.appendChild(el(`
      <div class="card">
        <p class="badge badge-muted">Pushed to tomorrow</p>
        <p class="card-sub" style="margin-top:10px">You moved today's session to tomorrow, so the whole schedule slid back a day. Rest up.</p>
        <p class="card-sub" style="margin-top:8px">Next up tomorrow: <strong>${nextDay.label || (nextDay.type === 'rest' ? 'Rest day' : 'Workout')}</strong></p>
      </div>
    `));
    appendReschedule(wrap);
    return;
  }

  if (day.type === 'rest') {
    wrap.appendChild(el(`
      <div class="card">
        <p class="badge badge-muted">Rest day</p>
        <p class="card-sub" style="margin-top:10px">Nothing programmed today. Recover up.</p>
      </div>
    `));
    appendReschedule(wrap);
    return;
  }

  if (!entry) {
    entry = { key: logKey, date: dateKey, programId: program.id, dayIndex, dayLabel: day.label, blocks: {}, done: false };
  }

  if (day.warmup && day.warmup.length) {
    wrap.appendChild(el(`
      <div class="card">
        <p class="card-title">Warmup</p>
        <div class="block-notes">${day.warmup.map(w => '&#8226; ' + w).join('\n')}</div>
      </div>
    `));
  }

  day.blocks.forEach((block, bi) => {
    if (!entry.blocks[bi]) entry.blocks[bi] = { notes: '', sets: block.sets.map(() => ({ weight: '', reps: '', rpe: '', done: false })) };
    const blockCard = el(`
      <div class="card">
        <p class="card-title">${block.letter ? block.letter + ') ' : ''}${block.name}</p>
        ${block.notes ? `<div class="block-notes">${block.notes}</div>` : ''}
        <div class="sets-list"></div>
        <div style="margin-top:10px">
          <label class="field-label">Notes for this exercise</label>
          <input type="text" class="block-note-input" placeholder="optional" value="${(entry.blocks[bi].notes || '').replace(/"/g, '&quot;')}">
        </div>
      </div>
    `);
    const setsList = blockCard.querySelector('.sets-list');
    block.sets.forEach((set, si) => {
      const target = calcTarget(set, maxes);
      let targetText = '';
      if (set.percentage != null) {
        if (!target || target.missing) {
          targetText = `${set.reps} reps @ ${set.percentage}% <span style="color:var(--danger)">(set your ${set.basedOn ? liftLabel(set.basedOn) : ''} max)</span>`;
        } else {
          targetText = `${set.reps} reps @ ${set.percentage}% &rarr; <span class="calc">${target.weight} lb</span>`;
        }
      } else if (set.description) {
        targetText = set.description;
      } else {
        targetText = `${set.reps || ''} reps`;
      }
      const s = entry.blocks[bi].sets[si] || { weight: '', reps: '', rpe: '', done: false };
      const row = el(`
        <div class="set-row">
          <div class="set-row-top">
            <span class="set-badge">${si + 1}</span>
            <span class="set-target">${targetText}</span>
          </div>
          <div class="set-row-bottom">
            <div class="set-inputs">
              <div class="field"><label>lb</label><input type="number" inputmode="decimal" class="in-weight" value="${s.weight}"></div>
              <div class="field"><label>reps</label><input type="number" inputmode="numeric" class="in-reps" value="${s.reps}"></div>
              <div class="field"><label>rpe</label><input type="number" inputmode="numeric" class="in-rpe" value="${s.rpe}"></div>
            </div>
            <button class="set-check ${s.done ? 'done' : ''}">&#10003;</button>
          </div>
        </div>
      `);
      const save = () => {
        entry.blocks[bi].sets[si] = {
          weight: row.querySelector('.in-weight').value,
          reps: row.querySelector('.in-reps').value,
          rpe: row.querySelector('.in-rpe').value,
          done: row.querySelector('.set-check').classList.contains('done')
        };
        persistEntry();
      };
      row.querySelector('.in-weight').addEventListener('input', save);
      row.querySelector('.in-reps').addEventListener('input', save);
      row.querySelector('.in-rpe').addEventListener('input', save);
      row.querySelector('.set-check').addEventListener('click', () => {
        row.querySelector('.set-check').classList.toggle('done');
        save();
      });
      setsList.appendChild(row);
    });
    blockCard.querySelector('.block-note-input').addEventListener('input', (ev) => {
      entry.blocks[bi].notes = ev.target.value;
      persistEntry();
    });
    wrap.appendChild(blockCard);
  });

  function persistEntry() {
    logs = getLogs();
    const idx = logs.findIndex(l => l.key === logKey);
    if (idx >= 0) logs[idx] = entry; else logs.push(entry);
    saveLogs(logs);
  }
  persistEntry();

  const finishCard = el(`
    <div class="card">
      <p class="card-title">Wrap up</p>
      <div style="display:flex; gap:10px; margin-bottom:12px">
        <div style="flex:1"><label class="field-label">Duration (min)</label><input type="number" id="fin-duration" value="${entry.durationMin || ''}"></div>
        <div style="flex:1"><label class="field-label">Body weight (lb)</label><input type="number" id="fin-bw" value="${entry.bodyweight || ''}"></div>
      </div>
      <label class="field-label">Workout notes</label>
      <input type="text" id="fin-notes" value="${(entry.notes || '').replace(/"/g, '&quot;')}" placeholder="optional">
      <div style="margin-top:14px">
        <button class="btn btn-accent" id="fin-btn">${entry.done ? 'Update workout' : 'Finish workout'}</button>
      </div>
    </div>
  `);
  wrap.appendChild(finishCard);
  finishCard.querySelector('#fin-btn').addEventListener('click', () => {
    entry.durationMin = finishCard.querySelector('#fin-duration').value;
    entry.bodyweight = finishCard.querySelector('#fin-bw').value;
    entry.notes = finishCard.querySelector('#fin-notes').value;
    entry.done = true;
    persistEntry();
    if (entry.bodyweight) {
      const bws = getBodyweights();
      const existing = bws.find(b => b.date === dateKey);
      if (existing) existing.weight = Number(entry.bodyweight);
      else bws.push({ date: dateKey, weight: Number(entry.bodyweight) });
      saveBodyweights(bws);
    }
    navigate('progress');
  });

  appendReschedule(wrap);
}

/* ================= PROGRAM OVERVIEW ================= */
function renderProgramOverview(app) {
  const info = getActiveProgram();
  if (!info) {
    app.appendChild(el(`<div>${header('Program')}<div class="empty"><span class="stencil">No active program</span>Start one from the Library tab.</div></div>`));
    return;
  }
  const { program, active } = info;
  const dayIndex = getDayIndexForToday(program, active);
  const wrap = el(`<div>${header(program.name, `Started ${fmtDate(active.startDate)} · cycles every ${program.days.length} days`)}</div>`);
  const card = el('<div class="card"></div>');
  program.days.forEach((day, i) => {
    const row = el(`
      <div class="day-row ${i === dayIndex ? 'active' : ''}">
        <span class="day-idx">${i + 1}</span>
        <span class="day-name">${day.label || (day.type === 'rest' ? 'Rest day' : 'Workout')}</span>
        <span class="day-type">${day.type === 'rest' ? 'Rest' : (day.blocks ? day.blocks.length + ' blocks' : '')}</span>
      </div>
    `);
    row.addEventListener('click', () => navigate('program-day', { programId: program.id, dayIndex: i }));
    card.appendChild(row);
  });
  wrap.appendChild(card);
  wrap.appendChild(el(`<button class="btn btn-danger" id="stop-btn" style="margin-top:8px">Stop this program</button>`));
  app.appendChild(wrap);
  app.querySelector('#stop-btn').addEventListener('click', () => {
    if (confirm('Stop the active program? Your logs stay saved.')) {
      setActive(null);
      navigate('library');
    }
  });
}

function renderProgramDay(app) {
  const { programId, dayIndex } = routeParams;
  const program = getPrograms().find(p => p.id === programId);
  if (!program) { navigate('program'); return; }
  const day = program.days[dayIndex];
  const maxes = getMaxes();
  const wrap = el(`<div>${header(day.label || `Day ${dayIndex + 1}`, program.name)}</div>`);
  wrap.appendChild(el(`<button class="btn btn-ghost" id="back-btn" style="margin-bottom:12px">&larr; Back to program</button>`));
  if (day.type === 'rest') {
    wrap.appendChild(el(`<div class="card"><p class="badge badge-muted">Rest day</p></div>`));
  } else {
    if (day.warmup && day.warmup.length) {
      wrap.appendChild(el(`<div class="card"><p class="card-title">Warmup</p><div class="block-notes">${day.warmup.map(w => '&#8226; ' + w).join('\n')}</div></div>`));
    }
    day.blocks.forEach(block => {
      const sets = block.sets.map(set => {
        const t = calcTarget(set, maxes);
        if (set.percentage != null) {
          return t && !t.missing ? `${set.reps} @ ${set.percentage}% &rarr; ${t.weight} lb` : `${set.reps} @ ${set.percentage}%`;
        }
        return set.description || `${set.reps || ''} reps`;
      }).join('<br>');
      wrap.appendChild(el(`
        <div class="card">
          <p class="card-title">${block.letter ? block.letter + ') ' : ''}${block.name}</p>
          ${block.notes ? `<div class="block-notes">${block.notes}</div>` : ''}
          <div class="card-sub" style="margin-top:8px">${sets}</div>
        </div>
      `));
    });
  }
  app.appendChild(wrap);
  app.querySelector('#back-btn').addEventListener('click', () => navigate('program'));
}

/* ================= PROGRESS ================= */
function renderProgress(app) {
  const logs = getLogs().filter(l => l.done).sort((a, b) => b.date.localeCompare(a.date));
  const bws = getBodyweights().sort((a, b) => a.date.localeCompare(b.date));
  const wrap = el(`<div>${header('Progress')}</div>`);

  const totalWorkouts = logs.length;
  let streak = 0;
  { let d = todayStr(); const set = new Set(logs.map(l => l.date));
    while (set.has(d)) { streak++; d = new Date(new Date(d + 'T00:00:00').getTime() - 86400000).toISOString().slice(0, 10); } }

  const metrics = el(`
    <div class="metric-grid">
      <div class="metric"><span class="stencil">Total workouts</span><div class="value">${totalWorkouts}</div></div>
      <div class="metric"><span class="stencil">Current streak</span><div class="value">${streak}d</div></div>
    </div>
  `);
  wrap.appendChild(metrics);

  const chartCard = el('<div class="card"><p class="card-title">Body weight</p></div>');
  if (bws.length < 2) {
    chartCard.appendChild(el('<p class="card-sub">Log body weight after a workout to see a trend here.</p>'));
  } else {
    const w = 320, h = 100, pad = 10;
    const vals = bws.map(b => b.weight);
    const min = Math.min(...vals), max = Math.max(...vals);
    const range = max - min || 1;
    const pts = bws.map((b, i) => {
      const x = pad + (i / (bws.length - 1)) * (w - pad * 2);
      const y = h - pad - ((b.weight - min) / range) * (h - pad * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');
    chartCard.appendChild(el(`
      <div class="chart-wrap">
        <svg viewBox="0 0 ${w} ${h}" style="width:100%; height:${h}px">
          <polyline points="${pts}" fill="none" stroke="#e0b24c" stroke-width="2"/>
        </svg>
      </div>
      <div class="card-sub" style="display:flex; justify-content:space-between; margin-top:4px">
        <span>${fmtDate(bws[0].date)} &middot; ${bws[0].weight} lb</span>
        <span>${fmtDate(bws[bws.length - 1].date)} &middot; ${bws[bws.length - 1].weight} lb</span>
      </div>
    `));
  }
  wrap.appendChild(chartCard);

  const histCard = el('<div class="card"><p class="card-title">History</p></div>');
  if (!logs.length) {
    histCard.appendChild(el('<p class="card-sub">Finished workouts will show up here.</p>'));
  } else {
    logs.slice(0, 20).forEach(l => {
      histCard.appendChild(el(`
        <div class="day-row">
          <span class="day-name">${fmtDate(l.date)} &middot; ${l.dayLabel || 'Workout'}</span>
          <span class="day-type">${l.durationMin ? l.durationMin + ' min' : ''}</span>
        </div>
      `));
    });
  }
  wrap.appendChild(histCard);
  app.appendChild(wrap);
}

/* ================= MAXES ================= */
const DEFAULT_LIFTS = ['back_squat', 'front_squat', 'deadlift', 'bench', 'clean', 'snatch', 'overhead_press', 'split_jerk', 'jerk', 'clean_and_jerk'];
function renderMaxes(app) {
  const maxes = getMaxes();
  const wrap = el(`<div>${header('Maxes', 'These power the % calculations in your programs and double as your PR log.')}</div>`);
  const liftsUsed = Array.from(new Set([...DEFAULT_LIFTS, ...Object.keys(maxes)]));

  liftsUsed.forEach(key => {
    const m = maxes[key] || {};
    const card = el(`
      <div class="card">
        <p class="card-title">${liftLabel(key)}</p>
        <p class="card-sub">${m.updated ? 'Updated ' + fmtDate(m.updated) : 'Not set yet'}</p>
        <div style="display:grid; grid-template-columns: repeat(4, minmax(0,1fr)); gap:8px">
          ${[1, 2, 3, 5].map(r => `
            <div>
              <label class="field-label">${r}RM</label>
              <input type="number" class="max-input" data-rep="${r}" value="${m[r] != null ? m[r] : ''}">
            </div>
          `).join('')}
        </div>
      </div>
    `);
    card.querySelectorAll('.max-input').forEach(inp => {
      inp.addEventListener('change', () => {
        const all = getMaxes();
        if (!all[key]) all[key] = {};
        const rep = inp.dataset.rep;
        const val = inp.value === '' ? null : Number(inp.value);
        if (val == null) delete all[key][rep]; else all[key][rep] = val;
        all[key].updated = todayStr();
        saveMaxes(all);
        card.querySelector('.card-sub').textContent = 'Updated ' + fmtDate(todayStr());
      });
    });
    wrap.appendChild(card);
  });

  const addCard = el(`
    <div class="card">
      <p class="card-title">Add another lift</p>
      <div style="display:flex; gap:8px">
        <input type="text" id="new-lift-name" placeholder="e.g. incline bench" style="flex:1">
        <button class="btn btn-sm btn-accent" id="add-lift-btn">Add</button>
      </div>
    </div>
  `);
  wrap.appendChild(addCard);
  app.appendChild(wrap);
  app.querySelector('#add-lift-btn').addEventListener('click', () => {
    const name = app.querySelector('#new-lift-name').value.trim();
    if (!name) return;
    const key = name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
    const all = getMaxes();
    if (!all[key]) all[key] = { updated: todayStr() };
    LIFT_LABELS[key] = name;
    saveMaxes(all);
    render();
  });
}

/* ================= LIBRARY / IMPORT ================= */
function renderLibrary(app) {
  const programs = getPrograms();
  const active = getActive();
  const wrap = el(`<div>${header('Library')}</div>`);

  if (!programs.length) {
    wrap.appendChild(el('<div class="empty"><span class="stencil">No programs yet</span>Paste one in below to get started.</div>'));
  } else {
    programs.forEach(p => {
      const isActive = active && active.programId === p.id;
      const card = el(`
        <div class="card">
          <p class="card-title">${p.name} ${isActive ? '<span class="badge badge-success" style="margin-left:6px">Active</span>' : ''}</p>
          <p class="card-sub">${p.days.length} day cycle</p>
          <div class="btn-row">
            ${isActive ? '' : '<button class="btn btn-accent start-btn">Start program</button>'}
            <button class="btn btn-danger delete-btn">Delete</button>
          </div>
        </div>
      `);
      const startBtn = card.querySelector('.start-btn');
      if (startBtn) startBtn.addEventListener('click', () => {
        setActive({ programId: p.id, startDate: todayStr() });
        navigate('today');
      });
      card.querySelector('.delete-btn').addEventListener('click', () => {
        if (confirm(`Delete "${p.name}"? This can't be undone.`)) {
          savePrograms(getPrograms().filter(x => x.id !== p.id));
          if (isActive) setActive(null);
          render();
        }
      });
      wrap.appendChild(card);
    });
  }

  // Starter programs bundled with the app
  const installedNames = new Set(programs.map(p => p.name));
  const availableStarters = STARTER_PROGRAMS.filter(s => !installedNames.has(s.name));
  if (availableStarters.length) {
    const starterCard = el(`
      <div class="card">
        <p class="card-title">Starter programs</p>
        <p class="card-sub">Your imported programs, ready to add. Each starts at Day 1 whenever you press Start.</p>
        <div class="starter-list"></div>
      </div>
    `);
    const list = starterCard.querySelector('.starter-list');
    availableStarters.forEach(s => {
      const row = el(`
        <div class="day-row">
          <span class="day-name">${s.name}</span>
          <button class="btn btn-sm btn-accent add-starter">Add</button>
        </div>
      `);
      row.querySelector('.add-starter').addEventListener('click', async (ev) => {
        const btn = ev.target;
        btn.textContent = 'Adding…';
        btn.disabled = true;
        try {
          // Cache-bust so a stale/poisoned service-worker cache can't serve an old 404 here.
          const res = await fetch(s.file + '?v=' + Date.now(), { cache: 'no-store' });
          if (!res.ok) throw new Error('not found');
          const parsed = await res.json();
          parsed.id = uid();
          const all = getPrograms();
          all.push(parsed);
          savePrograms(all);
          render();
        } catch (e) {
          btn.textContent = 'Failed';
          btn.disabled = false;
        }
      });
      list.appendChild(row);
    });
    wrap.appendChild(starterCard);
  }

  const importCard = el(`
    <div class="card">
      <p class="card-title">Import a program</p>
      <p class="card-sub">Ask Claude in chat to build or convert a program into Loadout's JSON format, then paste the result below.</p>
      <textarea id="import-text" placeholder='{ "name": "...", "days": [ ... ] }'></textarea>
      <div style="margin-top:10px">
        <button class="btn btn-accent" id="import-btn">Import</button>
      </div>
      <p id="import-error" class="card-sub" style="color:var(--danger); margin-top:8px; display:none"></p>
    </div>
  `);
  wrap.appendChild(importCard);
  app.appendChild(wrap);

  importCard.querySelector('#import-btn').addEventListener('click', () => {
    const raw = importCard.querySelector('#import-text').value.trim();
    const errEl = importCard.querySelector('#import-error');
    errEl.style.display = 'none';
    try {
      const parsed = JSON.parse(raw);
      if (!parsed.name || !Array.isArray(parsed.days)) throw new Error('Missing "name" or "days" array.');
      parsed.id = uid();
      const list = getPrograms();
      list.push(parsed);
      savePrograms(list);
      importCard.querySelector('#import-text').value = '';
      render();
    } catch (e) {
      errEl.textContent = 'Could not import: ' + e.message;
      errEl.style.display = 'block';
    }
  });
}

/* ---------- boot ---------- */
render();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
