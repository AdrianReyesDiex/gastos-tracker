import { cleanMoney, parseMoney, parseAmount, cardUsed, debtLeft, periodRange, filterExpenses, totalsBy, timeBins, validBackup,
  localDate, daysUntil, goalPlan } from './logic.js';

const KEY = 'gastos-v1';
const THEME_KEY = 'gastos-tema';
const THEMES = {
  indigo: { name: 'Índigo', brand: 'linear-gradient(135deg, #6366f1, #8b5cf6 55%, #d946ef)', accent: 'light-dark(#4f46e5, #818cf8)', glow: 'rgba(139, 92, 246, .35)' },
  oceano: { name: 'Océano', brand: 'linear-gradient(135deg, #0891b2, #2563eb 60%, #4f46e5)', accent: 'light-dark(#0369a1, #38bdf8)', glow: 'rgba(37, 99, 235, .35)' },
  esmeralda: { name: 'Esmeralda', brand: 'linear-gradient(135deg, #059669, #047857 50%, #115e59)', accent: 'light-dark(#047857, #34d399)', glow: 'rgba(16, 185, 129, .35)' },
  atardecer: { name: 'Atardecer', brand: 'linear-gradient(135deg, #ea580c, #dc2626 55%, #be123c)', accent: 'light-dark(#c2410c, #fb923c)', glow: 'rgba(249, 115, 22, .35)' },
  rosa: { name: 'Rosa', brand: 'linear-gradient(135deg, #db2777, #be185d 50%, #9d174d)', accent: 'light-dark(#be185d, #f472b6)', glow: 'rgba(236, 72, 153, .35)' },
  grafito: { name: 'Grafito', brand: 'linear-gradient(135deg, #475569, #1e293b 60%, #0f172a)', accent: 'light-dark(#334155, #cbd5e1)', glow: 'rgba(15, 23, 42, .3)' },
};
const SCHEMES = { '': 'Automático', light: 'Claro', dark: 'Oscuro' }; // values are CSS color-scheme ('' = follow the iPhone)
// `c` is the chart color slot (--cat-1..5); custom categories all share slot 5.
const CATEGORIES = {
  Comida: { icon: '🍔', c: 2 },
  Transporte: { icon: '🚗', c: 1, detail: '¿Qué fue? (ej. Uber, gasolina)' }, // `detail`: optional free text, "General" if left empty
  Servicio: { icon: '💡', c: 3, detail: '¿Qué servicio? (ej. luz, internet)' },
  Deuda: { icon: '💸', c: 4 },
};
const OTHER = { icon: '✏️', c: 5 };
const catOf = name => CATEGORIES[name] ?? OTHER;
const METHODS = {
  efectivo: { label: 'Efectivo', icon: '💵', color: '#34c759' },
  debito: { label: 'Débito', icon: '💳', color: '#0a84ff' },
  credito: { label: 'Crédito', icon: '🏦', color: '#a855f7' },
};
const GRADIENTS = {
  debito: ['#2563eb, #06b6d4', '#059669, #10b981', '#0ea5e9, #6366f1'],
  credito: ['#1f2937, #4b5563', '#7c3aed, #db2777', '#ea580c, #e11d48'],
};

const $app = document.getElementById('app');
const $nav = document.querySelector('nav');

// { name, cards: [{id, type, name, limit?, startUsed?, since?}], debts: [{id, name, total, since?}],
//   expenses: [{id, amount (cents), category, detail?, debtId?, method, cardId?, cardName?, date (ms)}] }
// Money is in cents. A "Deuda" expense pays the card or debt in `debtId`.
let db = JSON.parse(localStorage.getItem(KEY));
// goals: [{id, name, amount, saved, date: 'YYYY-MM-DD'}]
const upgrade = data => { data.debts ??= []; data.goals ??= []; return data; }; // data saved before debts/goals existed
if (db) upgrade(db);
let tab = 'registrar';
let draft = null; // expense being registered
const setup = { name: '', debito: [], credito: [] }; // card entries: { name, limit, used } as typed
const filter = { period: 'mes', offset: 0, method: 'todos' };
const theme = { color: 'indigo', scheme: '', ...JSON.parse(localStorage.getItem(THEME_KEY)) };

