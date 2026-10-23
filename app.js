import { parseAmount, periodRange, filterExpenses, totalsBy, timeBins, validBackup } from './logic.js';

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

// { name, cards: [{id, type, name}], expenses: [{id, amount (cents), category, method, cardId?, cardName?, date (ms)}] }
let db = JSON.parse(localStorage.getItem(KEY));
let tab = 'registrar';
let draft = null; // expense being registered
const setup = { name: '', debito: [], credito: [] };
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
const cardFace = c => `<span class="chip"></span><span><small>${METHODS[c.type].label}</small><b>${esc(c.name)}</b></span>`;
// The card's current name; falls back to the name saved with the expense if the card was deleted.
const payLabel = e => e.method === 'efectivo' ? 'Efectivo' : `${METHODS[e.method].label} · ${db.cards.find(c => c.id === e.cardId)?.name ?? e.cardName}`;
const catLabel = e => e.detail ? `${e.category} · ${e.detail}` : e.category;
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

function celebrate(e) {
  const el = Object.assign(document.createElement('div'), { className: 'success', role: 'status' });
  el.innerHTML = `<svg viewBox="0 0 52 52" aria-hidden="true"><circle cx="26" cy="26" r="24"/><path d="M15 27l7 7 15-15"/></svg>
    <b>¡Gasto registrado!</b><span>${money(e.amount)} · ${esc(catLabel(e))} · ${esc(payLabel(e))}</span>`;
  document.body.append(el);
  const close = () => { el.classList.add('out'); setTimeout(() => el.remove(), 300); };
  el.onclick = close;
  setTimeout(close, 1600);
}

// ---------- Views ----------

