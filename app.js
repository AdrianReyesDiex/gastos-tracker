import { ICONS } from './icons.js';
import { cleanMoney, parseMoney, parseAmount, cardUsed, debtLeft, periodRange, filterExpenses, totalsBy, timeBins, validBackup,
  localDate, daysUntil, goalPlan, goalMilestone, isSpending, isCashOut, budgetStatus, lastMonthResults, streakDays } from './logic.js';

const KEY = 'gastos-v1';
const THEME_KEY = 'gastos-tema';
const THEMES = {
  indigo: { name: 'Índigo', brand: 'linear-gradient(135deg, #6366f1, #8b5cf6 55%, #d946ef)', accent: 'light-dark(#4f46e5, #818cf8)', glow: 'rgba(139, 92, 246, .35)' },
  oceano: { name: 'Océano', brand: 'linear-gradient(135deg, #0891b2, #2563eb 60%, #4f46e5)', accent: 'light-dark(#0369a1, #38bdf8)', glow: 'rgba(37, 99, 235, .35)' },
  esmeralda: { name: 'Esmeralda', brand: 'linear-gradient(135deg, #059669, #047857 50%, #115e59)', accent: 'light-dark(#047857, #34d399)', glow: 'rgba(16, 185, 129, .35)' },
  atardecer: { name: 'Atardecer', brand: 'linear-gradient(135deg, #ea580c, #dc2626 55%, #be123c)', accent: 'light-dark(#c2410c, #fb923c)', glow: 'rgba(249, 115, 22, .35)' },
  rosa: { name: 'Rosa', brand: 'linear-gradient(135deg, #db2777, #be185d 50%, #9d174d)', accent: 'light-dark(#be185d, #f472b6)', glow: 'rgba(236, 72, 153, .35)' },
  grafito: { name: 'Grafito', brand: 'linear-gradient(135deg, #475569, #1e293b 60%, #0f172a)', accent: 'light-dark(#334155, #cbd5e1)', glow: 'rgba(15, 23, 42, .3)' },
  // A whole look, not just colors: see [data-style=sticker] in index.html. Light only.
  sticker: { name: 'Sticker', brand: '#fa00ff', accent: '#000', glow: 'transparent', style: 'sticker',
    swatch: 'linear-gradient(90deg, #fa00ff 0 33%, #02bbff 33% 66%, #adff02 66%)' },
};
const STICKER_FILLS = { debito: ['#02bbff', '#e7e3bf', '#adff02'], credito: ['#fa00ff', '#3a3a3a', '#02bbff'] };
const SCHEMES = { '': 'Automático', light: 'Claro', dark: 'Oscuro' }; // values are CSS color-scheme ('' = follow the iPhone)
// `c` is the chart color slot (--cat-1..5); custom categories all share slot 5.
const CATEGORIES = {
  Comida: { icon: 'utensils', c: 2 },
  Transporte: { icon: 'car', c: 1, detail: '¿Qué fue? (ej. Uber, gasolina)' }, // `detail`: optional free text, "General" if left empty
  Servicio: { icon: 'lightbulb', c: 3, detail: '¿Qué servicio? (ej. luz, internet)' },
  Deuda: { icon: 'hand-coins', c: 4 },
};
const OTHER = { icon: 'pencil', c: 5 };
const catOf = name => CATEGORIES[name] ?? OTHER;
const budgetKey = name => CATEGORIES[name] ? name : 'Otros'; // custom categories share one budget
const METHODS = {
  efectivo: { label: 'Efectivo', icon: 'banknote', color: '#34c759' },
  debito: { label: 'Débito', icon: 'credit-card', color: '#0a84ff' },
  credito: { label: 'Crédito', icon: 'landmark', color: '#a855f7' },
};
const GRADIENTS = {
  debito: ['#2563eb, #06b6d4', '#059669, #10b981', '#0ea5e9, #6366f1'],
  credito: ['#1f2937, #4b5563', '#7c3aed, #db2777', '#ea580c, #e11d48'],
};

const $app = document.getElementById('app');
const $nav = document.querySelector('nav');

// { name, cards: [{id, type, name, limit?, startUsed?, since?}], debts: [{id, name, total, since?}],
//   expenses: [{id, amount (cents), category, detail?, debtId?, toCard?, method, cardId?, cardName?, date (ms)}],
//   goals: [{id, name, amount, saved, date: 'YYYY-MM-DD'}], incomes: [{id, amount, source, date (ms)}],
//   budgets: { Comida: cents, ..., Otros: cents } (monthly) }
// Money is in cents. A "Deuda" expense pays the card or debt in `debtId`; `toCard` marks credit card payments.
let db = JSON.parse(localStorage.getItem(KEY));
// Fills in what data saved by older versions doesn't have
function upgrade(data) {
  data.debts ??= [];
  data.goals ??= [];
  data.incomes ??= [];
  data.budgets ??= {};
  for (const e of data.expenses) if (e.debtId && data.cards.some(c => c.id === e.debtId)) e.toCard = true;
  return data;
}
if (db) upgrade(db);
let tab = 'registrar';
let draft = null; // expense being registered or edited (draft.editId)
const setup = { name: '', debito: [], credito: [] }; // card entries: { name, limit, used } as typed
const filter = { period: 'mes', offset: 0, method: 'todos' };
const theme = { color: 'indigo', scheme: '', ...JSON.parse(localStorage.getItem(THEME_KEY)) };

const currentTheme = () => THEMES[theme.color] ?? THEMES.indigo;

function applyTheme() {
  const t = currentTheme(), root = document.documentElement.style;
  document.documentElement.dataset.style = t.style ?? '';
  root.colorScheme = t.style ? 'light' : theme.scheme;
  root.setProperty('--brand', t.brand);
  root.setProperty('--accent', t.accent);
  root.setProperty('--glow', t.glow);
}