function applyTheme() {
  const t = THEMES[theme.color] ?? THEMES.indigo, root = document.documentElement.style;
  root.colorScheme = theme.scheme;
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
const icon = d => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d}"/></svg>`;
const cardsOf = type => db.cards.filter(c => c.type === type);
const cardBg = c => `--g: linear-gradient(135deg, ${GRADIENTS[c.type][cardsOf(c.type).indexOf(c) % 3]})`;
const available = c => c.limit - cardUsed(c, db.expenses);
const cardFace = (c, sub = c.type === 'debito' ? 'Débito' : c.limit ? `Disponible ${money(available(c))}` : 'Crédito · sin límite') =>
  `<span class="chip"></span><span><small>${sub}</small><b>${esc(c.name)}</b></span>`;
const cardButton = (c, act, selected, sub, disabled) =>
  `<button class="bank-card ${selected ? 'sel' : ''}" style="${cardBg(c)}" data-act="${act}" data-v="${esc(c.id)}" ${disabled ? 'disabled' : ''}>${cardFace(c, sub)}</button>`;
const owedOnCard = c => cardUsed(c, db.expenses);
// The card's current name; falls back to the name saved with the expense if the card was deleted.
const payLabel = e => e.method === 'efectivo' ? 'Efectivo' : `${METHODS[e.method].label} · ${db.cards.find(c => c.id === e.cardId)?.name ?? e.cardName}`;
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
const leave = el => animate(el, [{}, { opacity: 0, transform: 'translateX(-60px)' }], { duration: 250, easing: 'ease-in', fill: 'forwards' });

function toast(msg, type = 'ok') {
  document.querySelector('.toast')?.remove();
  const t = Object.assign(document.createElement('div'), { className: `toast ${type}`, role: 'status' });
  t.innerHTML = `<i aria-hidden="true">${type === 'ok' ? '✓' : '!'}</i>${esc(msg)}`;
  document.body.append(t);
  animate(t, [{ opacity: 0, transform: 'translateY(-16px) scale(.5)' }, { opacity: 1, transform: 'none' }], { duration: 500, easing: SPRING });
  setTimeout(() => animate(t, [{}, { opacity: 0, transform: 'translateY(-12px) scale(.8)' }], { duration: 250, fill: 'forwards' }).then(() => t.remove()), 2200);
}

function showError(msg) {
  toast(msg, 'error');
  animate($app.querySelector('.primary'), [0, -8, 8, -5, 5, 0].map(x => ({ transform: `translateX(${x}px)` })), { duration: 380 });
}

function celebrate(title, text, lines = []) {
  const el = Object.assign(document.createElement('div'), { className: 'success', role: 'status' });
  el.innerHTML = `<svg viewBox="0 0 52 52" aria-hidden="true"><circle cx="26" cy="26" r="24"/><path d="M15 27l7 7 15-15"/></svg>
    <b>${esc(title)}</b><span>${esc(text)}</span>
    ${lines.map(l => `<span class="success-line">${esc(l)}</span>`).join('')}`;
  document.body.append(el);
  const close = () => { el.classList.add('out'); setTimeout(() => el.remove(), 300); };
  el.onclick = close;
  setTimeout(close, lines.length ? 2600 : 1600); // longer when there are balances to read
}

