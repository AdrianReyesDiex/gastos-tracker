import { ICONS } from './icons.js';
import { cleanMoney, parseMoney, parseAmount, cardUsed, debtLeft, periodRange, filterExpenses, totalsBy, timeBins, validBackup,
  localDate, daysUntil, goalPlan, goalMilestone, isSpending, isCashOut, budgetStatus, convertBudget, goalMove, lastMonthResults, streakDays,
  backupAge, BACKUP_DAYS, dueFixed, cardStatement, monthKey, matches, compareTotals, toCSV, validCategoryName } from './logic.js';

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
// The categories a new user starts with; after that they're the user's (db.categories, edited in Perfil).
// `c` is the chart color slot (--cat-1..8); `detail`: optional free text, "General" if left empty.
// Deuda can't be renamed or removed: paying cards and debts goes through it.
const DEFAULT_CATEGORIES = [
  { name: 'Comida', icon: 'utensils', c: 2 },
  { name: 'Botana', icon: 'popcorn', c: 6 },
  { name: 'Transporte', icon: 'car', c: 1, detail: '¿Qué fue? (ej. Uber, gasolina)' },
  { name: 'Servicio', icon: 'lightbulb', c: 3, detail: '¿Qué servicio? (ej. luz, internet)' },
  { name: 'Deuda', icon: 'hand-coins', c: 4 },
];
// The icons a category can have, with what each means (also its accessible name in the picker)
const CATEGORY_ICONS = {
  utensils: 'Comida', popcorn: 'Botana', car: 'Auto', lightbulb: 'Servicios', 'shopping-cart': 'Súper', shirt: 'Ropa',
  'heart-pulse': 'Salud', house: 'Casa', 'gamepad-2': 'Juegos', gift: 'Regalos', 'graduation-cap': 'Escuela', plane: 'Viajes',
  dumbbell: 'Gimnasio', 'paw-print': 'Mascota', coffee: 'Café', fuel: 'Gasolina', pill: 'Medicinas', baby: 'Bebé',
  smartphone: 'Celular', pencil: 'Otro',
};
const COLOR_NAMES = ['Azul', 'Naranja', 'Aqua', 'Amarillo', 'Rosa', 'Verde', 'Violeta', 'Rojo']; // --cat-1..8
const OTHER = { icon: 'pencil', c: 5 }; // what "Otro" (free text) expenses look like
let CATEGORIES = {}; // the user's categories by name, from db.categories
const useCategories = (data = db) => { CATEGORIES = Object.fromEntries(data.categories.map(c => [c.name, c])); };
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

// { name, cards: [{id, type, name, limit?, startUsed?, since?, cutDay?, payDay?}], debts: [{id, name, total, since?}],
//   expenses: [{id, amount (cents), category, detail?, debtId?, toCard?, method, cardId?, cardName?, date (ms)}],
//   goals: [{id, name, amount, saved, date: 'YYYY-MM-DD'}], incomes: [{id, amount, source, date (ms)}],
//   goalMoves: [{goalId, amount (+ into the goal, − back out), date (ms)}] (kept after the goal is deleted),
//   budgets: { Comida: cents, ..., Otros: cents }, budgetPeriod?: 'semana' | 'mes' (what the amounts are for; default mes),
//   fixed: [{id, name, amount, category, detail?, method, cardId?, cardName?, day (of the month), paidMonth?: 'YYYY-MM'}],
//   quick: [same as fixed, without day and paidMonth], budgetHistory: { 'YYYY-MM': { budgets, period } },
//   categories: [{name, icon, c, detail?}], lastBackup?: ms }
// Money is in cents. A "Deuda" expense pays the card or debt in `debtId`; `toCard` marks credit card payments.
let db = JSON.parse(localStorage.getItem(KEY));
// Fills in what data saved by older versions doesn't have
function upgrade(data) {
  data.debts ??= [];
  data.goals ??= [];
  data.incomes ??= [];
  data.budgets ??= {};
  data.goalMoves ??= [];
  data.fixed ??= [];
  data.quick ??= [];
  data.budgetHistory ??= {};
  data.categories ??= DEFAULT_CATEGORIES.map(c => ({ ...c }));
  if (!data.categories.some(c => c.name === 'Deuda')) data.categories.push({ ...DEFAULT_CATEGORIES.at(-1) });
  for (const c of data.categories) if (!ICONS[c.icon]) c.icon = OTHER.icon; // an icon this version doesn't have
  for (const e of data.expenses) if (e.debtId && data.cards.some(c => c.id === e.debtId)) e.toCard = true;
  useCategories(data);
  return data;
}
if (db) upgrade(db);
let tab = 'registrar';
let draft = null; // expense being registered or edited (draft.editId)
const setup = { name: '', debito: [], credito: [] }; // card entries: { name, limit, used } as typed
const filter = { period: 'mes', offset: 0, method: 'todos', q: '' }; // q: Historial search
const theme = { color: 'indigo', scheme: '', ...JSON.parse(localStorage.getItem(THEME_KEY)) };
// App lock: { salt, hash (of the PIN), credId? (Face ID passkey) }. Kept apart from the data, so a backup never carries it.
const LOCK_KEY = 'gastos-lock';
let lock = JSON.parse(localStorage.getItem(LOCK_KEY));

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
const budgetPeriod = () => db.budgetPeriod ?? 'mes';
const BUDGET_PERIODS = {
  semana: { label: 'Por semana', this: 'esta semana', resets: 'Se reinician cada lunes.' },
  mes: { label: 'Por mes', this: 'este mes', resets: 'Se reinician cada mes.' },
};
// This week's or month's cash and debit in a budget's categories (credit purchases count when the card is paid, in Deuda)
const budgetSpent = (key, expenses = db.expenses) =>
  sum(filterExpenses(expenses, { period: budgetPeriod(), offset: 0, method: 'todos' }).filter(e => isCashOut(e) && budgetKey(e.category) === key));
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
const shortDate = d => new Date(d).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
// A day of the month typed in a form: null if empty, NaN if it isn't 1–31
const parseDay = text => { const t = String(text ?? '').trim(); return !t ? null : /^\d{1,2}$/.test(t) && +t >= 1 && +t <= 31 ? +t : NaN; };

function dayLabel(d) {
  const daysAgo = Math.round((periodRange('dia', 0)[0] - new Date(d).setHours(0, 0, 0, 0)) / 864e5);
  return daysAgo === 0 ? 'Hoy' : daysAgo === 1 ? 'Ayer' : fmtDate(d, { weekday: 'long', day: 'numeric', month: 'long' });
}

