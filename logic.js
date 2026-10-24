// Pure helpers (no DOM) so they can be tested with `npm test`.

// "150", "12.5" or "12,5" -> cents (integer) to avoid float rounding in sums. Empty -> 0, invalid or negative -> null.
export function parseMoney(text) {
  const n = Number(String(text ?? '').trim().replace(',', '.'));
  return n >= 0 && Number.isFinite(n) ? Math.round(n * 100) : null;
}

// What a money field may contain while typing: digits and one decimal point with up to 2 decimals ("12,5" -> "12.5").
export function cleanMoney(text) {
  const [int, ...rest] = String(text).replace(/[^\d.,]/g, '').split(/[.,]/);
  return rest.length ? `${int}.${rest.join('').slice(0, 2)}` : int;
}

// An expense amount: like parseMoney but must be > 0.
export const parseAmount = text => parseMoney(text) || null;

// Balances are derived from the expenses, so deleting an expense undoes its effect.
// `since` (ms) is when the balance was last typed in by hand: older expenses are already part of it.
// A balance never goes below 0: a payment bigger than what's owed (left behind by deleting the
// purchase it paid, or saved before payments were capped) just clears the debt.
const byDate = list => [...list].sort((a, b) => a.date - b.date);

// Credit in use on a card: typed balance + purchases with it − payments to it.
export function cardUsed(card, expenses) {
  let used = card.startUsed ?? 0;
  for (const e of byDate(expenses)) {
    if (e.date < (card.since ?? 0)) continue;
    if (e.method === 'credito' && e.cardId === card.id) used += e.amount;
    if (e.debtId === card.id) used = Math.max(0, used - e.amount);
  }
  return used;
}

// What is still owed on a non-card debt.
export function debtLeft(debt, expenses) {
  let left = debt.total;
  for (const e of byDate(expenses)) {
    if (e.debtId === debt.id && e.date >= (debt.since ?? 0)) left = Math.max(0, left - e.amount);
  }
  return left;
}

// [start, end) of the day/week/month `offset` periods away from `now` (0 = current, -1 = previous).
export function periodRange(period, offset, now = new Date()) {
  const y = now.getFullYear(), m = now.getMonth(), d = now.getDate();
  if (period === 'dia') return [new Date(y, m, d + offset), new Date(y, m, d + offset + 1)];
  if (period === 'semana') {
    const monday = d - (now.getDay() + 6) % 7 + offset * 7; // weeks start on Monday
    return [new Date(y, m, monday), new Date(y, m, monday + 7)];
  }
  return [new Date(y, m + offset, 1), new Date(y, m + offset + 1, 1)];
}

export function filterExpenses(expenses, { period, offset, method }, now) {
  const [from, to] = periodRange(period, offset, now);
  return expenses.filter(e => e.date >= +from && e.date < +to && (method === 'todos' || e.method === method));
}

// Cents per hour (dia) or per day (semana/mes) of the period, for the column chart.
export function timeBins(expenses, period, offset, now) {
  const [from, to] = periodRange(period, offset, now);
  const bins = Array(period === 'dia' ? 24 : Math.round((to - from) / 864e5)).fill(0); // round: DST days are 23/25h
  for (const e of expenses) {
    if (e.date < from || e.date >= to) continue;
    bins[period === 'dia' ? new Date(e.date).getHours() : Math.round((new Date(e.date).setHours(0, 0, 0, 0) - from) / 864e5)] += e.amount;
  }
  return bins;
}

// Two different questions:
// - "what did I spend on?" (categories, budgets): a credit card purchase counts; paying the card doesn't,
//   the purchases made with it already counted.
// - "how much of my income is left?": only money that actually left, so cash and debit, including paying
//   the card; a credit card purchase doesn't touch your income until you pay the card.
export const isSpending = e => !e.toCard;
export const isCashOut = e => e.method !== 'credito';

// A monthly budget: how much is used. Warns from 80%, "over" once spending passes it.
export function budgetStatus(spent, budget) {
  const pct = Math.round(spent / budget * 100);
  return { pct, left: budget - spent, level: spent > budget ? 'over' : pct >= 80 ? 'warn' : 'ok' };
}

// "2026-12-15" (from <input type="date">) as a local date; new Date(str) would read it as UTC and land a day early in Mexico.
export function localDate(str) {
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
}