// Small form in a native <dialog>; onSave returns an error message to keep it open.
// `preview(values)` (optional) returns HTML shown under the fields while typing.
function openSheet(title, fields, onSave, preview) {
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
    </form>`;
  d.querySelector('.secondary').onclick = () => d.close();
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
    Object.assign(g, { name, amount, saved, date: v.date });
    if (!goal) db.goals.push(g);
    save();
    render();
    pop(byV(g.id));
    const plan = goalPlan(g);
    if (goal) toast('Meta actualizada');
    else celebrate('¡Meta creada!', `${name} · ${money(amount)}`, plan.done ? [] : [`Ahorra ${money(plan.daily)} al día durante ${daysText(plan.days)}`]);
  }, v => {
    const amount = parseAmount(v.amount), saved = parseMoney(v.saved) ?? 0;
    if (!amount || !v.date || daysUntil(v.date) < 1) return '';
    const plan = goalPlan({ amount, saved, date: v.date });
    return plan.done ? '✓ Ya tienes todo ahorrado' : `💡 Tendrás que ahorrar <b>${money(plan.daily)}</b> al día durante ${daysText(plan.days)}`;
  });
}

function addToGoal(goal) {
  const { left } = goalPlan(goal);
  openSheet(`Abonar a ${goal.name}`, [{ name: 'amount', label: `¿Cuánto ahorraste? Te faltan ${money(left)}`, money: true }], v => {
    const amount = parseAmount(v.amount);
    if (!amount) return 'Escribe cuánto ahorraste';
    if (amount > left) return `Solo te faltan ${money(left)}`;
    goal.saved += amount;
    save();
    render();
    pop(byV(goal.id));
    const plan = goalPlan(goal);
    if (plan.done) celebrate('¡Meta cumplida!', `${goal.name} · ${money(goal.amount)}`);
    else toast(plan.overdue ? 'Ahorro agregado' : `Ahorro agregado · ahora ${money(plan.daily)} al día`);
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
}

function viewSetup() {
  const section = type => `
    <h2>${METHODS[type].icon} Tarjetas de ${METHODS[type].label.toLowerCase()}</h2>
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
    <div class="welcome"><span class="avatar">💸</span><h1>Bienvenido</h1><p class="muted">Configura tu app en un minuto.</p></div>
    <h2>👤 Tu nombre</h2>
    <input class="field" data-input="setup-name" value="${esc(setup.name)}" placeholder="¿Cómo te llamas?" autocomplete="given-name">
    ${section('debito')}
    ${section('credito')}
    <button class="primary" data-act="setup-done">Comenzar</button>`;
}

function viewRegistrar() {
  if (!draft) return `
    <p class="muted date">${fmtDate(Date.now(), { weekday: 'long', day: 'numeric', month: 'long' })}</p>
    <h1>Hola, ${esc(db.name)} 👋</h1>
    <button class="hero" data-act="new">
      <span class="plus">${icon('M12 5v14M5 12h14')}</span>
      <b>Registrar gasto</b>
      <small>Toca aquí para anotar lo que gastaste</small>
    </button>`;
  return `
    <div class="wizard-head">
      <button class="icon-btn" data-act="back" aria-label="${draft.step ? 'Atrás' : 'Cancelar'}">${icon(draft.step ? 'M15 5l-7 7 7 7' : 'M6 6l12 12M18 6L6 18')}</button>
      <div class="progress">${[0, 1, 2].map(i => `<i class="${i <= draft.step ? 'on' : ''}"></i>`).join('')}</div>
    </div>
    <div class="step">${[stepAmount, stepCategory, stepMethod][draft.step]()}</div>
    <button class="primary" data-act="next">${draft.step === 2 ? 'Guardar gasto' : 'Siguiente'}</button>`;
}

const choice = (act, value, label, emoji, color, selected, cls = '', sub = '') =>
  `<button class="choice ${cls} ${selected ? 'sel' : ''}" style="--c:${color}" data-act="${act}" data-v="${esc(value)}"><span class="ico">${emoji}</span><span>${esc(label)}${sub ? `<small>${esc(sub)}</small>` : ''}</span></button>`;

function stepAmount() {
  return `
    <h1>¿Cuánto gastaste?</h1>
    <label class="amount"><span>$</span><input data-input="amount" inputmode="decimal" placeholder="0" value="${esc(draft.amountText)}" aria-label="Cantidad"></label>
    <p class="muted center">Escribe la cantidad en pesos</p>`;
}

function stepCategory() {
  return `
    <h1>¿En qué?</h1>
    <div class="choices">
      ${Object.entries(CATEGORIES).map(([name, m]) => choice('cat', name, name, m.icon, `var(--cat-${m.c})`, !draft.custom && draft.category === name)).join('')}
      ${choice('cat', '', 'Otro', OTHER.icon, `var(--cat-${OTHER.c})`, draft.custom, 'wide')}
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
  const debts = db.debts.filter(d => debtLeft(d, db.expenses) > 0);
  const cardList = cards.length
    ? `<div class="bank-cards">${cards.map(c => {
      const owed = owedOnCard(c);
      return cardButton(c, 'debt', draft.debtId === c.id, owed ? `Debes ${money(owed)}` : 'Sin deuda', !owed);
    }).join('')}</div>
    ${cards.some(owedOnCard) ? '' : '<p class="note">Ninguna de tus tarjetas de crédito tiene deuda por pagar.</p>'}`
    : '<p class="note">No tienes tarjetas de crédito. Agrégalas en Perfil.</p>';
  const debtList = `
    <div class="choices">
      ${debts.map(d => choice('debt', d.id, d.name, '📄', 'var(--cat-4)', draft.debtId === d.id, '', `Debes ${money(debtLeft(d, db.expenses))}`)).join('')}
      ${choice('debt', 'new', 'Nueva deuda', '➕', 'var(--cat-4)', draft.debtId === 'new', 'wide')}
    </div>
    ${draft.debtId === 'new' ? `
      <input class="field" data-input="debt-name" value="${esc(draft.newDebtName)}" placeholder="Nombre (ej. Préstamo de Juan)">
      <input class="field" data-input="debt-total" inputmode="decimal" value="${esc(draft.newDebtTotal)}" placeholder="¿Cuánto debes en total? $">` : ''}`;
  return `
    <div class="debt-picker">
      <h2>¿Qué deuda pagas?</h2>
      ${segmented('debt-kind', 'kind', { card: '💳 Tarjeta de crédito', debt: '📄 Otra deuda' }, draft.debtKind)}
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
  return debt ? debtLeft(debt, db.expenses) : null;
}

// Abono vs. liquidar: the amount typed in step 1 decides; "Liquidar todo" sets it to the full balance.
// Paying more than what's owed isn't allowed (next() blocks it), so the note offers to fix the amount.
function debtNote() {
  const owed = debtOwed(), pay = parseAmount(draft.amountText);
  if (owed === null) return '';
  if (owed === 0) return '<span class="warn">No hay deuda por pagar</span>';
  if (pay === owed) return '✓ Con este pago liquidas la deuda';
  const liquidar = `<button class="link" data-act="liquidar">Liquidar todo (${money(owed)})</button>`;
  if (pay > owed) return `<span class="warn">⚠️ Pagas ${money(pay - owed)} de más; lo máximo es ${money(owed)}.</span>${liquidar}`;
  return `Abono de ${money(pay)} · te quedarán ${money(owed - pay)}${liquidar}`;
}

function stepMethod() {
  const cards = cardsOf(draft.method);
  const cardList = cards.length
    ? `<div class="bank-cards">${cards.map(c => cardButton(c, 'card', draft.cardId === c.id)).join('')}</div>`
    : `<p class="note">No tienes tarjetas de ${METHODS[draft.method]?.label.toLowerCase()}. Agrégalas en Perfil.</p>`;
  const over = overLimit();
  const methods = payingCard() ? { debito: METHODS.debito } : METHODS;
  return `
    <h1>¿Cómo pagaste?</h1>
    ${payingCard() ? '<p class="note">Las tarjetas de crédito solo se pagan con una tarjeta de débito.</p>' : `
      <div class="choices three">${Object.entries(methods).map(([k, m]) => choice('method', k, m.label, m.icon, m.color, draft.method === k)).join('')}</div>`}
    ${draft.method && draft.method !== 'efectivo' ? `<h2>Elige la tarjeta</h2>${cardList}` : ''}
    ${over > 0 ? `<p class="note warn">⚠️ Este gasto supera tu disponible por ${money(over)}</p>` : ''}`;
}

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
        <button data-act="shift" data-d="-1" aria-label="Periodo anterior">‹</button>
        <span>${periodLabel()}</span>
        <button data-act="shift" data-d="1" aria-label="Periodo siguiente" ${filter.offset >= 0 ? 'disabled' : ''}>›</button>
      </div>
      ${segmented('filter', 'method', { todos: 'Todos', efectivo: 'Efectivo', debito: 'Débito', credito: 'Crédito' }, filter.method)}
    </div>`;
}