function periodLabel(period = filter.period, offset = filter.offset) {
  const [from, to] = periodRange(period, offset);
  if (period === 'dia') return dayLabel(from);
  if (period === 'mes') return fmtDate(from, { month: 'long', year: 'numeric' });
  return `${shortDate(from)} – ${shortDate(to - 1)}`;
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
  for (const bar of $app.querySelectorAll('.bar i, .budget .meter i')) animate(bar, [{ transform: 'scaleX(0)' }, { transform: 'none' }], { duration: 700, delay: 150 });
  animate($app.querySelector('.ring .val'), [{ strokeDashoffset: 100 }, {}], { duration: 900, delay: 150 });
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

// A budget just passed: its tile on Home shakes and flashes red once, and its bar throbs
function alertBudget(key) {
  const row = $app.querySelector(`.budget[data-k="${CSS.escape(key)}"]`);
  if (!row) return;
  shake(row);
  animate(row, [{ backgroundColor: 'rgba(255, 59, 48, .3)' }, { backgroundColor: getComputedStyle(row).backgroundColor }], { duration: 1200, easing: 'ease-out' });
  animate(row.querySelector('.meter'), [{ transform: 'scaleY(1)' }, { transform: 'scaleY(2.4)' }, { transform: 'scaleY(1)' }], { duration: 500, delay: 120 });
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
  const [from, to] = periodRange('mes', -1), key = dayKey(from).slice(0, 7);
  if (db.lastMonthReview === key) return;
  db.lastMonthReview = key;
  save();
  // The budgets that month had (older months have no snapshot: today's)
  const then = db.budgetHistory[key] ?? { budgets: db.budgets, period: budgetPeriod() };
  // shortcut: weekly budgets are judged on the whole month as weekly × days / 7; review each week if that's not enough
  const scale = then.period === 'semana' ? Math.round((to - from) / 864e5) / 7 : 1;
  const budgets = Object.fromEntries(Object.entries(then.budgets).map(([k, cents]) => [k, cents * scale]));
  const { underBudget, savedPct } = lastMonthResults({ ...db, budgets }, budgetKey);
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

// Small form in a native <dialog> (returned); onSave returns an error message to keep it open.
// Options: `preview(values)` returns HTML shown under the fields while typing;
// `onDelete()` adds an "Eliminar" button (it does its own confirm; return false to keep the form open).
function openSheet(title, fields, onSave, { preview, onDelete } = {}) {
  const d = Object.assign(document.createElement('dialog'), { className: 'sheet' });
  d.innerHTML = `
    <form method="dialog" novalidate>
      <h3>${esc(title)}</h3>
      ${fields.map(f => f.options // { value: label HTML }: one to pick, as a segmented control, or a titled grid (`grid`)
        // whose labels are icons or swatches, named for screen readers by `names` { value: name }
        ? `${f.grid ? `<p class="sheet-label">${f.label}</p>` : ''}<div class="${f.grid ? `pick-grid ${f.grid}` : 'segmented'}" role="radiogroup" aria-label="${esc(f.label)}">
          ${Object.entries(f.options).map(([k, label]) => {
            const name = f.names?.[k] ? esc(f.names[k]) : '';
            return `<label${name ? ` title="${name}"` : ''}><input type="radio" name="${esc(f.name)}" value="${esc(k)}" ${k === f.value ? 'checked' : ''}${name ? ` aria-label="${name}"` : ''}>${label}</label>`;
          }).join('')}</div>`
        : `<label>${f.label}<input class="field" name="${esc(f.name)}" value="${esc(f.value ?? '')}"
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
  return d;
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
    moveToGoal(g, goal?.saved ?? 0, saved);
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

// Saving into a goal takes the money out of your month; taking it back out (or deleting the goal) returns it today
function moveToGoal(goal, before, after) {
  const amount = goalMove(before, after, sum(db.goalMoves.filter(m => m.goalId === goal.id)));
  if (amount) db.goalMoves.push({ goalId: goal.id, amount, date: Date.now() });
  return amount;
}

// A period's (default: this month) income − money that actually left it (cash, debit and card payments; not credit
// purchases). Money put into goals left too, and what came back from them counts as income (net: in and back out
// in the same period cancel out instead of inflating both).
function balance(f = { period: 'mes', offset: 0, method: 'todos' }) {
  const net = sum(filterExpenses(db.goalMoves, f)), toGoals = Math.max(0, net), fromGoals = Math.max(0, -net);
  const income = sum(filterExpenses(db.incomes, f)) + fromGoals;
  const out = sum(filterExpenses(db.expenses, f).filter(isCashOut)) + toGoals;
  return { income, out, toGoals, fromGoals, left: income - out };
}
// What the Salidas and Ingresos include besides expenses and incomes
const goalsNote = ({ toGoals, fromGoals }) => (toGoals ? ` Incluye ${money(toGoals)} que apartaste para tus metas.` : '')
  + (fromGoals ? ` Ingresos incluye ${money(fromGoals)} que regresó de tus metas.` : '');

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
    const { left } = balance();
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

const budgetKeys = () => [...Object.keys(CATEGORIES), 'Otros']; // "Otro" (free text) expenses share one budget

function editBudgets() {
  const periods = Object.fromEntries(Object.entries(BUDGET_PERIODS).map(([k, p]) => [k, p.label]));
  const other = period => period === 'semana' ? 'mes' : 'semana';
  const d = openSheet('Presupuestos', [{ name: 'period', label: '¿Cada cuánto?', value: budgetPeriod(), options: periods }, ...budgetKeys().map(k => ({
    name: k, label: `${icon(catOf(k).icon)} ${esc(k)}${k === 'Otros' ? ' (lo que escribes en «Otro»)' : ''}`,
    value: db.budgets[k] ? db.budgets[k] / 100 : '', money: true,
  }))], v => {
    const budgets = {};
    for (const k of budgetKeys()) {
      const cents = parseMoney(v[k]);
      if (cents === null) return `Revisa el monto de ${k}`;
      if (cents) budgets[k] = cents; // empty or 0 = no budget for it
    }
    db.budgets = budgets;
    db.budgetPeriod = v.period;
    snapshotBudgets(true);
    save();
    render();
    enter();
    toast('Presupuestos guardados');
  }, { preview: v => {
    const p = BUDGET_PERIODS[v.period], total = budgetKeys().reduce((t, k) => t + (parseMoney(v[k]) ?? 0), 0);
    const equal = `≈ ${money(convertBudget(total, v.period, other(v.period)))} ${BUDGET_PERIODS[other(v.period)].label.toLowerCase()}`;
    return `${total ? `Total: <b>${money(total)}</b> ${p.label.toLowerCase()} (${equal}). ` : ''}${p.resets} Deja vacío lo que no quieras limitar. `
      + 'Lo que compras con crédito cuenta en Deuda cuando pagas la tarjeta.';
  } });

  // Switching week ↔ month converts the amounts, each from what was last typed in it (and in which period),
  // so switching back brings it back exactly instead of drifting with the rounding
  const form = d.querySelector('form');
  const typed = Object.fromEntries(budgetKeys().map(k => [k, { period: budgetPeriod(), value: form[k].value }]));
  form.addEventListener('input', e => {
    if (typed[e.target.name]) typed[e.target.name] = { period: form.period.value, value: e.target.value };
  });
  form.addEventListener('change', e => {
    if (e.target.name !== 'period') return;
    for (const k of budgetKeys()) {
      const { period, value } = typed[k], cents = parseMoney(value); // empty or invalid stays as it is
      form[k].value = cents ? convertBudget(cents, period, e.target.value) / 100 : value;
    }
    form.dispatchEvent(new Event('input')); // refresh the total
  });
}

// Lines for the confirmation after an expense: how its category's budget is going this week or month
function budgetLines(e) {
  const key = budgetKey(e.category), budget = db.budgets[key];
  if (!budget || !isCashOut(e)) return [];
  const { pct, left, level } = budgetStatus(budgetSpent(key), budget);
  if (level === 'over') return [{ icon: 'triangle-alert', text: `Te pasaste del presupuesto de ${key} por ${money(-left)}` }];
  if (level === 'warn') return [{ icon: 'triangle-alert', text: `Ya usaste el ${pct}% de tu presupuesto de ${key}` }];
  return [`${key}: te quedan ${money(left)} ${BUDGET_PERIODS[budgetPeriod()].this}`];
}

function addToGoal(goal) {
  const { left } = goalPlan(goal);
  openSheet(`Abonar a ${goal.name}`, [{ name: 'amount', label: `¿Cuánto ahorraste? Te faltan ${money(left)}`, money: true }], v => {
    const amount = parseAmount(v.amount);
    if (!amount) return 'Escribe cuánto ahorraste';
    if (amount > left) return `Solo te faltan ${money(left)}`;
    const mark = goalMilestone(goal.saved, goal.saved + amount, goal.amount);
    moveToGoal(goal, goal.saved, goal.saved + amount);
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
  }, { preview: v => {
    const amount = parseAmount(v.amount), month = balance();
    return amount && month.income ? `${icon('wallet')} Sale de lo que te queda este mes: te quedarán <b>${money(month.left - amount)}</b>` : '';
  } });
}

function editCard(card, type) {
  const credit = type === 'credito', used = card && credit ? cardUsed(card, db.expenses) : 0;
  openSheet(card ? 'Editar tarjeta' : `Nueva tarjeta de ${METHODS[type].label.toLowerCase()}`, [
    { name: 'name', label: 'Identificador', value: card?.name, placeholder: 'ej. BBVA 1234' },
    ...(credit ? [
      { name: 'limit', label: 'Límite de crédito', value: card?.limit ? card.limit / 100 : '', money: true },
      { name: 'used', label: 'Saldo en uso hoy', value: used ? used / 100 : '', money: true },
      { name: 'cutDay', label: 'Día de corte (opcional)', value: card?.cutDay, attrs: 'inputmode="numeric" placeholder="ej. 5"' },
      { name: 'payDay', label: 'Día límite de pago (opcional)', value: card?.payDay, attrs: 'inputmode="numeric" placeholder="ej. 25"' },
    ] : []),
  ], v => {
    const name = v.name.trim(), limit = parseMoney(v.limit), newUsed = parseMoney(v.used);
    const cutDay = parseDay(v.cutDay), payDay = parseDay(v.payDay);
    if (!name) return 'Escribe un identificador';
    if (limit === null || newUsed === null) return 'Revisa los montos';
    if (credit && limit && newUsed > limit) return 'El saldo en uso no puede ser mayor al límite';
    if (Number.isNaN(cutDay) || Number.isNaN(payDay)) return 'Los días van del 1 al 31';
    if ((cutDay === null) !== (payDay === null)) return 'Escribe el día de corte y el de pago, o deja los dos vacíos';
    if (cutDay && cutDay === payDay) return 'El día de pago tiene que ser distinto al de corte';
    const c = card ?? { id: uid(), type, name };
    c.name = name;
    if (credit) {
      c.limit = limit;
      if (!card || newUsed !== used) Object.assign(c, { startUsed: newUsed, since: Date.now() }); // typed balance becomes the new starting point
      if (cutDay) Object.assign(c, { cutDay, payDay });
      else { delete c.cutDay; delete c.payDay; }
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

// The month's budgets as they are now, kept so last month's medal judges the budgets that month had.
// `force`: they just changed; otherwise only if this month has none yet (the first open of the month).
function snapshotBudgets(force) {
  const key = monthKey(new Date());
  if (!force && db.budgetHistory[key]) return false;
  db.budgetHistory[key] = { budgets: { ...db.budgets }, period: budgetPeriod() };
  return true;
}

// Fixed ("Se repite cada mes") and quick expenses are created from a registered one; here only their name, amount
// and (fixed) day change
function editShortcut(f) {
  const fixed = db.fixed.includes(f), what = fixed ? 'Gasto fijo' : 'Gasto rápido';
  openSheet(what, [
    { name: 'name', label: 'Nombre', value: f.name },
    { name: 'amount', label: 'Monto', value: f.amount / 100, money: true },
    ...(fixed ? [{ name: 'day', label: 'Día del mes en que se paga', value: f.day, attrs: 'inputmode="numeric"' }] : []),
  ], v => {
    const name = v.name.trim(), amount = parseAmount(v.amount), day = parseDay(v.day);
    if (!name) return 'Escribe un nombre';
    if (!amount) return 'Escribe el monto';
    if (fixed && !day) return 'El día va del 1 al 31';
    Object.assign(f, { name, amount }, fixed && { day });
    save();
    render();
    pop(byV(f.id));
    toast(`${what} actualizado`);
  }, { onDelete: () => {
    if (!confirm(fixed ? `¿Dejar de recordarte ${f.name}? Los gastos que ya registraste se conservan.` : `¿Quitar ${f.name} de tus gastos rápidos?`)) return false;
    if (fixed) db.fixed = db.fixed.filter(x => x !== f);
    else db.quick = db.quick.filter(x => x !== f);
    save();
    trashFx(byV(f.id)?.closest('.debt-row')).then(() => { render(); toast(`${what} eliminado`); });
  } });
}

// Create or change a category: name, icon and color. Renaming carries its expenses, budget and shortcuts along;
// removing one leaves its expenses as they are, counted in "Otros" like any free-text category.
function editCategory(cat) {
  const unused = COLOR_NAMES.findIndex((_, i) => ![OTHER, ...db.categories].some(c => c.c === i + 1)) + 1 || 7; // a color no one has
  openSheet(cat ? 'Editar categoría' : 'Nueva categoría', [
    { name: 'name', label: 'Nombre', value: cat?.name, placeholder: 'ej. Ropa, Salud, Mascota' },
    { name: 'icon', label: 'Ícono', value: cat?.icon ?? 'shopping-cart', grid: 'icons', names: CATEGORY_ICONS,
      options: Object.fromEntries(Object.keys(CATEGORY_ICONS).map(n => [n, icon(n)])) },
    { name: 'c', label: 'Color', value: String(cat?.c ?? unused), grid: 'colors', names: Object.fromEntries(COLOR_NAMES.map((n, i) => [i + 1, n])),
      options: Object.fromEntries(COLOR_NAMES.map((_, i) => [i + 1, `<span class="swatch" style="background:var(--cat-${i + 1})"></span>`])) },
  ], v => {
    const name = v.name.trim().replace(/\s+/g, ' ');
    if (!name) return 'Escribe un nombre';
    if (!validCategoryName(name)) return 'Usa solo letras, números y espacios (hasta 20)';
    const taken = n => n.toLowerCase() === name.toLowerCase();
    if (['otro', 'otros'].some(taken) || db.categories.some(c => c !== cat && taken(c.name))) return 'Ya hay una categoría con ese nombre';
    if (cat && name !== cat.name) renameCategory(cat.name, name);
    const c = cat ?? {};
    Object.assign(c, { name, icon: v.icon, c: +v.c });
    if (!cat) db.categories.splice(db.categories.findIndex(x => x.name === 'Deuda'), 0, c); // Deuda stays last, before "Otro"
    useCategories();
    save();
    render();
    pop(byV(name));
    toast(cat ? 'Categoría actualizada' : 'Categoría agregada');
  }, {
    preview: v => `<span class="cat-preview"><span class="ico" style="--c:var(--cat-${+v.c})">${icon(v.icon)}</span>${esc(v.name.trim() || 'Así se verá')}</span>`,
    ...(cat && { onDelete: () => {
      if (!confirm(`¿Quitar la categoría ${cat.name}? Sus gastos se conservan y cuentan en «Otros».`)) return false;
      db.categories = db.categories.filter(c => c !== cat);
      delete db.budgets[cat.name];
      useCategories();
      save();
      trashFx(byV(cat.name)?.closest('.debt-row')).then(() => { render(); toast('Categoría quitada'); });
    } }),
  });
}

// What was saved under a category's old name moves to the new one
function renameCategory(from, to) {
  for (const list of [db.expenses, db.fixed, db.quick]) for (const e of list) if (e.category === from) e.category = to;
  if (from in db.budgets) {
    db.budgets[to] = db.budgets[from];
    delete db.budgets[from];
  }
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
  const month = balance(), { income, out, left } = month;
  const owedOnCards = cardsOf('credito').reduce((total, c) => total + cardUsed(c, db.expenses), 0);
  return `
    <p class="muted date">${fmtDate(Date.now(), { weekday: 'long', day: 'numeric', month: 'long' })}</p>
    <h1>Hola, ${esc(db.name)}</h1>
    <button class="hero" data-act="new">
      <span class="plus">${icon('plus')}</span>
      <b>Registrar gasto</b>
      <small>Toca aquí para anotar lo que gastaste</small>
    </button>
    ${db.quick.length ? `
      <h2>${icon('zap')} Gastos rápidos · un toque y listo</h2>
      <div class="quick-row">${db.quick.map(q => `
        <button class="quick" data-act="quick" data-v="${esc(q.id)}" style="--c:var(--cat-${catOf(q.category).c})">
          <span class="ico">${icon(catOf(q.category).icon)}</span><span><b>${esc(q.name)}</b><small>${money(q.amount)}</small></span>
        </button>`).join('')}</div>` : ''}
    <button class="income-btn" data-act="add-income">${icon('coins')} Registrar ingreso</button>
    ${viewReminders()}
    <h2>${fmtDate(Date.now(), { month: 'long' })}</h2>
    <div class="panel month">
      <div><small>Ingresos</small><b data-count="income" data-value="${income}">${money(income)}</b></div>
      <div><small>Salidas</small><b data-count="out" data-value="${out}">${money(out)}</b></div>
      ${income ? `<div><small>${left < 0 ? 'Te pasaste por' : 'Te quedan'}</small><b class="${left < 0 ? 'warn' : ''}" data-count="left" data-value="${Math.abs(left)}">${money(Math.abs(left))}</b></div>` : ''}
    </div>
    <p class="note">${income ? `Salidas: lo que pagaste en efectivo o débito, incluido el pago de tus tarjetas. Las compras con crédito se descuentan cuando pagas la tarjeta.${goalsNote(month)}`
      : 'Registra tus ingresos para ver cuánto te queda en el mes.'}</p>
    ${owedOnCards ? `<p class="note">${icon('credit-card')} En tus tarjetas de crédito debes <b>${money(owedOnCards)}</b>; se descontará de tus ingresos y presupuestos cuando las pagues.</p>` : ''}
    ${viewBudgets()}`;
}

// What needs doing, on Home: card payments due within 5 days (or late), fixed expenses whose day came, a backup
function viewReminders() {
  const item = (iconHtml, color, title, text, buttons, cls = '') => `
    <div class="reminder ${cls}"><span class="ico" style="--c:${color}">${iconHtml}</span><span class="reminder-text"><b>${title}</b><small>${text}</small></span>${buttons}</div>`;
  const go = (act, v, label) => `<button class="reminder-go" data-act="${act}" data-v="${esc(v)}">${label}</button>`;
  const items = [];
  for (const c of cardsOf('credito').filter(c => c.cutDay)) {
    const { toPay, due, daysLeft } = cardStatement(c, db.expenses);
    if (!toPay || daysLeft > 5) continue;
    const when = daysLeft < 0 ? `Venció el ${shortDate(due)}` : daysLeft === 0 ? 'Hoy es el último día para pagar' : `Antes del ${shortDate(due)} · faltan ${daysText(daysLeft)}`;
    items.push(item(miniCard(c), daysLeft < 0 ? 'var(--danger)' : 'var(--accent)', `Paga ${money(toPay)} de ${esc(c.name)}`, when, go('pay-card', c.id, 'Pagar'), daysLeft < 0 ? 'urgent' : ''));
  }
  for (const f of dueFixed(db.fixed)) {
    const today = new Date().getDate();
    items.push(item(icon(catOf(f.category).icon), `var(--cat-${catOf(f.category).c})`, esc(f.name), `${money(f.amount)} · ${f.day >= today ? 'toca hoy' : `tocaba el día ${f.day}`}`,
      `${go('pay-fixed', f.id, 'Registrar')}<button class="icon-btn" data-act="skip-fixed" data-v="${esc(f.id)}" aria-label="Este mes no">${icon('x')}</button>`));
  }
  const age = backupAge(db);
  if (age) items.push(item(icon('save'), 'var(--accent)', 'Respalda tus datos',
    db.lastBackup ? `El último respaldo fue hace ${daysText(age)}` : 'Aún no tienes ningún respaldo', go('export', '', 'Respaldar')));
  return items.length ? `<h2>Pendientes</h2><div class="reminders">${items.join('')}</div>` : '';
}

// Budgets on Home: how this week or month is going overall (a ring), then a tile per category in its chart color
function viewBudgets() {
  const keys = budgetKeys().filter(k => db.budgets[k]);
  if (!keys.length) return `
    <h2>Presupuestos</h2>
    <button class="budget-empty" data-act="edit-budgets"><span class="ico" style="--c: var(--accent)">${icon('target')}</span>
      <span><b>Define tus presupuestos</b><small>Por semana o por mes, para cada categoría. Te aviso cuando te acerques al límite.</small></span></button>`;
  const period = budgetPeriod(), [from, to] = periodRange(period, 0);
  const daysLeft = Math.round((to - periodRange('dia', 0)[0]) / 864e5); // counting today
  const spent = Object.fromEntries(keys.map(k => [k, budgetSpent(k)]));
  const total = keys.reduce((t, k) => t + db.budgets[k], 0), used = keys.reduce((t, k) => t + spent[k], 0);
  const { pct, left, level } = budgetStatus(used, total);
  const pace = left > 0 ? (daysLeft === 1 ? `${money(left)} para hoy` : `${money(Math.floor(left / daysLeft))} al día por ${daysText(daysLeft)}`)
    : daysLeft === 1 ? 'Se reinicia mañana' : `Se reinicia en ${daysText(daysLeft)}`;
  const tile = k => {
    const { pct, left, level } = budgetStatus(spent[k], db.budgets[k]), cat = catOf(k);
    return `
      <button class="budget ${level}" data-act="edit-budgets" data-k="${esc(k)}" style="--c: var(--cat-${cat.c})">
        <span class="budget-top"><span class="ico">${icon(cat.icon)}</span><span class="budget-pct">${pct}%</span></span>
        <b>${esc(k)}</b>
        <small>${level === 'over' ? 'Te pasaste por' : 'Disponible'}</small>
        <span class="budget-left">${money(Math.abs(left))}</span>
        ${meter(spent[k], db.budgets[k])}
        <small>${money(spent[k])} de ${money(db.budgets[k])}</small>
      </button>`;
  };
  return `
    <h2 class="head-row">Presupuestos<button class="link" data-act="edit-budgets">Editar</button></h2>
    <div class="panel budget-sum ${level}">
      <div class="ring" role="img" aria-label="Llevas ${pct}% de tus presupuestos">
        <svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="42"/>${used ? `<circle class="val" cx="50" cy="50" r="42" pathLength="100" stroke-dasharray="100" stroke-dashoffset="${100 - Math.min(100, pct)}"/>` : ''}</svg>
        <b>${pct}%</b>
      </div>
      <div class="budget-sum-main">
        <small>${level === 'over' ? 'Te pasaste por' : `Disponible ${BUDGET_PERIODS[period].this}`}</small>
        <b data-count="budget-left" data-value="${Math.abs(left)}">${money(Math.abs(left))}</b>
        <small>de ${money(total)} · ${period === 'mes' ? fmtDate(from, { month: 'long' }) : periodLabel('semana', 0)}</small>
        <span class="budget-chip">${icon('calendar')}${pace}</span>
      </div>
    </div>
    <div class="budget-grid">${keys.map(tile).join('')}</div>`;
}

// `flag`: optional HTML under the label (budget warning)
const choice = (act, value, label, iconName, color, selected, cls = '', sub = '', flag = '') =>
  `<button class="choice ${cls} ${selected ? 'sel' : ''}" style="--c:${color}" data-act="${act}" data-v="${esc(value)}"><span class="ico">${icon(iconName)}</span><span>${esc(label)}${sub ? `<small>${esc(sub)}</small>` : ''}${flag}</span></button>`;

// Warning on a category tile while registering: already over its budget, or over/near it with this amount.
function budgetFlag(key) {
  const budget = db.budgets[key], [from, to] = periodRange(budgetPeriod(), 0), day = localDate(draft.date);
  if (!budget || day < from || day >= to) return ''; // budgets are for this week or month
  const spent = budgetSpent(key, balanceExpenses()); // an edited expense isn't counted twice
  // Credit purchases don't use the budget; on a new expense the method comes later, so this assumes cash or debit
  const amount = draft.method !== 'credito' ? parseAmount(draft.amountText) ?? 0 : 0;
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
      ${choice('cat', '', 'Otro', OTHER.icon, `var(--cat-${OTHER.c})`, draft.custom, Object.keys(CATEGORIES).length % 2 ? '' : 'wide', '', budgetFlag('Otros'))}
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
    ${selected && nearLimit(selected) ? `<p class="note near-note">${icon('triangle-alert')} Con este gasto usarías el ${Math.round(usageAfter(selected) * 100)}% de tu límite de ${esc(selected.name)}</p>` : ''}
    ${draft.editId || draft.fixedId || isDebt() ? '' : `
      <label class="repeat"><input type="checkbox" data-change="repeat" ${draft.repeat ? 'checked' : ''}>
        <span><b>Se repite cada mes</b><small>Te lo recuerdo cada día ${+draft.date.slice(8)} para registrarlo con un toque</small></span></label>
      <label class="repeat"><input type="checkbox" data-change="quick" ${draft.quick ? 'checked' : ''}>
        <span><b>Guardar como gasto rápido</b><small>Aparece en Inicio para anotarlo otra vez con un toque</small></span></label>`}`;
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

// `searching`: the Historial search looks through every period, so only the payment method filter shows
function viewFilters(searching = false) {
  return `
    <div class="filters ${searching ? 'searching' : ''}">
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
  return `
    <h1>Historial</h1>
    <label class="search">${icon('search')}<input type="search" data-input="search" value="${esc(filter.q)}" placeholder="Buscar: Uber, Netflix, Oro…" enterkeyhint="search" aria-label="Buscar en tu historial"></label>
    ${viewFilters(!!filter.q.trim())}
    <div class="results">${historyResults()}</div>`;
}

// The period's movements, or with a search, the matches from the whole history (typing only redraws this part)
function historyResults() {
  const q = filter.q.trim();
  const pick = list => q ? list.filter(e => filter.method === 'todos' || e.method === filter.method) : filterExpenses(list, filter);
  const expenses = pick(db.expenses).filter(e => !q || matches(q, [catLabel(e), payLabel(e), money(e.amount)]));
  // Incomes have no payment method, so they only show with "Todos"
  const incomes = filter.method === 'todos'
    ? pick(db.incomes).filter(i => !q || matches(q, [i.source, 'Ingreso', money(i.amount)])).map(i => ({ ...i, income: true })) : [];
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
    ${summary(expenses.filter(isSpending))}
    ${items.length ? days.map(g => `<h2>${dayLabel(g[0].date)}</h2><div class="tx-list">${g.map(row).join('')}</div>`).join('')
      + '<p class="note center">Toca un movimiento para editarlo o eliminarlo</p>'
      : q ? `<p class="empty">${icon('search')}Nada coincide con «${esc(q)}»</p>` : emptyState}`;
}

// This period against the previous one, by category. The current period is still going, so it's compared with
// the same stretch of the previous one (1–27 Oct against 1–27 Sep), not with all of it.
function viewCompare(list, total) {
  const [start] = periodRange(filter.period, filter.offset), [prevStart] = periodRange(filter.period, filter.offset - 1);
  const sofar = filter.offset === 0 ? Date.now() - start : Infinity;
  const before = filterExpenses(db.expenses, { ...filter, offset: filter.offset - 1 }).filter(e => isSpending(e) && e.date - prevStart < sofar);
  const was = sum(before);
  if (!was) return '';
  const name = { mes: `en ${fmtDate(prevStart, { month: 'long' }).toLowerCase()}`, semana: 'la semana anterior', dia: 'el día anterior' }[filter.period];
  const delta = ({ diff, pct }) => `<small class="delta ${diff > 0 ? 'up' : 'down'}">${diff > 0 ? '↑' : '↓'} ${pct === null ? 'nuevo' : `${Math.abs(pct)}%`} · ${money(Math.abs(diff))} ${diff > 0 ? 'más' : 'menos'}</small>`;
  const all = compareTotals([['Total', total]], [['Total', was]])[0];
  const rows = compareTotals(totalsBy(list, e => e.category), totalsBy(before, e => e.category)).slice(0, 5);
  return `
    <h2>Comparado con ${name.replace(/^en /, '')}</h2>
    <div class="panel">
      <p class="compare-total">${all ? `Gastaste <b>${Math.abs(all.pct)}% ${all.diff > 0 ? 'más' : 'menos'}</b> que ${name}${sofar < Infinity ? ' a estas alturas' : ''} (${money(Math.abs(all.diff))})` : `Gastaste lo mismo que ${name}`}</p>
      ${rows.map(r => `
        <div class="legend-row" style="--c:var(--cat-${catOf(r.name).c})">
          <span class="dot"></span><span class="name">${icon(catOf(r.name).icon)} ${esc(r.name)}</span>${delta(r)}
        </div>`).join('')}
    </div>`;
}

// Income vs. spending of the period, as two bars on the same scale
function viewBalance(b) {
  const { income, out } = b, max = Math.max(income, out), diff = income - out;
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
        Las compras con crédito cuentan hasta que pagas la tarjeta.${goalsNote(b)}</p>
    </div>`;
}

function viewEstadisticas() {
  const list = filterExpenses(db.expenses, filter).filter(isSpending); // card payments would count the purchases twice
  const total = sum(list);
  const flow = filter.method === 'todos' ? balance(filter) : null; // income only makes sense with every payment method
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
    ${flow?.income ? viewBalance(flow) : ''}
    ${list.length ? `
      <div class="kpis">
        <div><small>Promedio por gasto</small><b>${money(Math.round(total / list.length))}</b></div>
        <div><small>Más alto · ${esc(top.category)}</small><b>${money(top.amount)}</b></div>
      </div>
      <h2>Gasto en el tiempo</h2>
      <div class="panel">${viewColumns(list)}</div>
      <h2>Por categoría</h2>
      <div class="panel">${viewDonut(list, total)}${totalsBy(list, e => e.category).map(legend).join('')}</div>
      ${viewCompare(list, total)}
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
    ${plans.length ? '<p class="note center">Toca una meta para editarla</p>' : ''}
    <p class="note center">Lo que ahorras en tus metas sale de lo que te queda en el mes. Si eliminas una meta, regresa.</p>`;
}

function viewPerfil() {
  const cards = type => cardsOf(type).map(c => {
    const used = cardUsed(c, db.expenses);
    return `
      <div class="card-wrap">
        ${cardButton(c, 'edit-card', false)}
        <button class="card-del" data-act="del-card" data-v="${esc(c.id)}" aria-label="Eliminar ${esc(c.name)}">${icon('x')}</button>
        ${type === 'credito' && c.limit ? `<p class="card-meta">Usado ${money(used)} de ${money(c.limit)}${meter(used, c.limit)}</p>` : ''}
        ${type === 'credito' && c.cutDay ? `<p class="card-meta">${statementText(c)}</p>` : ''}
      </div>`;
  }).join('');
  const statementText = c => {
    const { toPay, due } = cardStatement(c, db.expenses);
    return `Corte día ${c.cutDay} · ${toPay ? `paga ${money(toPay)} antes del ${shortDate(due)}` : 'sin pago pendiente'}`;
  };
  const shortcutRow = f => `
    <div class="debt-row">
      <button class="debt-main" data-act="edit-shortcut" data-v="${esc(f.id)}">
        <span><b>${esc(f.name)}</b><small>${money(f.amount)}${f.day ? ` · día ${f.day}` : ''} · ${esc(payLabel(f))}</small></span>
      </button>
    </div>`;
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
    <p class="note">Toca una tarjeta para editar su nombre, límite, saldo y sus días de corte y de pago.</p>
    <h2>${icon('file-text')} Otras deudas</h2>
    <div class="debt-list">${db.debts.map(debtRow).join('')}<button class="add-debt" data-act="add-debt">+ Agregar deuda</button></div>
    <h2>${icon('list')} Categorías</h2>
    <div class="debt-list">${db.categories.map(c => `
      <div class="debt-row">
        <button class="debt-main cat-row" data-act="edit-category" data-v="${esc(c.name)}" ${c.name === 'Deuda' ? 'disabled' : ''}>
          <span class="ico" style="--c:var(--cat-${c.c})">${icon(c.icon)}</span>
          <span><b>${esc(c.name)}</b>${c.name === 'Deuda' ? '<small>Fija: con ella pagas tarjetas y deudas</small>' : ''}</span>
        </button>
      </div>`).join('')}<button class="add-debt" data-act="add-category">+ Agregar categoría</button></div>
    <p class="note">Toca una para cambiar su nombre, ícono o color, o para quitarla.</p>
    <h2>${icon('calendar')} Gastos fijos</h2>
    ${db.fixed.length ? `<div class="debt-list">${db.fixed.map(shortcutRow).join('')}</div>` : ''}
    <p class="note">${db.fixed.length ? 'Toca uno para cambiar su monto o su día, o para quitarlo. ' : ''}Al registrar un gasto marca «Se repite cada mes» y te lo recordaré en su día.</p>
    <h2>${icon('zap')} Gastos rápidos</h2>
    ${db.quick.length ? `<div class="debt-list">${db.quick.map(shortcutRow).join('')}</div>` : ''}
    <p class="note">${db.quick.length ? 'Toca uno para cambiar su nombre o monto, o para quitarlo. ' : ''}Al registrar un gasto marca «Guardar como gasto rápido» y lo anotas otra vez con un toque desde Inicio.</p>
    <h2>${icon('palette')} Tema</h2>
    <div class="themes">${Object.entries(THEMES).map(([k, t]) => `
      <button class="theme ${theme.color === k ? 'sel' : ''}" data-act="theme" data-k="color" data-v="${k}"><span style="background:${t.swatch ?? t.brand}"></span>${t.name}</button>`).join('')}</div>
    ${currentTheme().style ? '<p class="note">Este tema siempre es claro.</p>' : segmented('theme', 'scheme', SCHEMES, theme.scheme)}
    <h2>${icon('lock')} Bloqueo</h2>
    ${!crypto.subtle ? '<p class="note">El bloqueo funciona en la app publicada (https).</p>' : `
      <div class="debt-list">
        <button class="add-debt" data-act="set-pin">${lock ? 'Cambiar PIN' : 'Activar bloqueo con PIN'}</button>
        ${lock && canFaceId ? `<button class="add-debt" data-act="${lock.credId ? 'face-id-off' : 'face-id-on'}">${lock.credId ? 'Dejar de usar Face ID' : 'Usar también Face ID'}</button>` : ''}
        ${lock ? '<button class="add-debt danger" data-act="lock-off">Quitar bloqueo</button>' : ''}
      </div>
      <p class="note">${lock ? `Activo: se pide al abrir la app y al volver a ella después de un minuto${lock.credId ? ', con Face ID o tu PIN' : ''}.`
        : 'Pide un PIN de 4 números (y si quieres Face ID) al abrir la app.'}</p>`}
    <h2>${icon('save')} Respaldo</h2>
    <div class="tiles three">
      <button class="tile" data-act="export">${icon('upload')}Exportar</button>
      <label class="tile">${icon('download')}Restaurar<input type="file" accept=".json,application/json" data-change="import" hidden></label>
      <button class="tile" data-act="export-csv">${icon('file-spreadsheet')}Excel</button>
    </div>
    <p class="note">${count} en este iPhone. ${db.lastBackup ? `Último respaldo: ${dayLabel(db.lastBackup).toLowerCase()}.` : 'Aún no has hecho ningún respaldo.'}
      Si borras la app se borran los datos; te recuerdo exportar cada ${BACKUP_DAYS} días. «Excel» te da tus gastos en una hoja de cálculo (no sirve para restaurar).</p>`;
}

// ---------- Lock: PIN, optionally Face ID ----------
// shortcut: it keeps people out of the screens, it doesn't encrypt anything (the data sits as it always did on the
// phone), so a 4-digit PIN hash and an unchecked passkey signature are enough; encrypt the data if that ever matters.

const hashPin = async (pin, salt) =>
  [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(salt + pin)))].map(b => b.toString(16).padStart(2, '0')).join('');
const saveLock = () => lock ? localStorage.setItem(LOCK_KEY, JSON.stringify(lock)) : localStorage.removeItem(LOCK_KEY);
const toBase64 = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes)));
const fromBase64 = text => Uint8Array.from(atob(text), ch => ch.charCodeAt(0));
let canFaceId = false; // this device can confirm it's you (Face ID on the iPhone)
window.PublicKeyCredential?.isUserVerifyingPlatformAuthenticatorAvailable?.().then(ok => { canFaceId = ok; }, () => {});

let pinTyped = '';
const afterUnlock = []; // what waits for the app to be unlocked (last month's celebration)
const whenUnlocked = fn => document.querySelector('.lock') ? afterUnlock.push(fn) : fn();

// Covers everything until the PIN (or Face ID) is right
function showLock() {
  if (!lock || !db || document.querySelector('.lock')) return;
  for (const d of document.querySelectorAll('dialog[open]')) d.close(); // a form left open goes away with what it showed
  pinTyped = '';
  const el = Object.assign(document.createElement('div'), { className: 'lock', role: 'dialog', ariaModal: 'true', ariaLabel: 'App bloqueada' });
  el.innerHTML = `
    <span class="avatar">${icon('lock')}</span>
    <p class="lock-title">Escribe tu PIN</p>
    <div class="pin-dots" aria-hidden="true">${'<i></i>'.repeat(4)}</div>
    <div class="keypad">
      ${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => `<button data-act="pin-key" data-v="${n}">${n}</button>`).join('')}
      ${lock.credId ? `<button data-act="face-id" aria-label="Usar Face ID">${icon('scan-face')}</button>` : '<span></span>'}
      <button data-act="pin-key" data-v="0">0</button>
      <button data-act="pin-key" data-v="del" aria-label="Borrar">${icon('delete')}</button>
    </div>`;
  document.body.append(el);
  if (lock.credId) faceIdUnlock(); // iOS may want a tap first; then the Face ID key is there
}

function unlock() {
  const el = document.querySelector('.lock');
  if (!el) return;
  animate(el, [{}, { opacity: 0, transform: 'scale(1.06)' }], { duration: 250, fill: 'forwards' });
  setTimeout(() => el.remove(), 250);
  for (const fn of afterUnlock.splice(0)) fn();
}

// Face ID through a passkey made on this iPhone (with no server its signature isn't checked: Face ID passing is the gate)
async function faceIdUnlock() {
  try {
    await navigator.credentials.get({ publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)), allowCredentials: [{ type: 'public-key', id: fromBase64(lock.credId) }],
      userVerification: 'required', timeout: 60000,
    } });
    unlock();
  } catch {} // cancelled: the keypad stays
}

function setPin() {
  const pinField = (name, label) => ({ name, label, attrs: 'inputmode="numeric" maxlength="4" autocomplete="off" style="-webkit-text-security: disc"' });
  openSheet(lock ? 'Cambiar PIN' : 'Activar bloqueo', [pinField('pin', 'PIN de 4 números'), pinField('again', 'Escríbelo otra vez')], v => {
    if (!/^\d{4}$/.test(v.pin)) return 'El PIN son 4 números';
    if (v.pin !== v.again) return 'No coinciden; escríbelo igual las dos veces';
    const salt = uid(), first = !lock;
    hashPin(v.pin, salt).then(hash => {
      lock = { ...lock, salt, hash };
      saveLock();
      render();
      toast(first ? 'Bloqueo activado' : 'PIN cambiado');
    });
  }, { preview: () => 'Se pedirá al abrir la app y al volver a ella después de un minuto. Si lo olvidas no se puede recuperar: tendrías que borrar la app y restaurar tu respaldo.' });
}

// Back from another app after a minute or more: locked again
let hiddenAt = 0;
document.addEventListener('visibilitychange', () => {
  if (document.hidden) hiddenAt = Date.now();
  else if (Date.now() - hiddenAt >= 60e3) showLock();
});

// ---------- Actions ----------

// iOS share sheet (save to Files/iCloud Drive, open in Excel, send it anywhere), or a download elsewhere.
// Resolves true once the file is out, false if cancelled or it failed.
function shareFile(file) {
  if (navigator.canShare?.({ files: [file] })) {
    return navigator.share({ files: [file] }).then(() => true, err => {
      if (err.name !== 'AbortError') toast('No se pudo exportar', 'error');
      return false;
    });
  }
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(file), download: file.name });
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  return Promise.resolve(true);
}

function exportBackup() {
  shareFile(new File([JSON.stringify(db)], `gastos-${today()}.json`, { type: 'application/json' })).then(ok => {
    if (!ok) return;
    db.lastBackup = Date.now(); // the reminder on Home waits another week
    save();
    render();
    toast('Respaldo exportado');
  });
}

// Every expense, oldest first, as a spreadsheet
function exportCSV() {
  const rows = [...db.expenses].sort((a, b) => a.date - b.date).map(e => [
    dayKey(e.date), time(e.date), e.category, e.detail ?? '', (e.amount / 100).toFixed(2), METHODS[e.method].label,
    e.method === 'efectivo' ? '' : db.cards.find(c => c.id === e.cardId)?.name ?? e.cardName, isSpending(e) ? '' : 'Pago de tarjeta (no suma al gasto)',
  ]);
  const csv = toCSV([['Fecha', 'Hora', 'Categoría', 'Detalle', 'Monto', 'Forma de pago', 'Tarjeta', 'Nota'], ...rows]);
  shareFile(new File([csv], `gastos-${today()}.csv`, { type: 'text/csv' })).then(ok => ok && toast('Gastos exportados'));
}

const byV = v => $app.querySelector(`[data-v="${CSS.escape(v)}"]`);

// The wizard's last step filled in from a fixed or quick expense
const shortcutDraft = f => ({ step: 2, amountText: String(f.amount / 100), category: f.category, custom: !CATEGORIES[f.category],
  detail: f.detail && f.detail !== 'General' ? f.detail : '', method: f.method, cardId: db.cards.some(c => c.id === f.cardId) ? f.cardId : null });
// What a fixed or quick expense keeps from the expense it's made from
const shortcutOf = (e, card) => ({
  id: uid(), name: e.detail && e.detail !== 'General' ? e.detail : e.category, amount: e.amount, category: e.category,
  ...(e.detail && { detail: e.detail }), method: e.method, ...(card && { cardId: card.id, cardName: card.name }),
});

// Open the expense wizard, empty or with `fields` filled in
function startDraft(fields) {
  draft = { step: 0, amountText: '', category: '', detail: '', custom: false, method: null, cardId: null, date: today(), ...NO_DEBT, ...fields };
  render();
  enter([...$app.querySelectorAll('.step > *')], 40);
}

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
    db = upgrade({ name: setup.name.trim(), cards: [...cards('debito'), ...cards('credito')], expenses: [] });
    save();
    render();
    enter();
    toast(`¡Listo, ${db.name}!`);
  },
  new: () => {
    startDraft();
    $app.querySelector('input').focus(); // same tap, so iOS opens the keyboard
  },
  // From a reminder on Home: the wizard filled in, on its last step, so saving is one tap
  'pay-card': ({ v }) => {
    const debit = cardsOf('debito');
    startDraft({ step: 2, amountText: String(cardStatement(db.cards.find(c => c.id === v), db.expenses).toPay / 100),
      category: 'Deuda', debtKind: 'card', debtId: v, method: 'debito', cardId: debit.length === 1 ? debit[0].id : null });
  },
  'pay-fixed': ({ v }) => {
    const f = db.fixed.find(x => x.id === v);
    startDraft({ ...shortcutDraft(f), fixedId: f.id });
  },
  // A quick expense saves right away; if something's wrong (its card is over the limit, or gone) the wizard stays
  // open on its last step saying what
  quick: ({ v }) => {
    startDraft(shortcutDraft(db.quick.find(x => x.id === v)));
    actions.next();
  },
  'skip-fixed': async ({ v }) => {
    const f = db.fixed.find(x => x.id === v);
    f.paidMonth = monthKey(new Date());
    save();
    await animate(byV(v).closest('.reminder'), [{}, { opacity: 0, transform: 'translateX(60px)' }], { duration: 250, fill: 'forwards' });
    render();
    toast(`${f.name}: este mes no`);
  },
  'edit-shortcut': ({ v }) => editShortcut([...db.fixed, ...db.quick].find(f => f.id === v)),
  'add-category': () => editCategory(null),
  'edit-category': ({ v }) => editCategory(db.categories.find(c => c.name === v)),
  'export-csv': exportCSV,
  'pin-key': async ({ v }) => {
    pinTyped = v === 'del' ? pinTyped.slice(0, -1) : (pinTyped + v).slice(0, 4);
    const dots = document.querySelectorAll('.pin-dots i');
    dots.forEach((dot, i) => dot.classList.toggle('on', i < pinTyped.length));
    if (pinTyped.length < 4) return;
    const right = await hashPin(pinTyped, lock.salt) === lock.hash;
    pinTyped = '';
    if (right) return unlock();
    document.querySelector('.lock-title').textContent = 'PIN incorrecto';
    shake(document.querySelector('.pin-dots'));
    setTimeout(() => dots.forEach(dot => dot.classList.remove('on')), 350);
  },
  'face-id': () => faceIdUnlock(),
  'set-pin': setPin,
  'face-id-on': async () => {
    try {
      const cred = await navigator.credentials.create({ publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)), rp: { name: 'Gastos' },
        user: { id: crypto.getRandomValues(new Uint8Array(16)), name: db.name, displayName: db.name },
        pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
        authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required' }, timeout: 60000,
      } });
      lock.credId = toBase64(cred.rawId);
      saveLock();
      render();
      toast('Face ID activado');
    } catch { toast('No se activó Face ID', 'error'); }
  },
  'face-id-off': () => {
    delete lock.credId;
    saveLock();
    render();
    toast('Face ID desactivado');
  },
  'lock-off': () => {
    if (!confirm('¿Quitar el bloqueo? La app abrirá sin pedir PIN.')) return;
    lock = null;
    saveLock();
    render();
    toast('Bloqueo quitado');
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
    const fixed = db.fixed.find(f => f.id === draft.fixedId);
    if (fixed) fixed.paidMonth = monthKey(new Date()); // this month's is done
    const day = new Date(expense.date).getDate();
    const repeat = draft.repeat && !editing, quick = draft.quick && !editing;
    if (repeat) db.fixed.push({ ...shortcutOf(expense, card), day, paidMonth: monthKey(new Date(expense.date)) });
    if (quick) db.quick.push(shortcutOf(expense, card));
    save();
    closeDraft();
    render();
    if (editing) enter();
    const lines = budgetLines(expense);
    if (repeat) lines.push({ icon: 'calendar', text: `Te lo recordaré cada día ${day}` });
    if (quick) lines.push({ icon: 'zap', text: 'Guardado en tus gastos rápidos' });
    if (card?.type === 'credito' && card.limit) lines.push(`Disponible en ${card.name}: ${money(available(card))}`);
    const left = target && (target.type ? cardUsed(target, db.expenses) : debtLeft(target, db.expenses));
    if (target) lines.push(left <= 0 ? { icon: 'party-popper', text: `¡Liquidaste ${target.name}!` } : `Te quedan ${money(left)} por pagar de ${target.name}`);
    const key = budgetKey(expense.category), budget = db.budgets[key];
    const overBudget = isCashOut(expense) && budget && budgetStatus(budgetSpent(key), budget).level === 'over';
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
    const back = -goalMove(goal.saved, 0, sum(db.goalMoves.filter(m => m.goalId === goal.id)));
    if (!confirm(`¿Eliminar la meta ${goal.name}?${back ? ` Los ${money(back)} que le aportaste regresan a lo que te queda este mes.` : ''}`)) return;
    moveToGoal(goal, goal.saved, 0);
    db.goals = db.goals.filter(g => g !== goal);
    save();
    await trashFx(byV(v).closest('.goal'));
    render();
    toast(back ? `Meta eliminada · regresaron ${money(back)} a tu mes` : 'Meta eliminada');
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
  search: v => {
    filter.q = v;
    $app.querySelector('.filters').classList.toggle('searching', !!v.trim());
    $app.querySelector('.results').innerHTML = historyResults();
  },
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
  repeat: el => { draft.repeat = el.checked; },
  quick: el => { draft.quick = el.checked; },
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
showLock(); // over the app before anything shows
if (db && snapshotBudgets()) save(); // first open of the month: keep its budgets
if (db) whenUnlocked(() => setTimeout(reviewLastMonth, 700)); // once the app is on screen