function save() {
  try { localStorage.setItem(KEY, JSON.stringify(db)); }
  catch { alert('No se pudo guardar. Exporta un respaldo desde Perfil.'); }
}

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2);
const esc = s => String(s).replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);
// shortcut: currency fixed to MXN, make it a profile setting if you ever need another one.
const money = cents => (cents / 100).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
const fmtDate = (d, opts) => { const s = new Date(d).toLocaleDateString('es-MX', opts); return s[0].toUpperCase() + s.slice(1); };
const time = d => new Date(d).toLocaleTimeString('es-MX', { hour: 'numeric', minute: '2-digit' });
// A Lucide icon by name (see icons.js), sized by CSS (.i)
const icon = name => `<svg class="i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;
const cardsOf = type => db.cards.filter(c => c.type === type);
const cardBg = c => {
  const i = cardsOf(c.type).indexOf(c) % 3;
  if (currentTheme().style !== 'sticker') return `--g: linear-gradient(135deg, ${GRADIENTS[c.type][i]})`;
  const fill = STICKER_FILLS[c.type][i];
  return `--g: ${fill}; --ink: ${fill === '#3a3a3a' ? '#fff' : '#000'}`; // black ink on neon, white only on graphite
};
// While editing an expense, balances leave it out, so it isn't counted against itself
const balanceExpenses = () => draft?.editId ? db.expenses.filter(e => e.id !== draft.editId) : db.expenses;
const available = c => c.limit - cardUsed(c, balanceExpenses());
const cardFace = (c, sub = c.type === 'debito' ? 'Débito' : c.limit ? `Disponible ${money(available(c))}` : 'Crédito · sin límite') =>
  `<span class="chip"></span><span><small>${sub}</small><b>${esc(c.name)}</b></span>`;
const cardButton = (c, act, selected, sub, disabled, cls = '') =>
  `<button class="bank-card ${cls} ${selected ? 'sel' : ''}" style="${cardBg(c)}" data-act="${act}" data-v="${esc(c.id)}" ${disabled ? 'disabled' : ''}>${cardFace(c, sub)}</button>`;
const owedOnCard = c => cardUsed(c, balanceExpenses());
const today = () => new Date().toLocaleDateString('en-CA'); // local YYYY-MM-DD, the format of <input type="date">
const dayKey = ms => new Date(ms).toLocaleDateString('en-CA');
// This month's spending in a budget's categories
const monthSpent = (key, expenses = db.expenses) =>
  sum(filterExpenses(expenses, { period: 'mes', offset: 0, method: 'todos' }).filter(e => isSpending(e) && budgetKey(e.category) === key));
// The card's current name; falls back to the name saved with the expense if the card was deleted.
const payLabel = e => e.method === 'efectivo' ? 'Efectivo' : `${METHODS[e.method].label} · ${db.cards.find(c => c.id === e.cardId)?.name ?? e.cardName}`;
// A tiny card in that card's own colors (gray once the card was deleted), to recognize it at a glance
const miniCard = c => `<i class="mini-card" style="${c ? cardBg(c) : '--g: var(--muted)'}" aria-hidden="true"></i>`;
// Where the money came from, as a tag: Efectivo, or [mini card] Name · Débito/Crédito (→ [card paid])
function payTag(e) {
  if (e.method === 'efectivo') return `<span class="pay-tag cash">${icon('banknote')}Efectivo</span>`;
  const card = db.cards.find(c => c.id === e.cardId);
  const paid = e.toCard && db.cards.find(c => c.id === e.debtId);
  return `<span class="pay-tag">${miniCard(card)}<span>${esc(card?.name ?? e.cardName)}</span><small>${METHODS[e.method].label}</small>${paid ? `<span class="pay-arrow" aria-label="pagó a">→</span>${miniCard(paid)}` : ''}</span>`;
}
const catLabel = e => e.detail ? `${e.category} · ${e.detail}` : e.category;
const meter = (part, whole) => `<span class="meter"><i style="width:${whole ? Math.min(100, Math.max(0, part / whole * 100)) : 100}%"></i></span>`;
const sum = list => list.reduce((total, e) => total + e.amount, 0);

function dayLabel(d) {
  const daysAgo = Math.round((periodRange('dia', 0)[0] - new Date(d).setHours(0, 0, 0, 0)) / 864e5);
  return daysAgo === 0 ? 'Hoy' : daysAgo === 1 ? 'Ayer' : fmtDate(d, { weekday: 'long', day: 'numeric', month: 'long' });
}

function periodLabel() {
  const [from, to] = periodRange(filter.period, filter.offset);
  if (filter.period === 'dia') return dayLabel(from);
  if (filter.period === 'mes') return fmtDate(from, { month: 'long', year: 'numeric' });
  const short = d => d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
  return `${short(from)} – ${short(new Date(to - 1))}`;
}

// ---------- Motion & notifications ----------

const motion = !matchMedia('(prefers-reduced-motion: reduce)').matches;
const EASE = 'cubic-bezier(.2, .8, .2, 1)';
const SPRING = 'cubic-bezier(.34, 1.56, .64, 1)';

function animate(el, frames, opts) {
  return motion && el ? el.animate(frames, { duration: 350, easing: EASE, fill: 'backwards', ...opts }).finished : Promise.resolve();
}

// Slide/fade elements in one after another (dx > 0 comes from the right), and grow the chart bars.
function enter(els = [...$app.children], dx = 0) {
  els.forEach((el, i) => animate(el, [{ opacity: 0, transform: `translate(${dx}px, ${dx ? 0 : 14}px)` }, { opacity: 1, transform: 'none' }], { delay: i * 40 }));
  for (const bar of $app.querySelectorAll('.bar i')) animate(bar, [{ transform: 'scaleX(0)' }, { transform: 'none' }], { duration: 700, delay: 150 });
  $app.querySelectorAll('.cols i').forEach((col, i) => animate(col, [{ transform: 'scaleY(0)' }, { transform: 'none' }], { duration: 500, delay: 150 + i * 12 }));
  animate($app.querySelector('.donut svg'), [{ opacity: 0, transform: 'rotate(-200deg) scale(.7)' }, { opacity: 1, transform: 'rotate(-90deg)' }], { duration: 800, delay: 150 });
}

const pop = el => animate(el, [{ transform: 'scale(.92)' }, { transform: 'scale(1.04)' }, { transform: 'none' }], { duration: 320, easing: 'ease-out' });
// Lucide's trash-2, split so the lid (its last two strokes) can open on its own
const [can1, can2, can3, lid1, lid2] = ICONS['trash-2'].match(/<path[^>]*\/>/g);
const BIN = `<svg class="bin-can" viewBox="0 0 24 24" aria-hidden="true">${can1}${can2}${can3}</svg><svg class="bin-lid" viewBox="0 0 24 24" aria-hidden="true">${lid1}${lid2}</svg>`;

// Deleting: a copy of the item flies in an arc into a trash can that pops up, opens, closes and wobbles.
// The original hides right away; resolves when the copy lands, so the caller can re-render then.
function trashFx(el) {
  if (!el || !motion) return Promise.resolve();
  const r = el.getBoundingClientRect();
  const bin = Object.assign(document.createElement('div'), { className: 'trash-bin', innerHTML: BIN });
  document.body.append(bin);
  const b = bin.getBoundingClientRect(), lid = bin.querySelector('.bin-lid');
  const ghost = el.cloneNode(true);
  ghost.classList.add('trash-ghost');
  Object.assign(ghost.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
  if (getComputedStyle(el).backgroundColor === 'rgba(0, 0, 0, 0)') ghost.style.background = 'var(--card)'; // rows take their color from the list
  document.body.append(ghost);
  el.style.visibility = 'hidden';
  bin.animate([{ transform: 'scale(0)' }, { transform: 'scale(1.12)' }, { transform: 'none' }], { duration: 300, easing: 'ease-out' });
  lid.animate([{ transform: 'none' }, { transform: 'rotate(-40deg)' }], { duration: 220, delay: 120, fill: 'forwards' });
  const dx = b.left + b.width / 2 - (r.left + r.width / 2), dy = b.top + b.height / 2 - (r.top + r.height / 2);
  return ghost.animate([
    { transform: 'none' },
    { transform: `translate(${dx * .35}px, ${dy * .35 - 60}px) scale(.55) rotate(-6deg)`, offset: .45 }, // up first: an arc
    { transform: `translate(${dx}px, ${dy}px) scale(.05) rotate(10deg)`, opacity: .3 },
  ], { duration: 650, delay: 150, easing: 'cubic-bezier(.45, 0, .7, 1)', fill: 'forwards' }).finished.then(() => {
    ghost.remove();
    lid.animate([{ transform: 'rotate(-40deg)' }, { transform: 'none' }], { duration: 180, easing: 'ease-in', fill: 'forwards' });
    bin.animate([0, -10, 8, -5, 0].map(deg => ({ transform: `rotate(${deg}deg)` })), { duration: 420, delay: 160 }).finished
      .then(() => bin.animate([{ opacity: 1 }, { opacity: 0, transform: 'scale(0)' }], { duration: 220, delay: 120, fill: 'forwards' }).finished)
      .then(() => bin.remove());
  });
}

function toast(msg, type = 'ok') {
  document.querySelector('.toast')?.remove();
  const t = Object.assign(document.createElement('div'), { className: `toast ${type}`, role: 'status' });
  t.innerHTML = `<i>${icon(type === 'ok' ? 'check' : 'triangle-alert')}</i>${esc(msg)}`;
  document.body.append(t);
  animate(t, [{ opacity: 0, transform: 'translateY(-16px) scale(.5)' }, { opacity: 1, transform: 'none' }], { duration: 500, easing: SPRING });
  setTimeout(() => animate(t, [{}, { opacity: 0, transform: 'translateY(-12px) scale(.8)' }], { duration: 250, fill: 'forwards' }).then(() => t.remove()), 2200);
}

// Attention without celebrating: shake, a red flash, a blink
const shake = el => animate(el, [0, -8, 8, -5, 5, 0].map(x => ({ transform: `translateX(${x}px)` })), { duration: 380 });
const blink = el => animate(el, [1, .2, 1, .2, 1, .2, 1].map(opacity => ({ opacity })), { duration: 1200, easing: 'linear' });

// A budget just passed: its row on Home shakes and flashes red once, and its bar throbs
function alertBudget(key) {
  const row = $app.querySelector(`.budget[data-k="${key}"]`);
  shake(row);
  animate(row, [{ backgroundColor: 'rgba(255, 59, 48, .3)' }, { backgroundColor: 'rgba(255, 59, 48, 0)' }], { duration: 1200, easing: 'ease-out' });
  animate(row?.querySelector('.meter'), [{ transform: 'scaleY(1)' }, { transform: 'scaleY(2.4)' }, { transform: 'scaleY(1)' }], { duration: 500, delay: 120 });
}

function showError(msg) {
  toast(msg, 'error');
  shake($app.querySelector('.primary'));
}

// Confetti for achievements (goal reached, debt paid off): two cannons from the bottom corners. Plain canvas, no library.
const PARTY = ['#fa00ff', '#02bbff', '#adff02', '#ffcc00', '#ff6b35', '#8b5cf6', '#34c759'];
const GOLD = ['#f7c948', '#ffd95a', '#e6a700', '#fff3b0', '#c99a06', '#ffe680'];
function confetti(colors = PARTY) {
  if (!motion) return;
  const W = innerWidth, H = innerHeight, dpr = devicePixelRatio || 1;
  const canvas = Object.assign(document.createElement('canvas'), { className: 'confetti', width: W * dpr, height: H * dpr });
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  document.body.append(canvas);
  const bits = Array.from({ length: 160 }, (_, i) => {
    const left = i % 2 === 0, angle = ((left ? -62 : -118) + (Math.random() - .5) * 36) * Math.PI / 180, speed = 15 + Math.random() * 11;
    return { x: left ? 0 : W, y: H * .9, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, w: 6 + Math.random() * 5, h: 9 + Math.random() * 7,
      rot: Math.random() * 6, spin: (Math.random() - .5) * .35, color: colors[i % colors.length] };
  });
  const start = performance.now(), DURATION = 3000;
  let last = start;
  requestAnimationFrame(function frame(t) {
    const dt = Math.min((t - last) / 16.7, 3); // same speed at 60 Hz and on the iPhone's 120 Hz screen
    last = t;
    const life = (t - start) / DURATION;
    ctx.clearRect(0, 0, W, H);
    ctx.globalAlpha = Math.min(1, (1 - life) / .25); // fade out over the last quarter
    for (const b of bits) {
      b.vy += .38 * dt;
      b.vx *= .985 ** dt;
      b.vy *= .985 ** dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.rot += b.spin * dt;
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(b.rot);
      ctx.fillStyle = b.color;
      ctx.fillRect(-b.w / 2, -b.h / 2, b.w, b.h * Math.cos(b.rot * 1.7)); // flips like paper
      ctx.restore();
    }
    if (life < 1) requestAnimationFrame(frame);
    else canvas.remove();
  });
}

// Full-screen confirmation. Options: `art` replaces the check mark (medal, paid card...), `duration` in ms.
function celebrate(title, text, lines = [], { art, duration } = {}) {
  const el = Object.assign(document.createElement('div'), { className: 'success', role: 'status' });
  el.innerHTML = `${art ?? `<svg class="check" viewBox="0 0 52 52" aria-hidden="true"><circle cx="26" cy="26" r="24"/><path d="M15 27l7 7 15-15"/></svg>`}
    <b>${esc(title)}</b><span>${esc(text)}</span>
    ${lines.map(l => `<span class="success-line">${l.icon ? icon(l.icon) : ''}${esc(l.text ?? l)}</span>`).join('')}`;
  document.body.append(el);
  // Resolves once it's gone, so what's behind can be animated where it's visible
  return celebrating = new Promise(resolve => {
    const close = () => {
      if (el.classList.contains('out')) return; // tapped and timed out
      el.classList.add('out');
      setTimeout(() => { el.remove(); resolve(); }, 300);
    };
    el.onclick = close;
    setTimeout(close, duration ?? (lines.length ? 2600 : 1600)); // longer when there are balances to read
  });
}
let celebrating = Promise.resolve(); // the confirmation on screen, if any; count-ups wait for it

// Numbers marked data-count="key" data-value="cents" that changed since they were last shown
// count from the old value to the new one, like a scoreboard
const shownCounts = {};
function countUp() {
  for (const el of $app.querySelectorAll('[data-count]')) {
    const key = el.dataset.count, to = +el.dataset.value, from = shownCounts[key];
    shownCounts[key] = to;
    if (from === undefined || from === to || !motion) continue; // first time shown: no count
    el.textContent = money(from);
    celebrating.then(() => tweenNumber(el, from, to));
  }
}

// Counts the number shown in `el` from `from` to `to`, easing out
function tweenNumber(el, from, to, format = money, duration = 900) {
  if (!el) return;
  if (!motion) return void (el.textContent = format(to));
  const start = performance.now();
  requestAnimationFrame(function step(t) {
    const p = Math.min(1, (t - start) / duration);
    el.textContent = format(Math.round(from + (to - from) * (1 - (1 - p) ** 3)));
    if (p < 1 && el.isConnected) requestAnimationFrame(step);
  });
}

// Golden coins raining down, flipping as they fall (saved part of the month's income)
function coinRain(count = 36) {
  if (!motion) return;
  for (let i = 0; i < count; i++) {
    const coin = Object.assign(document.createElement('i'), { className: 'coin' });
    Object.assign(coin.style, { left: `${Math.random() * innerWidth}px`, top: '-30px' });
    document.body.append(coin);
    const fall = innerHeight + 60, drift = (Math.random() - .5) * 70, flips = 2 + Math.floor(Math.random() * 3), steps = flips * 2;
    // scaleX going 1 → -1 → 1 makes the coin look like it's spinning
    coin.animate(Array.from({ length: steps + 1 }, (_, k) => ({ transform: `translate(${drift * k / steps}px, ${fall * k / steps}px) scaleX(${k % 2 ? -1 : 1})` })),
      { duration: 1500 + Math.random() * 1200, delay: Math.random() * 900, easing: 'ease-in', fill: 'backwards' }).finished.then(() => coin.remove());
  }
}

// ---------- Achievements: big and rare ----------

const STREAK_MARKS = [3, 7, 14, 21, 30, 60, 100, 180, 365]; // days in a row worth celebrating

// Once a month, on the first open after it ended: celebrate last month if it went well
function reviewLastMonth() {
  const [from] = periodRange('mes', -1), key = dayKey(from).slice(0, 7);
  if (db.lastMonthReview === key) return;
  db.lastMonthReview = key;
  save();
  const { underBudget, savedPct } = lastMonthResults(db, budgetKey);
  const month = fmtDate(from, { month: 'long' });
  let next = Promise.resolve();
  if (underBudget) next = next.then(() => {
    const shown = celebrate(`¡${month} sin pasarte!`, 'Cerraste el mes dentro de todos tus presupuestos', [],
      { art: `<span class="medal">${icon('medal')}</span>`, duration: 4200 });
    confetti(GOLD);
    return shown;
  });
  if (savedPct >= 20) next = next.then(() => {
    const shown = celebrate(`¡Ahorraste en ${month}!`, 'Es lo que te quedó de tus ingresos del mes', [],
      { art: '<b class="big-pct">0%</b>', duration: 4200 });
    coinRain();
    tweenNumber(document.querySelector('.success .big-pct'), 0, savedPct, n => `${n}%`, 1600);
    return shown;
  });
}

// Days in a row registering expenses: a flame grows and the days count up
function streakFx(days) {
  const shown = celebrate(`¡${days} días seguidos!`, 'anotando tus gastos. ¡Sigue así!', [],
    { art: `<span class="flame">${icon('flame')}</span><b class="streak-num">0</b>`, duration: 3600 });
  tweenNumber(document.querySelector('.success .streak-num'), 0, days, String, 1200);
  return shown;
}

// A credit card paid off: the card flips in and gets a "PAGADA" rubber stamp
const paidCardArt = c => `<div class="paid-card"><div class="bank-card" style="${cardBg(c)}">${cardFace(c, 'Crédito')}</div><span class="stamp">PAGADA</span></div>`;

// Little four-point stars that pop out from a point and fade (goal milestones, firsts)
function sparkleAt(x, y, count = 12, spread = 50) {
  if (!motion) return;
  for (let i = 0; i < count; i++) {
    const s = Object.assign(document.createElement('i'), { className: 'sparkle' });
    Object.assign(s.style, { left: `${x}px`, top: `${y}px` });
    s.style.setProperty('--spark', i % 2 ? '#ffc800' : 'var(--accent)'); // gold and the theme color
    document.body.append(s);
    const angle = Math.random() * Math.PI * 2, dist = spread * (.45 + Math.random() * .55);
    const at = k => `translate(${Math.cos(angle) * dist * k}px, ${Math.sin(angle) * dist * k}px)`;
    s.animate([
      { opacity: 0, transform: 'translate(0, 0) scale(0)' },
      { opacity: 1, transform: `${at(.6)} scale(1) rotate(45deg)`, offset: .4 },
      { opacity: 0, transform: `${at(1)} scale(.3) rotate(90deg)` },
    ], { duration: 700 + Math.random() * 400, delay: Math.random() * 150, easing: 'ease-out', fill: 'backwards' }).finished.then(() => s.remove());
  }
}

// Something new (first income, goal or card): a small sparkle over it, not full screen
function sparkleOn(el) {
  if (!el) return;
  const r = el.getBoundingClientRect();
  sparkleAt(r.left + r.width / 2, r.top + r.height / 2, 14, Math.min(90, Math.max(r.width, r.height) / 2));
}

const MILESTONES = { 25: '¡Ya llevas un cuarto!', 50: '¡Vas a la mitad!', 75: '¡Ya casi! Llevas el 75%' };

// A goal passed 25/50/75%: stars from the tip of its bar and the bar shines (the message goes in the toast)
function goalMilestoneFx(goal) {
  const bar = byV(goal.id)?.closest('.goal')?.querySelector('.meter');
  if (!bar) return;
  const r = bar.getBoundingClientRect();
  sparkleAt(r.left + r.width * goal.saved / goal.amount, r.top + r.height / 2, 14, 55);
  bar.classList.add('shine');
  setTimeout(() => bar.classList.remove('shine'), 2000);
}

// New income: little coins float up from its button, with the amount
function coinBurst(amount) {
  const btn = $app.querySelector('.income-btn');
  if (!btn || !motion) return;
  const r = btn.getBoundingClientRect();
  const float = (el, x, y) => { Object.assign(el.style, { left: `${x}px`, top: `${y}px` }); document.body.append(el); return el; };
  const label = float(Object.assign(document.createElement('div'), { className: 'float-amount', textContent: `+${money(amount)}` }), r.left + r.width / 2, r.top);
  label.animate([
    { opacity: 0, transform: 'translate(-50%, 0) scale(.8)' },
    { opacity: 1, transform: 'translate(-50%, -30px) scale(1)', offset: .25 },
    { opacity: 0, transform: 'translate(-50%, -100px)' },
  ], { duration: 1700, easing: 'ease-out' }).finished.then(() => label.remove());
  for (let i = 0; i < 8; i++) {
    const coin = float(Object.assign(document.createElement('i'), { className: 'coin' }), r.left + r.width * (.25 + Math.random() * .5), r.top + r.height / 2);
    const dx = (Math.random() - .5) * 90, dy = -(70 + Math.random() * 100), turn = (Math.random() - .5) * 360;
    coin.animate([
      { opacity: 0, transform: 'translate(0, 0) scale(.4)' },
      { opacity: 1, offset: .2 },
      { opacity: 0, transform: `translate(${dx}px, ${dy}px) scale(1) rotate(${turn}deg)` },
    ], { duration: 1100 + Math.random() * 500, delay: i * 60, easing: EASE, fill: 'backwards' }).finished.then(() => coin.remove());
  }
}

// Small form in a native <dialog>; onSave returns an error message to keep it open.
// Options: `preview(values)` returns HTML shown under the fields while typing;
// `onDelete()` adds an "Eliminar" button (it does its own confirm; return false to keep the form open).
function openSheet(title, fields, onSave, { preview, onDelete } = {}) {
  const d = Object.assign(document.createElement('dialog'), { className: 'sheet' });
  d.innerHTML = `
    <form method="dialog" novalidate>
      <h3>${esc(title)}</h3>
      ${fields.map(f => `<label>${f.label}<input class="field" name="${f.name}" value="${esc(f.value ?? '')}"
        ${f.money ? 'inputmode="decimal" placeholder="$0.00"' : f.attrs ?? `placeholder="${esc(f.placeholder ?? '')}"`}></label>`).join('')}
      <p class="sheet-preview" aria-live="polite"></p>
      <p class="sheet-error" role="alert"></p>
      <div class="sheet-actions">
        <button type="button" class="secondary">Cancelar</button>
        <button class="primary">Guardar</button>
      </div>
      ${onDelete ? '<button type="button" class="sheet-delete">Eliminar</button>' : ''}
    </form>`;
  d.querySelector('.secondary').onclick = () => d.close();
  if (onDelete) d.querySelector('.sheet-delete').onclick = () => { if (onDelete() !== false) d.close(); };
  d.querySelector('form').onsubmit = e => {
    const error = onSave(Object.fromEntries(new FormData(e.target)));
    if (error) { e.preventDefault(); d.querySelector('.sheet-error').textContent = error; }
  };
  if (preview) {
    const form = d.querySelector('form');
    const update = () => { d.querySelector('.sheet-preview').innerHTML = preview(Object.fromEntries(new FormData(form))); };
    form.oninput = update;
    update();
  }
  d.onclose = () => d.remove();
  document.body.append(d);
  d.showModal();
}

const daysText = n => n === 1 ? '1 día' : `${n} días`;

function editGoal(goal) {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  openSheet(goal ? 'Editar meta' : 'Nueva meta', [
    { name: 'name', label: 'Nombre', value: goal?.name, placeholder: 'ej. Viaje a Cancún' },
    { name: 'amount', label: 'Monto de la meta', value: goal ? goal.amount / 100 : '', money: true },
    { name: 'date', label: 'Fecha prevista', value: goal?.date, attrs: `type="date" min="${tomorrow.toLocaleDateString('en-CA')}"` },
    { name: 'saved', label: 'Ya ahorrado (opcional)', value: goal?.saved ? goal.saved / 100 : '', money: true },
  ], v => {
    const name = v.name.trim(), amount = parseAmount(v.amount), saved = parseMoney(v.saved);
    if (!name) return 'Escribe un nombre para la meta';
    if (!amount) return 'Escribe el monto de la meta';
    if (!v.date) return 'Elige la fecha prevista';
    if (v.date !== goal?.date && daysUntil(v.date) < 1) return 'La fecha tiene que ser después de hoy';
    if (saved === null || saved > amount) return 'Lo ahorrado no puede ser mayor que la meta';
    const g = goal ?? { id: uid() };
    const wasDone = goal && goalPlan(goal).done;
    const mark = goal && goalMilestone(goal.saved, saved, amount);
    Object.assign(g, { name, amount, saved, date: v.date });
    if (!goal) db.goals.push(g);
    save();
    render();
    pop(byV(g.id));
    const plan = goalPlan(g);
    if (goal && plan.done && !wasDone) {
      celebrate('¡Meta cumplida!', `${g.name} · ${money(g.amount)}`);
      confetti();
    } else if (mark) {
      toast(`${MILESTONES[mark]} · Meta actualizada`);
      goalMilestoneFx(g);
    } else if (goal) toast('Meta actualizada');
    else {
      celebrate('¡Meta creada!', `${name} · ${money(amount)}`, plan.done ? [] : [`Ahorra ${money(plan.daily)} al día durante ${daysText(plan.days)}`]);
      if (db.goals.length === 1) celebrating.then(() => sparkleOn(byV(g.id)?.closest('.goal'))); // first goal
    }
  }, { preview: v => {
    const amount = parseAmount(v.amount), saved = parseMoney(v.saved) ?? 0;
    if (!amount || !v.date || daysUntil(v.date) < 1) return '';
    const plan = goalPlan({ amount, saved, date: v.date });
    return plan.done ? `${icon('check')} Ya tienes todo ahorrado` : `${icon('lightbulb')} Tendrás que ahorrar <b>${money(plan.daily)}</b> al día durante ${daysText(plan.days)}`;
  } });
}

// This month: income − money that actually left it (cash, debit and card payments; not credit purchases)
function monthBalance() {
  const month = { period: 'mes', offset: 0, method: 'todos' };
  const income = sum(filterExpenses(db.incomes, month)), out = sum(filterExpenses(db.expenses, month).filter(isCashOut));
  return { income, out, left: income - out };
}

function editIncome(income) {
  openSheet(income ? 'Editar ingreso' : 'Nuevo ingreso', [
    { name: 'source', label: 'Concepto', value: income?.source, placeholder: 'ej. Quincena, sueldo, venta' },
    { name: 'amount', label: 'Monto', value: income ? income.amount / 100 : '', money: true },
    { name: 'date', label: 'Fecha', value: income ? dayKey(income.date) : today(), attrs: `type="date" max="${today()}"` },
  ], v => {
    const source = v.source.trim(), amount = parseAmount(v.amount);
    if (!source) return 'Escribe de dónde viene el ingreso';
    if (!amount) return 'Escribe el monto';
    if (!v.date || v.date > today()) return 'Elige una fecha de hoy o antes';
    const i = income ?? { id: uid() };
    Object.assign(i, { source, amount, date: withDate(v.date, income?.date) });
    if (!income) db.incomes.push(i);
    save();
    render();
    if (!income) coinBurst(amount);
    if (!income && db.incomes.length === 1) sparkleOn($app.querySelector('[data-count=left]')?.parentElement); // first income: "Te quedan" shows up
    const { left } = monthBalance();
    toast(`${income ? 'Ingreso actualizado' : 'Ingreso registrado'} · este mes te quedan ${money(left)}`);
  }, income ? { onDelete: () => {
    if (!confirm(`¿Eliminar el ingreso ${income.source} de ${money(income.amount)}?`)) return false;
    db.incomes = db.incomes.filter(x => x !== income);
    save();
    // the form closes right after this; its row behind it (if on screen) goes in the bin
    trashFx(byV(income.id)).then(() => { render(); toast('Ingreso eliminado'); });
  } } : undefined);
}

// A date picked in a form ('YYYY-MM-DD') as a timestamp: same day keeps the time of `ms` (default now), another day takes that time-of-day
function withDate(dateStr, ms = Date.now()) {
  if (dateStr === dayKey(ms)) return ms;
  const d = localDate(dateStr), base = new Date(ms);
  d.setHours(base.getHours(), base.getMinutes());
  return +d;
}

const BUDGET_KEYS = [...Object.keys(CATEGORIES), 'Otros'];

function editBudgets() {
  openSheet('Presupuesto mensual', BUDGET_KEYS.map(k => ({
    name: k, label: `${icon(catOf(k === 'Otros' ? '' : k).icon)} ${k}${k === 'Otros' ? ' (lo que escribes en «Otro»)' : ''}`,
    value: db.budgets[k] ? db.budgets[k] / 100 : '', money: true,
  })), v => {
    const budgets = {};
    for (const k of BUDGET_KEYS) {
      const cents = parseMoney(v[k]);
      if (cents === null) return `Revisa el monto de ${k}`;
      if (cents) budgets[k] = cents; // empty or 0 = no budget for it
    }
    db.budgets = budgets;
    save();
    render();
    enter();
    toast('Presupuestos guardados');
  }, { preview: () => 'Deja vacío lo que no quieras limitar. Se reinician cada mes.' });
}

// Lines for the confirmation after an expense: how its category's budget is going this month
function budgetLines(e) {
  const key = budgetKey(e.category), budget = db.budgets[key];
  if (!budget || !isSpending(e)) return [];
  const { pct, left, level } = budgetStatus(monthSpent(key), budget);
  if (level === 'over') return [{ icon: 'triangle-alert', text: `Te pasaste del presupuesto de ${key} por ${money(-left)}` }];
  if (level === 'warn') return [{ icon: 'triangle-alert', text: `Ya usaste el ${pct}% de tu presupuesto de ${key}` }];
  return [`${key}: te quedan ${money(left)} de tu presupuesto del mes`];
}

function addToGoal(goal) {
  const { left } = goalPlan(goal);
  openSheet(`Abonar a ${goal.name}`, [{ name: 'amount', label: `¿Cuánto ahorraste? Te faltan ${money(left)}`, money: true }], v => {
    const amount = parseAmount(v.amount);
    if (!amount) return 'Escribe cuánto ahorraste';
    if (amount > left) return `Solo te faltan ${money(left)}`;
    const mark = goalMilestone(goal.saved, goal.saved + amount, goal.amount);
    goal.saved += amount;
    save();
    render();
    pop(byV(goal.id));
    const plan = goalPlan(goal);
    if (plan.done) {
      celebrate('¡Meta cumplida!', `${goal.name} · ${money(goal.amount)}`);
      confetti();
    }
    else {
      toast(`${mark ? MILESTONES[mark] : 'Ahorro agregado'}${plan.overdue ? '' : ` · ahora ${money(plan.daily)} al día`}`);
      if (mark) goalMilestoneFx(goal);
    }
  });
}

function editCard(card, type) {
  const credit = type === 'credito', used = card && credit ? cardUsed(card, db.expenses) : 0;
  openSheet(card ? 'Editar tarjeta' : `Nueva tarjeta de ${METHODS[type].label.toLowerCase()}`, [
    { name: 'name', label: 'Identificador', value: card?.name, placeholder: 'ej. BBVA 1234' },
    ...(credit ? [
      { name: 'limit', label: 'Límite de crédito', value: card?.limit ? card.limit / 100 : '', money: true },
      { name: 'used', label: 'Saldo en uso hoy', value: used ? used / 100 : '', money: true },
    ] : []),
  ], v => {
    const name = v.name.trim(), limit = parseMoney(v.limit), newUsed = parseMoney(v.used);
    if (!name) return 'Escribe un identificador';
    if (limit === null || newUsed === null) return 'Revisa los montos';
    if (credit && limit && newUsed > limit) return 'El saldo en uso no puede ser mayor al límite';
    const c = card ?? { id: uid(), type, name };
    c.name = name;
    if (credit) {
      c.limit = limit;
      if (!card || newUsed !== used) Object.assign(c, { startUsed: newUsed, since: Date.now() }); // typed balance becomes the new starting point
    }
    if (!card) db.cards.push(c);
    save();
    render();
    pop(byV(c.id));
    toast(card ? 'Tarjeta actualizada' : 'Tarjeta agregada');
    if (!card && cardsOf(type).length === 1) sparkleOn(byV(c.id)); // first card of its kind
  });
}

function editDebt(debt) {
  const left = debt ? debtLeft(debt, db.expenses) : 0;
  openSheet(debt ? 'Editar deuda' : 'Nueva deuda', [
    { name: 'name', label: 'Nombre', value: debt?.name, placeholder: 'ej. Préstamo de Juan' },
    { name: 'owed', label: '¿Cuánto debes hoy?', value: debt ? left / 100 : '', money: true },
  ], v => {
    const name = v.name.trim(), owed = parseMoney(v.owed);
    if (!name) return 'Escribe el nombre de la deuda';
    if (owed === null) return 'Revisa el monto';
    const d = debt ?? { id: uid(), name, total: 0 };
    d.name = name;
    if (!debt || owed !== left) Object.assign(d, { total: owed, since: Date.now() }); // typed balance becomes the new starting point
    if (!debt) db.debts.push(d);
    save();
    render();
    pop(byV(d.id));
    toast(debt ? 'Deuda actualizada' : 'Deuda agregada');
  });
}

// ---------- Views ----------

function render() {
  document.querySelector('.toast.error')?.remove(); // the error was about the previous screen
  $nav.hidden = !db;
  if (!db) return void ($app.innerHTML = viewSetup());
  for (const b of $nav.children) b.classList.toggle('active', b.dataset.v === tab);
  $app.innerHTML = { registrar: viewRegistrar, historial: viewHistorial, estadisticas: viewEstadisticas, ahorros: viewAhorros, perfil: viewPerfil }[tab]();
  requestAnimationFrame(countUp); // next frame, once a confirmation shown right after this render exists
}

function viewSetup() {
  const section = type => `
    <h2>${icon(METHODS[type].icon)} Tarjetas de ${METHODS[type].label.toLowerCase()}</h2>
    <div class="counter">¿Cuántas tienes?
      <span class="stepper">
        <button data-act="setup-count" data-type="${type}" data-d="-1" aria-label="Quitar tarjeta">−</button>
        <b>${setup[type].length}</b>
        <button data-act="setup-count" data-type="${type}" data-d="1" aria-label="Agregar tarjeta">+</button>
      </span>
    </div>
    ${setup[type].map((card, i) => {
      const field = (f, attrs) => `<input class="field" data-input="setup-card" data-type="${type}" data-i="${i}" data-f="${f}" value="${esc(card[f])}" ${attrs}>`;
      return `
        <div class="setup-card" data-type="${type}">
          ${field('name', `placeholder="Tarjeta ${i + 1} (ej. BBVA 1234)"`)}
          ${type === 'credito' ? `<div class="two">${field('limit', 'inputmode="decimal" placeholder="Límite $"')}${field('used', 'inputmode="decimal" placeholder="En uso $"')}</div>` : ''}
        </div>`;
    }).join('')}`;
  return `
    <div class="welcome"><span class="avatar">${icon('wallet')}</span><h1>Bienvenido</h1><p class="muted">Configura tu app en un minuto.</p></div>
    <h2>${icon('user')} Tu nombre</h2>
    <input class="field" data-input="setup-name" value="${esc(setup.name)}" placeholder="¿Cómo te llamas?" autocomplete="given-name">
    ${section('debito')}
    ${section('credito')}
    <button class="primary" data-act="setup-done">Comenzar</button>`;
}

function viewRegistrar() {
  if (!draft) return viewHome();
  return `
    <div class="wizard-head">
      <button class="icon-btn" data-act="back" aria-label="${draft.step ? 'Atrás' : 'Cancelar'}">${icon(draft.step ? 'chevron-left' : 'x')}</button>
      <div class="progress">${[0, 1, 2].map(i => `<i class="${i <= draft.step ? 'on' : ''}"></i>`).join('')}</div>
      ${draft.editId ? `<button class="icon-btn danger" data-act="del-expense" aria-label="Eliminar gasto">${icon('trash-2')}</button>` : ''}
    </div>
    <div class="step">${[stepAmount, stepCategory, stepMethod][draft.step]()}</div>
    <button class="primary" data-act="next">${draft.step < 2 ? 'Siguiente' : draft.editId ? 'Guardar cambios' : 'Guardar gasto'}</button>`;
}

function viewHome() {
  const { income, out, left } = monthBalance();
  const owedOnCards = cardsOf('credito').reduce((total, c) => total + cardUsed(c, db.expenses), 0);
  const budgets = BUDGET_KEYS.filter(k => db.budgets[k]);
  const budgetRow = k => {
    const spentK = monthSpent(k), { pct, left, level } = budgetStatus(spentK, db.budgets[k]);
    const state = level === 'over' ? `${icon('triangle-alert')} Te pasaste por ${money(-left)}` : level === 'warn' ? `${icon('triangle-alert')} Llevas ${pct}% · te quedan ${money(left)}` : `Te quedan ${money(left)}`;
    return `
      <div class="budget ${level}" data-k="${k}">
        <p class="bar-label"><span>${icon(catOf(k === 'Otros' ? '' : k).icon)} ${k}</span><small>${money(spentK)} de ${money(db.budgets[k])}</small></p>
        ${meter(spentK, db.budgets[k])}
        <small class="budget-state">${state}</small>
      </div>`;
  };
  return `
    <p class="muted date">${fmtDate(Date.now(), { weekday: 'long', day: 'numeric', month: 'long' })}</p>
    <h1>Hola, ${esc(db.name)}</h1>
    <button class="hero" data-act="new">
      <span class="plus">${icon('plus')}</span>
      <b>Registrar gasto</b>
      <small>Toca aquí para anotar lo que gastaste</small>
    </button>
    <button class="income-btn" data-act="add-income">${icon('coins')} Registrar ingreso</button>
    <h2>${fmtDate(Date.now(), { month: 'long' })}</h2>
    <div class="panel month">
      <div><small>Ingresos</small><b data-count="income" data-value="${income}">${money(income)}</b></div>
      <div><small>Salidas</small><b data-count="out" data-value="${out}">${money(out)}</b></div>
      ${income ? `<div><small>${left < 0 ? 'Te pasaste por' : 'Te quedan'}</small><b class="${left < 0 ? 'warn' : ''}" data-count="left" data-value="${Math.abs(left)}">${money(Math.abs(left))}</b></div>` : ''}
    </div>
    <p class="note">${income ? 'Salidas: lo que pagaste en efectivo o débito, incluido el pago de tus tarjetas. Las compras con crédito se descuentan cuando pagas la tarjeta.'
      : 'Registra tus ingresos para ver cuánto te queda en el mes.'}</p>
    ${owedOnCards ? `<p class="note">${icon('credit-card')} En tus tarjetas de crédito debes <b>${money(owedOnCards)}</b>; se descontará de tus ingresos cuando las pagues.</p>` : ''}
    <h2 class="head-row">Presupuestos<button class="link" data-act="edit-budgets">${budgets.length ? 'Editar' : 'Definir'}</button></h2>
    ${budgets.length ? `<div class="panel">${budgets.map(budgetRow).join('')}</div>`
      : '<p class="note">Define cuánto quieres gastar al mes en cada categoría y te aviso cuando te acerques al límite.</p>'}`;
}

// `flag`: optional HTML under the label (budget warning)
const choice = (act, value, label, iconName, color, selected, cls = '', sub = '', flag = '') =>
  `<button class="choice ${cls} ${selected ? 'sel' : ''}" style="--c:${color}" data-act="${act}" data-v="${esc(value)}"><span class="ico">${icon(iconName)}</span><span>${esc(label)}${sub ? `<small>${esc(sub)}</small>` : ''}${flag}</span></button>`;

// Warning on a category tile while registering: already over its monthly budget, or over/near it with this amount.
function budgetFlag(key) {
  const budget = db.budgets[key];
  if (!budget || draft.date.slice(0, 7) !== today().slice(0, 7)) return ''; // budgets are for this month
  const spent = monthSpent(key, balanceExpenses()); // an edited expense isn't counted twice
  // Paying a credit card doesn't count as spending, so a Deuda amount only counts once it's known to be another debt
  const amount = key !== 'Deuda' || draft.debtKind === 'debt' ? parseAmount(draft.amountText) ?? 0 : 0;
  const now = budgetStatus(spent, budget), after = budgetStatus(spent + amount, budget);
  const flag = (level, text) => `<span class="tile-flag ${level}">${icon('triangle-alert')}${text}</span>`;
  if (now.level === 'over') return flag('over', `Ya te pasaste por ${money(-now.left)}`);
  if (after.level === 'over') return flag('over', `Con este gasto te pasas por ${money(-after.left)}`);
  if (after.level === 'warn') return flag('warn', `Quedarían ${money(after.left)} (${after.pct}%)`);
  return '';
}

function stepAmount() {
  return `
    <h1>${draft.editId ? 'Editar gasto' : '¿Cuánto gastaste?'}</h1>
    <label class="amount"><span>$</span><input data-input="amount" inputmode="decimal" placeholder="0" value="${esc(draft.amountText)}" aria-label="Cantidad"></label>
    <p class="muted center">Escribe la cantidad en pesos</p>
    <label class="date-pick">${icon('calendar')} Fecha<input type="date" data-input="date" value="${draft.date}" max="${today()}"></label>`;
}

function stepCategory() {
  return `
    <h1>¿En qué?</h1>
    <div class="choices">
      ${Object.entries(CATEGORIES).map(([name, m]) => choice('cat', name, name, m.icon, `var(--cat-${m.c})`, !draft.custom && draft.category === name, '', '', budgetFlag(name))).join('')}
      ${choice('cat', '', 'Otro', OTHER.icon, `var(--cat-${OTHER.c})`, draft.custom, 'wide', '', budgetFlag('Otros'))}
    </div>
    ${draft.custom ? `<input class="field" style="--c:var(--cat-${OTHER.c})" data-input="cat-other" value="${esc(draft.category)}" placeholder="¿Qué fue? (ej. Regalo)">` : ''}
    ${hasDetail() ? `
      <input class="field" style="--c:var(--cat-${CATEGORIES[draft.category].c})" data-input="detail" value="${esc(draft.detail)}" placeholder="${CATEGORIES[draft.category].detail}">
      <p class="note">Opcional. Si lo dejas vacío se guarda como «General».</p>` : ''}
    ${isDebt() ? viewDebtPicker() : ''}`;
}

const hasDetail = () => !draft.custom && !!CATEGORIES[draft.category]?.detail;
const isDebt = () => !draft.custom && draft.category === 'Deuda';
const payingCard = () => isDebt() && draft.debtKind === 'card'; // credit cards can only be paid from a debit card
const NO_DEBT = { debtKind: null, debtId: null, newDebtName: '', newDebtTotal: '' };

function viewDebtPicker() {
  const cards = cardsOf('credito');
  const debts = db.debts.filter(d => debtLeft(d, balanceExpenses()) > 0);
  const cardList = cards.length
    ? `<div class="bank-cards">${cards.map(c => {
      const owed = owedOnCard(c);
      return cardButton(c, 'debt', draft.debtId === c.id, owed ? `Debes ${money(owed)}` : 'Sin deuda', !owed);
    }).join('')}</div>
    ${cards.some(owedOnCard) ? '' : '<p class="note">Ninguna de tus tarjetas de crédito tiene deuda por pagar.</p>'}`
    : '<p class="note">No tienes tarjetas de crédito. Agrégalas en Perfil.</p>';
  const debtList = `
    <div class="choices">
      ${debts.map(d => choice('debt', d.id, d.name, 'file-text', 'var(--cat-4)', draft.debtId === d.id, '', `Debes ${money(debtLeft(d, balanceExpenses()))}`)).join('')}
      ${choice('debt', 'new', 'Nueva deuda', 'plus', 'var(--cat-4)', draft.debtId === 'new', 'wide')}
    </div>
    ${draft.debtId === 'new' ? `
      <input class="field" data-input="debt-name" value="${esc(draft.newDebtName)}" placeholder="Nombre (ej. Préstamo de Juan)">
      <input class="field" data-input="debt-total" inputmode="decimal" value="${esc(draft.newDebtTotal)}" placeholder="¿Cuánto debes en total? $">` : ''}`;
  return `
    <div class="debt-picker">
      <h2>¿Qué deuda pagas?</h2>
      ${segmented('debt-kind', 'kind', { card: `${icon('credit-card')} Tarjeta de crédito`, debt: `${icon('file-text')} Otra deuda` }, draft.debtKind)}
      ${draft.debtKind === 'card' ? cardList : draft.debtKind === 'debt' ? debtList : ''}
      <p class="note debt-note">${debtNote()}</p>
    </div>`;
}

// What the selected card/debt owes before this payment, or null if nothing (valid) is selected yet.
function debtOwed() {
  if (!isDebt() || !draft.debtId) return null;
  if (draft.debtId === 'new') return parseAmount(draft.newDebtTotal);
  const card = db.cards.find(c => c.id === draft.debtId);
  if (card) return owedOnCard(card);
  const debt = db.debts.find(d => d.id === draft.debtId);
  return debt ? debtLeft(debt, balanceExpenses()) : null;
}

// Abono vs. liquidar: the amount typed in step 1 decides; "Liquidar todo" sets it to the full balance.
// Paying more than what's owed isn't allowed (next() blocks it), so the note offers to fix the amount.
function debtNote() {
  const owed = debtOwed(), pay = parseAmount(draft.amountText);
  if (owed === null) return '';
  if (owed === 0) return '<span class="warn">No hay deuda por pagar</span>';
  if (pay === owed) return `${icon('check')} Con este pago liquidas la deuda`;
  const liquidar = `<button class="link" data-act="liquidar">Liquidar todo (${money(owed)})</button>`;
  if (pay > owed) return `<span class="warn">${icon('triangle-alert')} Pagas ${money(pay - owed)} de más; lo máximo es ${money(owed)}.</span>${liquidar}`;
  return `Abono de ${money(pay)} · te quedarán ${money(owed - pay)}${liquidar}`;
}

function stepMethod() {
  const cards = cardsOf(draft.method);
  const cardList = cards.length
    ? `<div class="bank-cards">${cards.map(c => cardButton(c, 'card', draft.cardId === c.id, undefined, false, nearLimit(c) ? 'near' : '')).join('')}</div>`
    : `<p class="note">No tienes tarjetas de ${METHODS[draft.method]?.label.toLowerCase()}. Agrégalas en Perfil.</p>`;
  const over = overLimit();
  const selected = db.cards.find(c => c.id === draft.cardId);
  const methods = payingCard() ? { debito: METHODS.debito } : METHODS;
  return `
    <h1>¿Cómo pagaste?</h1>
    ${payingCard() ? '<p class="note">Las tarjetas de crédito solo se pagan con una tarjeta de débito.</p>' : `
      <div class="choices three">${Object.entries(methods).map(([k, m]) => choice('method', k, m.label, m.icon, m.color, draft.method === k)).join('')}</div>`}
    ${draft.method && draft.method !== 'efectivo' ? `<h2>Elige la tarjeta</h2>${cardList}` : ''}
    ${over > 0 ? `<p class="note warn">${icon('triangle-alert')} Este gasto supera tu disponible por ${money(over)}</p>` : ''}
    ${selected && nearLimit(selected) ? `<p class="note near-note">${icon('triangle-alert')} Con este gasto usarías el ${Math.round(usageAfter(selected) * 100)}% de tu límite de ${esc(selected.name)}</p>` : ''}`;
}

// Share of a credit card's limit in use if this expense is paid with it (0 if it has no limit)
const usageAfter = c => c.type === 'credito' && c.limit ? (cardUsed(c, balanceExpenses()) + (parseAmount(draft.amountText) ?? 0)) / c.limit : 0;
// 90% or more, but still within the limit (going over has its own red warning and is blocked)
const nearLimit = c => usageAfter(c) >= .9 && usageAfter(c) <= 1;

// How much this expense goes over the selected credit card's available credit (≤ 0 if it fits).
function overLimit() {
  const card = db.cards.find(c => c.id === draft.cardId);
  return card?.type === 'credito' && card.limit ? parseAmount(draft.amountText) - available(card) : 0;
}

const segmented = (act, key, opts, current) => `<div class="segmented">${Object.entries(opts).map(([k, label]) =>
  `<button class="${current === k ? 'sel' : ''}" data-act="${act}" data-k="${key}" data-v="${k}">${label}</button>`).join('')}</div>`;

function viewFilters() {
  return `
    <div class="filters">
      ${segmented('filter', 'period', { dia: 'Día', semana: 'Semana', mes: 'Mes' }, filter.period)}
      <div class="period-nav">
        <button data-act="shift" data-d="-1" aria-label="Periodo anterior">${icon('chevron-left')}</button>
        <span>${periodLabel()}</span>
        <button data-act="shift" data-d="1" aria-label="Periodo siguiente" ${filter.offset >= 0 ? 'disabled' : ''}>${icon('chevron-right')}</button>
      </div>
      ${segmented('filter', 'method', { todos: 'Todos', efectivo: 'Efectivo', debito: 'Débito', credito: 'Crédito' }, filter.method)}
    </div>`;
}

const summary = list => `
  <div class="summary">
    <div><small>Total</small><b>${money(sum(list))}</b></div>
    <div><small>Gastos</small><b>${list.length}</b></div>
  </div>`;
const emptyState = `<p class="empty">${icon('receipt')}Sin gastos en este periodo</p>`;

function viewHistorial() {
  const expenses = filterExpenses(db.expenses, filter);
  // Incomes have no payment method, so they only show with "Todos"
  const incomes = filter.method === 'todos' ? filterExpenses(db.incomes, filter).map(i => ({ ...i, income: true })) : [];
  const items = [...expenses, ...incomes].sort((a, b) => b.date - a.date);
  const row = e => e.income ? `
    <button class="tx" data-act="edit-income" data-v="${esc(e.id)}">
      <span class="ico" style="--c:var(--ok)">${icon('coins')}</span>
      <span class="tx-main"><b>${esc(e.source)}</b><small class="tx-meta"><span class="pay-tag income">${icon('coins')}Ingreso</span>${time(e.date)}</small></span>
      <span class="tx-amount">+${money(e.amount)}</span>
    </button>` : `
    <button class="tx" data-act="edit-expense" data-v="${esc(e.id)}">
      <span class="ico" style="--c:var(--cat-${catOf(e.category).c})">${icon(catOf(e.category).icon)}</span>
      <span class="tx-main"><b>${esc(catLabel(e))}</b><small class="tx-meta">${payTag(e)}${time(e.date)}${isSpending(e) ? '' : ' · no suma al gasto'}</small></span>
      <span class="tx-amount ${isSpending(e) ? '' : 'muted'}">${money(e.amount)}</span>
    </button>`;
  const days = [...Map.groupBy(items, e => new Date(e.date).toDateString()).values()];
  return `
    <h1>Historial</h1>
    ${viewFilters()}
    ${summary(expenses.filter(isSpending))}
    ${items.length ? days.map(g => `<h2>${dayLabel(g[0].date)}</h2><div class="tx-list">${g.map(row).join('')}</div>`).join('')
      + '<p class="note center">Toca un movimiento para editarlo o eliminarlo</p>' : emptyState}`;
}

// Income vs. spending of the period, as two bars on the same scale
function viewBalance(income, out) {
  const max = Math.max(income, out), diff = income - out;
  const bar = (label, cents, cls = '') => `
    <div class="bar-row">
      <p class="bar-label"><span>${label}</span><small>${money(cents)}</small></p>
      <div class="bar"><i class="${cls}" style="width:${cents / max * 100}%"></i></div>
    </div>`;
  return `
    <h2>Ingresos y salidas</h2>
    <div class="panel">
      ${bar(`${icon('coins')} Ingresos`, income, 'income-bar')}${bar(`${icon('receipt')} Salidas`, out)}
      <p class="note">${diff >= 0 ? `Te quedaron ${money(diff)}: el ${Math.round(diff / income * 100)}% de lo que ingresó`
        : `<span class="warn">Salieron ${money(-diff)} más de lo que ingresó</span>`}
        Las compras con crédito cuentan hasta que pagas la tarjeta.</p>
    </div>`;
}

function viewEstadisticas() {
  const list = filterExpenses(db.expenses, filter).filter(isSpending); // card payments would count the purchases twice
  const total = sum(list);
  const income = filter.method === 'todos' ? sum(filterExpenses(db.incomes, filter)) : 0;
  const pct = cents => `${Math.round(cents / total * 100)}%`;
  const top = list.reduce((max, e) => e.amount > max.amount ? e : max, list[0]);
  const legend = ([name, cents]) => `
    <div class="legend-row" style="--c:var(--cat-${catOf(name).c})">
      <span class="dot"></span><span class="name">${icon(catOf(name).icon)} ${esc(name)}</span><b>${money(cents)}</b><small>${pct(cents)}</small>
    </div>`;
  const bar = ([label, cents]) => `
    <div class="bar-row">
      <p class="bar-label"><span>${esc(label)}</span><small>${money(cents)} · ${pct(cents)}</small></p>
      <div class="bar"><i style="width:${cents / total * 100}%"></i></div>
    </div>`;
  return `
    <h1>Estadísticas</h1>
    ${viewFilters()}
    ${summary(list)}
    ${income ? viewBalance(income, sum(filterExpenses(db.expenses, filter).filter(isCashOut))) : ''}
    ${list.length ? `
      <div class="kpis">
        <div><small>Promedio por gasto</small><b>${money(Math.round(total / list.length))}</b></div>
        <div><small>Más alto · ${esc(top.category)}</small><b>${money(top.amount)}</b></div>
      </div>
      <h2>Gasto en el tiempo</h2>
      <div class="panel">${viewColumns(list)}</div>
      <h2>Por categoría</h2>
      <div class="panel">${viewDonut(list, total)}${totalsBy(list, e => e.category).map(legend).join('')}</div>
      <h2>Por forma de pago</h2>
      <div class="panel">${totalsBy(list, payLabel).map(bar).join('')}</div>` : emptyState}`;
}

// Column per hour (día) or per day (semana/mes); tapping a column shows its value in the caption.
function viewColumns(list) {
  const bins = timeBins(list, filter.period, filter.offset);
  const [from] = periodRange(filter.period, filter.offset);
  const max = Math.max(...bins);
  const dayOf = i => new Date(from.getFullYear(), from.getMonth(), from.getDate() + i);
  const name = i => filter.period === 'dia' ? `${i}:00 – ${i}:59` : fmtDate(dayOf(i), { weekday: 'long', day: 'numeric', month: 'long' });
  const tick = i => filter.period === 'dia' ? (i % 6 ? '' : `${i}h`)
    : filter.period === 'semana' ? dayOf(i).toLocaleDateString('es-MX', { weekday: 'narrow' })
    : (i === 0 || (i + 1) % 5 === 0 ? i + 1 : '');
  return `
    <p class="cols-caption">Más alto: ${name(bins.indexOf(max))} · ${money(max)}</p>
    <div class="cols">${bins.map((cents, i) => `<button data-act="col" aria-label="${name(i)}: ${money(cents)}"><i style="height:${cents / max * 100}%"></i></button>`).join('')}</div>
    <div class="ticks" aria-hidden="true">${bins.map((_, i) => `<span>${tick(i)}</span>`).join('')}</div>`;
}

// Segments in fixed slot order so neighbouring colors (last→first too) are always a validated pair.
function viewDonut(list, total) {
  const r = 42, C = 2 * Math.PI * r;
  const slots = totalsBy(list, e => catOf(e.category).c).sort((a, b) => a[0] - b[0]);
  const gap = slots.length > 1 ? 1.5 : 0;
  let start = 0;
  const arcs = slots.map(([c, cents]) => {
    const len = cents / total * C;
    const arc = `<circle cx="50" cy="50" r="${r}" style="stroke: var(--cat-${c})" stroke-dasharray="${Math.max(len - gap, .5)} ${C}" stroke-dashoffset="${-start}"/>`;
    start += len;
    return arc;
  });
  return `
    <div class="donut" role="img" aria-label="Reparto del gasto por categoría">
      <svg viewBox="0 0 100 100">${arcs.join('')}</svg>
      <div><small>Total</small><b>${money(total)}</b></div>
    </div>`;
}

function viewAhorros() {
  const plans = db.goals.map(g => ({ g, ...goalPlan(g) }))
    .sort((a, b) => a.done - b.done || a.g.date.localeCompare(b.g.date)); // closest date first, finished last
  const active = plans.filter(p => !p.done && !p.overdue);
  const totalDaily = active.reduce((total, p) => total + p.daily, 0);
  const status = ({ left, days, daily, done, overdue }) =>
    done ? `${icon('party-popper')} ¡Meta cumplida!`
    : overdue ? `<span class="warn">La fecha ya pasó · te faltan ${money(left)}</span>`
    : `<b>${money(daily)}</b> al día · ${days === 0 ? 'hoy es la fecha' : `faltan ${daysText(days)}`}`;
  const card = p => `
    <div class="goal">
      <button class="goal-main" data-act="edit-goal" data-v="${esc(p.g.id)}">
        <span class="goal-head">
          <span class="ico" style="--c:var(--accent)">${icon(p.done ? 'trophy' : 'target')}</span>
          <span><b>${esc(p.g.name)}</b><small>Meta ${money(p.g.amount)} · ${fmtDate(localDate(p.g.date), { day: 'numeric', month: 'short', year: 'numeric' })}</small></span>
        </span>
        <span class="goal-daily">${status(p)}</span>
        ${meter(p.g.saved, p.g.amount)}
        <small>Llevas ${money(p.g.saved)} de ${money(p.g.amount)} (${Math.floor(p.g.saved / p.g.amount * 100)}%)</small>
      </button>
      <div class="goal-actions">
        ${p.done ? '' : `<button class="link" data-act="save-goal" data-v="${esc(p.g.id)}">+ Abonar</button>`}
        <button class="icon-btn danger" data-act="del-goal" data-v="${esc(p.g.id)}" aria-label="Eliminar ${esc(p.g.name)}">${icon('x')}</button>
      </div>
    </div>`;
  return `
    <h1>Ahorros y metas</h1>
    ${active.length ? `
      <div class="summary">
        <div><small>${active.length > 1 ? `Para cumplir tus ${active.length} metas` : 'Para cumplir tu meta'} ahorra</small><b>${money(totalDaily)} al día</b></div>
      </div>` : ''}
    ${plans.length ? `<h2>Tus metas</h2>${plans.map(card).join('')}` : `<p class="empty">${icon('target')}Aún no tienes metas de ahorro</p>`}
    <button class="primary" data-act="add-goal">+ Nueva meta</button>
    ${plans.length ? '<p class="note center">Toca una meta para editarla</p>' : ''}`;
}

function viewPerfil() {
  const cards = type => cardsOf(type).map(c => {
    const used = cardUsed(c, db.expenses);
    return `
      <div class="card-wrap">
        ${cardButton(c, 'edit-card', false)}
        <button class="card-del" data-act="del-card" data-v="${esc(c.id)}" aria-label="Eliminar ${esc(c.name)}">${icon('x')}</button>
        ${type === 'credito' && c.limit ? `<p class="card-meta">Usado ${money(used)} de ${money(c.limit)}${meter(used, c.limit)}</p>` : ''}
      </div>`;
  }).join('');
  const debtRow = d => {
    const left = debtLeft(d, db.expenses);
    return `
      <div class="debt-row">
        <button class="debt-main" data-act="edit-debt" data-v="${esc(d.id)}">
          <span><b>${esc(d.name)}</b><small>${left ? `Debes ${money(left)} de ${money(d.total)}` : 'Liquidada ✓'}</small></span>
          ${meter(d.total - left, d.total)}
        </button>
        <button class="icon-btn danger" data-act="del-debt" data-v="${esc(d.id)}" aria-label="Eliminar ${esc(d.name)}">${icon('x')}</button>
      </div>`;
  };
  const count = db.expenses.length === 1 ? '1 gasto guardado' : `${db.expenses.length} gastos guardados`;
  return `
    <div class="profile">
      <span class="avatar">${esc(([...db.name][0] ?? '?').toUpperCase())}</span>
      <input class="name-input" data-change="name" value="${esc(db.name)}" aria-label="Tu nombre">
      <small class="muted">Toca tu nombre para editarlo</small>
    </div>
    ${['debito', 'credito'].map(t => `
      <h2>${icon(METHODS[t].icon)} Tarjetas de ${METHODS[t].label.toLowerCase()}</h2>
      <div class="bank-cards">${cards(t)}<button class="add-card" data-act="add-card" data-v="${t}">+ Agregar</button></div>`).join('')}
    <p class="note">Toca una tarjeta para editar su nombre, límite y saldo en uso.</p>
    <h2>${icon('file-text')} Otras deudas</h2>
    <div class="debt-list">${db.debts.map(debtRow).join('')}<button class="add-debt" data-act="add-debt">+ Agregar deuda</button></div>
    <h2>${icon('palette')} Tema</h2>
    <div class="themes">${Object.entries(THEMES).map(([k, t]) => `
      <button class="theme ${theme.color === k ? 'sel' : ''}" data-act="theme" data-k="color" data-v="${k}"><span style="background:${t.swatch ?? t.brand}"></span>${t.name}</button>`).join('')}</div>
    ${currentTheme().style ? '<p class="note">Este tema siempre es claro.</p>' : segmented('theme', 'scheme', SCHEMES, theme.scheme)}
    <h2>${icon('save')} Respaldo</h2>
    <div class="tiles">
      <button class="tile" data-act="export">${icon('upload')}Exportar</button>
      <label class="tile">${icon('download')}Restaurar<input type="file" accept=".json,application/json" data-change="import" hidden></label>
    </div>
    <p class="note">${count} en este iPhone. Si borras la app se borran los datos, así que exporta un respaldo seguido.</p>`;
}

// ---------- Actions ----------

function exportBackup() {
  const name = `gastos-${new Date().toLocaleDateString('en-CA')}.json`; // local YYYY-MM-DD
  const file = new File([JSON.stringify(db)], name, { type: 'application/json' });
  // iOS share sheet: save to Files/iCloud Drive or send it anywhere
  if (navigator.canShare?.({ files: [file] })) {
    return navigator.share({ files: [file] })
      .then(() => toast('Respaldo exportado'))
      .catch(err => err.name !== 'AbortError' && toast('No se pudo exportar el respaldo', 'error'));
  }
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(file), download: name });
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  toast('Respaldo descargado');
}

const byV = v => $app.querySelector(`[data-v="${CSS.escape(v)}"]`);

// Leave the wizard; an edit goes back to the tab it was opened from
function closeDraft() {
  if (draft?.returnTab) tab = draft.returnTab;
  draft = null;
}

const actions = {
  tab: ({ v }) => {
    if (v === tab) return scrollTo({ top: 0, behavior: 'smooth' });
    tab = v;
    render();
    scrollTo(0, 0);
    enter();
    pop($nav.querySelector('.active svg'));
  },
  'setup-count': ({ type, d }) => {
    if (+d > 0 && setup[type].length < 10) setup[type].push({ name: '', limit: '', used: '' });
    if (+d < 0) setup[type].pop();
    render();
    if (+d > 0) enter([...$app.querySelectorAll(`.setup-card[data-type=${type}]`)].slice(-1));
  },
  'setup-done': () => {
    if (!setup.name.trim()) return showError('Escribe tu nombre');
    if ([...setup.debito, ...setup.credito].some(c => !c.name.trim())) return showError('Ponle un identificador a cada tarjeta');
    if (setup.credito.some(c => parseMoney(c.limit) === null || parseMoney(c.used) === null)) return showError('Revisa el límite y el saldo en uso');
    if (setup.credito.some(c => parseMoney(c.limit) && parseMoney(c.used) > parseMoney(c.limit))) return showError('El saldo en uso no puede ser mayor al límite');
    const cards = type => setup[type].map(c => ({
      id: uid(), type, name: c.name.trim(),
      ...(type === 'credito' && { limit: parseMoney(c.limit), startUsed: parseMoney(c.used) }),
    }));
    db = { name: setup.name.trim(), cards: [...cards('debito'), ...cards('credito')], debts: [], goals: [], incomes: [], budgets: {}, expenses: [] };
    save();
    render();
    enter();
    toast(`¡Listo, ${db.name}!`);
  },
  new: () => {
    draft = { step: 0, amountText: '', category: '', detail: '', custom: false, method: null, cardId: null, date: today(), ...NO_DEBT };
    render();
    enter([...$app.querySelectorAll('.step > *')], 40);
    $app.querySelector('input').focus(); // same tap, so iOS opens the keyboard
  },
  // Same wizard, prefilled; saving replaces the expense
  'edit-expense': ({ v }) => {
    const e = db.expenses.find(x => x.id === v);
    draft = {
      step: 0, amountText: String(e.amount / 100), category: e.category, custom: !CATEGORIES[e.category],
      // an empty detail was saved as "General", so it shows empty again
      detail: CATEGORIES[e.category]?.detail && e.detail !== 'General' ? e.detail ?? '' : '',
      method: e.method, cardId: e.cardId ?? null, date: dayKey(e.date), ...NO_DEBT,
      ...(e.debtId && { debtKind: e.toCard ? 'card' : 'debt', debtId: e.debtId }),
      editId: e.id, original: e, returnTab: tab,
    };
    tab = 'registrar';
    render();
    scrollTo(0, 0);
    enter([...$app.querySelectorAll('.step > *')], 40);
  },
  'del-expense': async () => {
    const e = draft.original;
    if (!confirm(`¿Eliminar ${catLabel(e)} de ${money(e.amount)}?`)) return;
    db.expenses = db.expenses.filter(x => x.id !== e.id);
    save();
    await trashFx($app.querySelector('.step')); // what's in the editor goes in the bin
    closeDraft();
    render();
    enter();
    toast('Gasto eliminado');
  },
  back: () => {
    if (draft.step) draft.step--;
    else closeDraft();
    render();
    enter(draft ? [...$app.querySelectorAll('.step > *')] : undefined, draft ? -40 : 0);
  },
  next: () => {
    if (draft.step === 0 && !parseAmount(draft.amountText)) return showError('Escribe una cantidad mayor a 0');
    if (draft.step === 0 && (!draft.date || draft.date > today())) return showError('Elige una fecha de hoy o antes');
    if (draft.step === 1 && !draft.category.trim()) return showError('Elige una categoría o escribe otra');
    if (draft.step === 1 && isDebt()) {
      if (!draft.debtKind) return showError('Elige si pagas una tarjeta de crédito u otra deuda');
      if (!draft.debtId) return showError(draft.debtKind === 'card' ? 'Elige la tarjeta que pagas' : 'Elige la deuda o crea una nueva');
      if (draft.debtId === 'new' && !draft.newDebtName.trim()) return showError('Escribe el nombre de la deuda');
      if (draft.debtId === 'new' && !parseAmount(draft.newDebtTotal)) return showError('Escribe cuánto debes en total');
      const owed = debtOwed();
      if (!owed) return showError('No hay deuda por pagar');
      if (parseAmount(draft.amountText) > owed) return showError(`No puedes pagar más de lo que debes (${money(owed)})`);
    }
    if (draft.step < 2) {
      draft.step++;
      if (draft.step === 2 && payingCard() && draft.method !== 'debito') {
        const debit = cardsOf('debito');
        Object.assign(draft, { method: 'debito', cardId: debit.length === 1 ? debit[0].id : null });
      }
      render();
      enter([...$app.querySelectorAll('.step > *')], 40);
      return animate($app.querySelectorAll('.progress i')[draft.step], [{ transform: 'scaleX(0)' }, { transform: 'none' }], { duration: 400 });
    }
    if (!draft.method) return showError('Elige cómo pagaste');
    const card = db.cards.find(c => c.id === draft.cardId);
    if (draft.method !== 'efectivo' && !card) return showError('Elige una tarjeta');
    if (payingCard() && card?.type !== 'debito') return showError('Las tarjetas de crédito solo se pagan con débito');
    if (overLimit() > 0) return showError(`Supera tu disponible de ${money(available(card))}. Si tu saldo cambió, actualízalo en Perfil`);
    let target = null; // card or debt being paid
    if (isDebt()) {
      target = draft.debtId === 'new'
        ? { id: uid(), name: draft.newDebtName.trim(), total: parseAmount(draft.newDebtTotal) }
        : db.cards.find(c => c.id === draft.debtId) ?? db.debts.find(d => d.id === draft.debtId);
      if (draft.debtId === 'new') db.debts.push(target);
    }
    const editing = !!draft.editId;
    const expense = {
      id: draft.editId ?? uid(), amount: parseAmount(draft.amountText), category: draft.category.trim(),
      ...(hasDetail() && { detail: draft.detail.trim() || 'General' }),
      ...(target && { detail: target.name, debtId: target.id, ...(target.type && { toCard: true }) }),
      method: draft.method, cardId: card?.id, cardName: card?.name, date: withDate(draft.date, draft.original?.date),
    };
    if (editing) db.expenses[db.expenses.findIndex(x => x.id === expense.id)] = expense;
    else db.expenses.push(expense);
    save();
    closeDraft();
    render();
    if (editing) enter();
    const lines = budgetLines(expense);
    if (card?.type === 'credito' && card.limit) lines.push(`Disponible en ${card.name}: ${money(available(card))}`);
    const left = target && (target.type ? cardUsed(target, db.expenses) : debtLeft(target, db.expenses));
    if (target) lines.push(left <= 0 ? { icon: 'party-popper', text: `¡Liquidaste ${target.name}!` } : `Te quedan ${money(left)} por pagar de ${target.name}`);
    const key = budgetKey(expense.category), budget = db.budgets[key];
    const overBudget = isSpending(expense) && budget && budgetStatus(monthSpent(key), budget).level === 'over';
    const paidCard = target?.type && left <= 0;
    // First expense of today: maybe a streak worth celebrating
    const firstToday = !editing && dayKey(expense.date) === today() && db.expenses.filter(e => dayKey(e.date) === today()).length === 1;
    const streak = firstToday ? streakDays(db.expenses) : 0;
    let after = celebrate(editing ? '¡Gasto actualizado!' : '¡Gasto registrado!', `${money(expense.amount)} · ${catLabel(expense)} · ${payLabel(expense)}`, lines,
      paidCard ? { art: paidCardArt(target), duration: 3400 } : undefined);
    if (target && left <= 0) confetti(); // debt paid off
    if (STREAK_MARKS.includes(streak)) after = after.then(() => streakFx(streak));
    after.then(() => overBudget && alertBudget(key)); // last, once Home is visible again
  },
  cat: ({ v }) => {
    if (!v && draft.custom) return $app.querySelector('[data-input=cat-other]').focus();
    // Whatever was typed or picked for another category doesn't apply
    if (v !== draft.category) Object.assign(draft, { detail: '', ...NO_DEBT });
    draft.custom = !v;
    draft.category = v;
    render();
    pop($app.querySelector('.choice.sel'));
    shake($app.querySelector('.choice.sel .tile-flag')); // picked a category that is over or near its budget
    enter([...$app.querySelectorAll('.choices ~ *')]);
    $app.querySelector('[data-input=cat-other]')?.focus(); // "Otro" needs text; the detail is optional, so no keyboard for it
    $app.querySelector('.debt-picker')?.scrollIntoView({ behavior: motion ? 'smooth' : 'auto', block: 'nearest' });
  },
  'debt-kind': ({ v }) => {
    const cards = cardsOf('credito').filter(c => owedOnCard(c) > 0); // only cards with something to pay
    draft.debtKind = v;
    draft.debtId = v === 'card' && cards.length === 1 ? cards[0].id : null;
    render();
    pop($app.querySelector('.debt-picker .segmented .sel'));
    enter([...$app.querySelectorAll('.debt-picker .segmented ~ *')]);
  },
  debt: ({ v }) => {
    draft.debtId = v;
    render();
    pop($app.querySelector('.debt-picker .bank-card.sel, .debt-picker .choice.sel'));
    if (v !== 'new') return;
    const fields = [...$app.querySelectorAll('[data-input^="debt-"]')];
    enter(fields);
    fields[0].focus();
  },
  liquidar: () => {
    const owed = debtOwed();
    draft.amountText = String(owed / 100);
    render();
    toast(`Pago ajustado a ${money(owed)}`);
  },
  method: ({ v }) => {
    const cards = cardsOf(v);
    draft.method = v;
    draft.cardId = cards.length === 1 ? cards[0].id : null;
    render();
    pop($app.querySelector('.choice.sel'));
    enter([...$app.querySelectorAll('.step h2, .bank-card, .step .note')]);
    blink($app.querySelector('.bank-card.sel.near small')); // its only card is close to the limit
  },
  card: ({ v }) => {
    draft.cardId = v;
    render();
    pop($app.querySelector('.bank-card.sel'));
    blink($app.querySelector('.bank-card.sel.near small'));
  },
  filter: ({ k, v }) => {
    filter[k] = v;
    if (k === 'period') filter.offset = 0;
    render();
    pop($app.querySelector(`[data-k=${k}].sel`));
    enter([...$app.querySelectorAll('.filters ~ *')]);
  },
  shift: ({ d }) => {
    filter.offset += +d;
    render();
    enter([...$app.querySelectorAll('.period-nav span, .filters ~ *')], 40 * d);
  },
  'add-income': () => editIncome(null),
  'edit-income': ({ v }) => editIncome(db.incomes.find(i => i.id === v)),
  'edit-budgets': () => editBudgets(),
  'add-card': ({ v }) => editCard(null, v),
  'edit-card': ({ v }) => { const card = db.cards.find(c => c.id === v); editCard(card, card.type); },
  'add-goal': () => editGoal(null),
  'edit-goal': ({ v }) => editGoal(db.goals.find(g => g.id === v)),
  'save-goal': ({ v }) => addToGoal(db.goals.find(g => g.id === v)),
  'del-goal': async ({ v }) => {
    const goal = db.goals.find(g => g.id === v);
    if (!confirm(`¿Eliminar la meta ${goal.name}?`)) return;
    db.goals = db.goals.filter(g => g !== goal);
    save();
    await trashFx(byV(v).closest('.goal'));
    render();
    toast('Meta eliminada');
  },
  'add-debt': () => editDebt(null),
  'edit-debt': ({ v }) => editDebt(db.debts.find(d => d.id === v)),
  'del-debt': async ({ v }) => {
    const debt = db.debts.find(d => d.id === v);
    if (!confirm(`¿Eliminar la deuda ${debt.name}? Los pagos que registraste se conservan.`)) return;
    db.debts = db.debts.filter(d => d !== debt);
    save();
    await trashFx(byV(v).closest('.debt-row'));
    render();
    toast('Deuda eliminada');
  },
  'del-card': async ({ v }) => {
    const card = db.cards.find(c => c.id === v);
    if (!confirm(`¿Eliminar la tarjeta ${card.name}? Los gastos que hiciste con ella se conservan.`)) return;
    db.cards = db.cards.filter(c => c !== card);
    save();
    await trashFx(byV(v).closest('.card-wrap'));
    render();
    toast('Tarjeta eliminada');
  },
  col: (_, el) => {
    el.parentElement.classList.add('picked');
    for (const b of el.parentElement.children) b.classList.toggle('sel', b === el);
    $app.querySelector('.cols-caption').textContent = el.getAttribute('aria-label');
  },
  theme: ({ k, v }) => {
    const change = () => {
      theme[k] = v;
      applyTheme();
      render();
      toast(k === 'color' ? `Tema ${THEMES[v].name}` : `Modo ${SCHEMES[v].toLowerCase()}`);
      localStorage.setItem(THEME_KEY, JSON.stringify(theme));
    };
    // Cross-fade the whole screen into the new colors
    if (motion && document.startViewTransition) document.startViewTransition(change);
    else change();
  },
  export: exportBackup,
};

const inputs = {
  'setup-name': v => { setup.name = v; },
  'setup-card': (v, { type, i, f }) => { setup[type][i][f] = v; },
  amount: v => { draft.amountText = v; },
  date: v => { draft.date = v; },
  'cat-other': v => { draft.category = v; },
  detail: v => { draft.detail = v; },
  'debt-name': v => { draft.newDebtName = v; },
  'debt-total': v => {
    draft.newDebtTotal = v;
    $app.querySelector('.debt-note').innerHTML = debtNote();
  },
};

const changes = {
  name: el => {
    const v = el.value.trim();
    if (!v || v === db.name) return void (el.value = db.name);
    db.name = v;
    save();
    render();
    pop($app.querySelector('.avatar'));
    toast('Nombre actualizado');
  },
  import: async el => {
    const file = el.files[0];
    el.value = '';
    if (!file) return;
    let data = null;
    try { data = JSON.parse(await file.text()); } catch {}
    if (!validBackup(data)) return toast('Ese archivo no es un respaldo válido', 'error');
    if (!confirm(`Tus datos actuales se reemplazarán por el respaldo (${data.expenses.length} gastos). ¿Continuar?`)) return;
    db = upgrade(data);
    save();
    render();
    enter();
    toast('Respaldo restaurado');
  },
};

document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  if (el) actions[el.dataset.act](el.dataset, el);
});
// Every money field (inputmode=decimal) only takes numbers with up to 2 decimals, even when pasting.
// Capture phase, so every other input handler (including a sheet's live preview) sees the clean value.
document.addEventListener('input', e => {
  const el = e.target;
  if (el.inputMode === 'decimal' && cleanMoney(el.value) !== el.value) el.value = cleanMoney(el.value);
}, true);
document.addEventListener('input', e => inputs[e.target.dataset.input]?.(e.target.value, e.target.dataset));
document.addEventListener('change', e => changes[e.target.dataset.change]?.(e.target));

// iOS Safari ignores user-scalable=no, so block the pinch gesture itself
for (const type of ['gesturestart', 'gesturechange']) document.addEventListener(type, e => e.preventDefault());
navigator.storage?.persist?.(); // ask iOS not to evict the data
navigator.serviceWorker?.register('sw.js');
applyTheme();
render();
enter();
if (db) setTimeout(reviewLastMonth, 700); // after the app is on screen