const summary = list => `
  <div class="summary">
    <div><small>Total</small><b>${money(sum(list))}</b></div>
    <div><small>Gastos</small><b>${list.length}</b></div>
  </div>`;
const emptyState = '<p class="empty"><span>🧾</span>Sin gastos en este periodo</p>';

function viewHistorial() {
  const list = filterExpenses(db.expenses, filter).sort((a, b) => b.date - a.date);
  const row = e => `
    <button class="tx" data-act="del-expense" data-v="${esc(e.id)}">
      <span class="ico" style="--c:var(--cat-${catOf(e.category).c})">${catOf(e.category).icon}</span>
      <span class="tx-main"><b>${esc(catLabel(e))}</b><small>${esc(payLabel(e))} · ${time(e.date)}</small></span>
      <span class="tx-amount">${money(e.amount)}</span>
    </button>`;
  const days = [...Map.groupBy(list, e => new Date(e.date).toDateString()).values()];
  return `
    <h1>Historial</h1>
    ${viewFilters()}
    ${summary(list)}
    ${list.length ? days.map(g => `<h2>${dayLabel(g[0].date)}</h2><div class="tx-list">${g.map(row).join('')}</div>`).join('')
      + '<p class="note center">Toca un gasto para eliminarlo</p>' : emptyState}`;
}