// Whole days from today to `dateStr` (negative once it has passed).
export function daysUntil(dateStr, now = new Date()) {
  return Math.round((localDate(dateStr) - new Date(now.getFullYear(), now.getMonth(), now.getDate())) / 864e5);
}

// How a savings goal is going: what's left, days to the date and what to save per day to make it.
// Daily rounds up to the cent so saving it every day reaches the goal; on the last day it's everything left.
export function goalPlan(goal, now) {
  const left = Math.max(0, goal.amount - (goal.saved ?? 0));
  const days = daysUntil(goal.date, now);
  const overdue = left > 0 && days < 0;
  return { left, days, overdue, done: !left, daily: left && !overdue ? Math.ceil(left / Math.max(1, days)) : 0 };
}

// The 25/50/75% mark a goal just passed going from `before` to `after` saved (the highest if several), or null.
// Reaching 100% is the goal being done, not a milestone. Integer math, so 50% exactly counts.
export function goalMilestone(before, after, amount) {
  if (after >= amount) return null;
  return [75, 50, 25].find(m => before * 100 < m * amount && after * 100 >= m * amount) ?? null;
}

// How last month went (the month before `now`): did spending stay within every budget, and what share of
// the income was left? null when there's nothing to judge (no budgets or no spending; no income).
// shortcut: budgets are the current ones (there's no budget history); keep a monthly snapshot if that matters.
export function lastMonthResults({ expenses, incomes, budgets }, budgetKeyOf, now = new Date()) {
  const month = { period: 'mes', offset: -1, method: 'todos' };
  const total = list => list.reduce((sum, e) => sum + e.amount, 0);
  const spent = filterExpenses(expenses, month, now).filter(isSpending);
  const keys = Object.keys(budgets);
  const underBudget = keys.length && spent.length
    ? keys.every(k => total(spent.filter(e => budgetKeyOf(e.category) === k)) <= budgets[k]) : null;
  const income = total(filterExpenses(incomes, month, now));
  const out = total(filterExpenses(expenses, month, now).filter(isCashOut));
  return { underBudget, savedPct: income ? Math.round((income - out) / income * 100) : null };
}

// Days in a row, ending today, with at least one expense
export function streakDays(expenses, now = new Date()) {
  const days = new Set(expenses.map(e => new Date(e.date).toDateString()));
  let n = 0;
  while (days.has(new Date(now.getFullYear(), now.getMonth(), now.getDate() - n).toDateString())) n++;
  return n;
}

// [[key, totalCents], ...] sorted from biggest to smallest.
export function totalsBy(expenses, key) {
  const totals = new Map();
  for (const e of expenses) totals.set(key(e), (totals.get(key(e)) || 0) + e.amount);
  return [...totals].sort((a, b) => b[1] - a[1]);
}

const optional = (value, check) => value === undefined || check(value);
const isText = v => typeof v === 'string';

// Older backups have no debts, card limits or expense details; those fields are optional.
export function validBackup(d) {
  return !!d && isText(d.name) && Array.isArray(d.cards) && Array.isArray(d.expenses)
    && d.cards.every(c => isText(c.id) && isText(c.name) && ['debito', 'credito'].includes(c.type)
      && optional(c.limit, Number.isInteger) && optional(c.startUsed, Number.isInteger) && optional(c.since, Number.isFinite))
    && optional(d.debts, debts => Array.isArray(debts) && debts.every(x => isText(x.id) && isText(x.name) && Number.isInteger(x.total)
      && optional(x.since, Number.isFinite)))
    && optional(d.goals, goals => Array.isArray(goals) && goals.every(g => isText(g.id) && isText(g.name)
      && Number.isInteger(g.amount) && Number.isInteger(g.saved) && /^\d{4}-\d{2}-\d{2}$/.test(g.date)))
    && d.expenses.every(e => isText(e.id) && Number.isInteger(e.amount) && typeof e.date === 'number' && isText(e.category)
      && optional(e.detail, isText) && optional(e.debtId, isText) && optional(e.toCard, v => typeof v === 'boolean')
      && ['efectivo', 'debito', 'credito'].includes(e.method))
    && optional(d.incomes, list => Array.isArray(list) && list.every(i => isText(i.id) && isText(i.source)
      && Number.isInteger(i.amount) && typeof i.date === 'number'))
    && optional(d.budgets, b => !!b && typeof b === 'object' && !Array.isArray(b) && Object.values(b).every(Number.isInteger))
    && optional(d.lastMonthReview, v => /^\d{4}-\d{2}$/.test(v));
}