function render() {
  document.querySelector('.toast.error')?.remove(); // the error was about the previous screen
  $nav.hidden = !db;
  if (!db) return void ($app.innerHTML = viewSetup());
  for (const b of $nav.children) b.classList.toggle('active', b.dataset.v === tab);
  $app.innerHTML = { registrar: viewRegistrar, historial: viewHistorial, estadisticas: viewEstadisticas, perfil: viewPerfil }[tab]();
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
    ${setup[type].map((v, i) => `<input class="field" data-input="setup-card" data-type="${type}" data-i="${i}" value="${esc(v)}" placeholder="Tarjeta ${i + 1} (ej. BBVA 1234)">`).join('')}`;
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

const choice = (act, value, label, emoji, color, selected, cls = '') =>
  `<button class="choice ${cls} ${selected ? 'sel' : ''}" style="--c:${color}" data-act="${act}" data-v="${esc(value)}"><span class="ico">${emoji}</span>${esc(label)}</button>`;

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
      <p class="note">Opcional. Si lo dejas vacío se guarda como «General».</p>` : ''}`;
}

const hasDetail = () => !draft.custom && !!CATEGORIES[draft.category]?.detail;

function stepMethod() {
  const cards = cardsOf(draft.method);
  const cardList = cards.length
    ? `<div class="bank-cards">${cards.map(c => `<button class="bank-card ${draft.cardId === c.id ? 'sel' : ''}" style="${cardBg(c)}" data-act="card" data-v="${esc(c.id)}">${cardFace(c)}</button>`).join('')}</div>`
    : `<p class="note">No tienes tarjetas de ${METHODS[draft.method]?.label.toLowerCase()}. Agrégalas en Perfil.</p>`;
  return `
    <h1>¿Cómo pagaste?</h1>
    <div class="choices three">${Object.entries(METHODS).map(([k, m]) => choice('method', k, m.label, m.icon, m.color, draft.method === k)).join('')}</div>
    ${draft.method && draft.method !== 'efectivo' ? `<h2>Elige la tarjeta</h2>${cardList}` : ''}`;
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

function viewPerfil() {
  const cards = type => cardsOf(type).map(c => `
    <div class="card-wrap">
      <button class="bank-card" style="${cardBg(c)}" data-act="rename-card" data-v="${esc(c.id)}" aria-label="Renombrar ${esc(c.name)}">${cardFace(c)}</button>
      <button class="card-del" data-act="del-card" data-v="${esc(c.id)}" aria-label="Eliminar ${esc(c.name)}">${icon('M6 6l12 12M18 6L6 18')}</button>
    </div>`).join('');
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
    <p class="note">Toca una tarjeta para cambiarle el nombre.</p>
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
    if (+d > 0 && setup[type].length < 10) setup[type].push('');
    if (+d < 0) setup[type].pop();
    render();
    if (+d > 0) enter([...$app.querySelectorAll(`.field[data-type=${type}]`)].slice(-1));
  },
  'setup-done': () => {
    if (!setup.name.trim()) return showError('Escribe tu nombre');
    if ([...setup.debito, ...setup.credito].some(n => !n.trim())) return showError('Ponle un identificador a cada tarjeta');
    const cards = type => setup[type].map(name => ({ id: uid(), type, name: name.trim() }));
    db = { name: setup.name.trim(), cards: [...cards('debito'), ...cards('credito')], expenses: [] };
    save();
    render();
    enter();
    toast(`¡Listo, ${db.name}!`);
  },
  new: () => {
    draft = { step: 0, amountText: '', category: '', detail: '', custom: false, method: null, cardId: null };
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
    if (draft.step < 2) {
      draft.step++;
      render();
      enter([...$app.querySelectorAll('.step > *')], 40);
      return animate($app.querySelectorAll('.progress i')[draft.step], [{ transform: 'scaleX(0)' }, { transform: 'none' }], { duration: 400 });
    }
    if (!draft.method) return showError('Elige cómo pagaste');
    const card = db.cards.find(c => c.id === draft.cardId);
    if (draft.method !== 'efectivo' && !card) return showError('Elige una tarjeta');
    const expense = {
      id: uid(), amount: parseAmount(draft.amountText), category: draft.category.trim(),
      ...(hasDetail() && { detail: draft.detail.trim() || 'General' }),
      method: draft.method, cardId: card?.id, cardName: card?.name, date: Date.now(),
    };
    db.expenses.push(expense);
    save();
    draft = null;
    render();
    celebrate(expense);
  },
  cat: ({ v }) => {
    if (!v && draft.custom) return $app.querySelector('[data-input=cat-other]').focus();
    if (v !== draft.category) draft.detail = ''; // a detail typed for another category doesn't apply
    draft.custom = !v;
    draft.category = v;
    render();
    pop($app.querySelector('.choice.sel'));
    enter([...$app.querySelectorAll('.choices ~ *')]);
    $app.querySelector('[data-input=cat-other]')?.focus(); // "Otro" needs text; the detail is optional, so no keyboard for it
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
  'add-card': ({ v }) => {
    const name = prompt(`Identificador de la nueva tarjeta de ${METHODS[v].label.toLowerCase()}`)?.trim();
    if (!name) return;
    const card = { id: uid(), type: v, name };
    db.cards.push(card);
    save();
    render();
    pop(byV(card.id));
    toast('Tarjeta agregada');
  },
  'rename-card': ({ v }) => {
    const card = db.cards.find(c => c.id === v);
    const name = prompt('Nuevo identificador de la tarjeta', card.name)?.trim();
    if (!name || name === card.name) return;
    card.name = name;
    save();
    render();
    pop(byV(v));
    toast('Tarjeta actualizada');
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
  'setup-card': (v, { type, i }) => { setup[type][i] = v; },
  amount: v => { draft.amountText = v; },
  'cat-other': v => { draft.category = v; },
  detail: v => { draft.detail = v; },
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
    db = data;
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
document.addEventListener('input', e => inputs[e.target.dataset.input]?.(e.target.value, e.target.dataset));
document.addEventListener('change', e => changes[e.target.dataset.change]?.(e.target));

navigator.storage?.persist?.(); // ask iOS not to evict the data
navigator.serviceWorker?.register('sw.js');
applyTheme();
render();
enter();