function viewEstadisticas() {
  const list = filterExpenses(db.expenses, filter);
  const total = sum(list);
  const pct = cents => `${Math.round(cents / total * 100)}%`;
  const top = list.reduce((max, e) => e.amount > max.amount ? e : max, list[0]);
  const legend = ([name, cents]) => `
    <div class="legend-row" style="--c:var(--cat-${catOf(name).c})">
      <span class="dot"></span><span class="name">${catOf(name).icon} ${esc(name)}</span><b>${money(cents)}</b><small>${pct(cents)}</small>
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
    done ? '🎉 ¡Meta cumplida!'
    : overdue ? `<span class="warn">La fecha ya pasó · te faltan ${money(left)}</span>`
    : `<b>${money(daily)}</b> al día · ${days === 0 ? 'hoy es la fecha' : `faltan ${daysText(days)}`}`;
  const card = p => `
    <div class="goal">
      <button class="goal-main" data-act="edit-goal" data-v="${esc(p.g.id)}">
        <span class="goal-head">
          <span class="ico" style="--c:var(--accent)">${p.done ? '🏆' : '🎯'}</span>
          <span><b>${esc(p.g.name)}</b><small>Meta ${money(p.g.amount)} · ${fmtDate(localDate(p.g.date), { day: 'numeric', month: 'short', year: 'numeric' })}</small></span>
        </span>
        <span class="goal-daily">${status(p)}</span>
        ${meter(p.g.saved, p.g.amount)}
        <small>Llevas ${money(p.g.saved)} de ${money(p.g.amount)} (${Math.floor(p.g.saved / p.g.amount * 100)}%)</small>
      </button>
      <div class="goal-actions">
        ${p.done ? '' : `<button class="link" data-act="save-goal" data-v="${esc(p.g.id)}">+ Abonar</button>`}
        <button class="icon-btn danger" data-act="del-goal" data-v="${esc(p.g.id)}" aria-label="Eliminar ${esc(p.g.name)}">${icon('M6 6l12 12M18 6L6 18')}</button>
      </div>
    </div>`;
  return `
    <h1>Ahorros y metas</h1>
    ${active.length ? `
      <div class="summary">
        <div><small>${active.length > 1 ? `Para cumplir tus ${active.length} metas` : 'Para cumplir tu meta'} ahorra</small><b>${money(totalDaily)} al día</b></div>
      </div>` : ''}
    ${plans.length ? `<h2>Tus metas</h2>${plans.map(card).join('')}` : '<p class="empty"><span>🎯</span>Aún no tienes metas de ahorro</p>'}
    <button class="primary" data-act="add-goal">+ Nueva meta</button>
    ${plans.length ? '<p class="note center">Toca una meta para editarla</p>' : ''}`;
}

function viewPerfil() {
  const cards = type => cardsOf(type).map(c => {
    const used = cardUsed(c, db.expenses);
    return `
      <div class="card-wrap">
        ${cardButton(c, 'edit-card', false)}
        <button class="card-del" data-act="del-card" data-v="${esc(c.id)}" aria-label="Eliminar ${esc(c.name)}">${icon('M6 6l12 12M18 6L6 18')}</button>
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
        <button class="icon-btn danger" data-act="del-debt" data-v="${esc(d.id)}" aria-label="Eliminar ${esc(d.name)}">${icon('M6 6l12 12M18 6L6 18')}</button>
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
      <h2>${METHODS[t].icon} Tarjetas de ${METHODS[t].label.toLowerCase()}</h2>
      <div class="bank-cards">${cards(t)}<button class="add-card" data-act="add-card" data-v="${t}">+ Agregar</button></div>`).join('')}
    <p class="note">Toca una tarjeta para editar su nombre, límite y saldo en uso.</p>
    <h2>📄 Otras deudas</h2>
    <div class="debt-list">${db.debts.map(debtRow).join('')}<button class="add-debt" data-act="add-debt">+ Agregar deuda</button></div>
    <h2>🎨 Tema</h2>
    <div class="themes">${Object.entries(THEMES).map(([k, t]) => `
      <button class="theme ${theme.color === k ? 'sel' : ''}" data-act="theme" data-k="color" data-v="${k}"><span style="background:${t.brand}"></span>${t.name}</button>`).join('')}</div>
    ${segmented('theme', 'scheme', SCHEMES, theme.scheme)}
    <h2>💾 Respaldo</h2>
    <div class="tiles">
      <button class="tile" data-act="export"><span>📤</span>Exportar</button>
      <label class="tile"><span>📥</span>Restaurar<input type="file" accept=".json,application/json" data-change="import" hidden></label>
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
    db = { name: setup.name.trim(), cards: [...cards('debito'), ...cards('credito')], debts: [], goals: [], expenses: [] };
    save();
    render();
    enter();
    toast(`¡Listo, ${db.name}!`);
  },
  new: () => {
    draft = { step: 0, amountText: '', category: '', detail: '', custom: false, method: null, cardId: null, ...NO_DEBT };
    render();
    enter([...$app.querySelectorAll('.step > *')], 40);
    $app.querySelector('input').focus(); // same tap, so iOS opens the keyboard
  },
  back: () => {
    if (draft.step) draft.step--;
    else draft = null;
    render();
    enter(draft ? [...$app.querySelectorAll('.step > *')] : undefined, draft ? -40 : 0);
  },
  next: () => {
    if (draft.step === 0 && !parseAmount(draft.amountText)) return showError('Escribe una cantidad mayor a 0');
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
    const expense = {
      id: uid(), amount: parseAmount(draft.amountText), category: draft.category.trim(),
      ...(hasDetail() && { detail: draft.detail.trim() || 'General' }),
      ...(target && { detail: target.name, debtId: target.id }),
      method: draft.method, cardId: card?.id, cardName: card?.name, date: Date.now(),
    };
    db.expenses.push(expense);
    save();
    draft = null;
    render();
    const lines = [];
    if (card?.type === 'credito' && card.limit) lines.push(`Disponible en ${card.name}: ${money(available(card))}`);
    if (target) {
      const left = target.type ? cardUsed(target, db.expenses) : debtLeft(target, db.expenses);
      lines.push(left <= 0 ? `🎉 ¡Liquidaste ${target.name}!` : `Te quedan ${money(left)} por pagar de ${target.name}`);
    }
    celebrate('¡Gasto registrado!', `${money(expense.amount)} · ${catLabel(expense)} · ${payLabel(expense)}`, lines);
  },
  cat: ({ v }) => {
    if (!v && draft.custom) return $app.querySelector('[data-input=cat-other]').focus();
    // Whatever was typed or picked for another category doesn't apply
    if (v !== draft.category) Object.assign(draft, { detail: '', ...NO_DEBT });
    draft.custom = !v;
    draft.category = v;
    render();
    pop($app.querySelector('.choice.sel'));
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
  },
  card: ({ v }) => {
    draft.cardId = v;
    render();
    pop($app.querySelector('.bank-card.sel'));
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
  'del-expense': async ({ v }) => {
    const e = db.expenses.find(x => x.id === v);
    if (!confirm(`¿Eliminar ${catLabel(e)} de ${money(e.amount)}?`)) return;
    db.expenses = db.expenses.filter(x => x !== e);
    save();
    await leave(byV(v));
    render();
    toast('Gasto eliminado');
  },
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
    await leave(byV(v).closest('.goal'));
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
    await leave(byV(v).closest('.debt-row'));
    render();
    toast('Deuda eliminada');
  },
  'del-card': async ({ v }) => {
    const card = db.cards.find(c => c.id === v);
    if (!confirm(`¿Eliminar la tarjeta ${card.name}? Los gastos que hiciste con ella se conservan.`)) return;
    db.cards = db.cards.filter(c => c !== card);
    save();
    await leave(byV(v).parentElement);
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

navigator.storage?.persist?.(); // ask iOS not to evict the data
navigator.serviceWorker?.register('sw.js');
applyTheme();
render();
enter();
