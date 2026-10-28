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
// - "what did I spend on?" (history, statistics): a credit card purchase counts; paying the card doesn't,
//   the purchases made with it already counted.
// - "how much money is left?" (income left, budgets): only money that actually left, so cash and debit,
//   including paying the card (in the Deuda budget); a credit card purchase doesn't touch them until then.
export const isSpending = e => !e.toCard;
export const isCashOut = e => e.method !== 'credito';

// A monthly budget: how much is used. Warns from 80%, "over" once spending passes it.
export function budgetStatus(spent, budget) {
  const pct = Math.round(spent / budget * 100);
  return { pct, left: budget - spent, level: spent > budget ? 'over' : pct >= 80 ? 'warn' : 'ok' };
}

// Money moved into a goal when its saved amount goes from `before` to `after`: positive leaves your month, negative
// comes back to it, but never more than went in through the app (`tracked`; older savings never left your month).
export const goalMove = (before, after, tracked) => Math.max(after - before, -tracked);

// A budget per week as per month or back (52 weeks in 12 months), rounded to whole pesos: a budget needs no cents.
export function convertBudget(cents, from, to) {
  if (from === to) return cents;
  return Math.round(cents * (from === 'semana' ? 52 / 12 : 12 / 52) / 100) * 100;
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
// `budgets`: the ones that month had (the app keeps a snapshot per month), per month.
export function lastMonthResults({ expenses, incomes, budgets }, budgetKeyOf, now = new Date()) {
  const month = { period: 'mes', offset: -1, method: 'todos' };
  const total = list => list.reduce((sum, e) => sum + e.amount, 0);
  const spent = filterExpenses(expenses, month, now).filter(isCashOut);
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

// A category name the user types: letters, numbers, spaces, dots and dashes, up to 20 (safe anywhere in the page)
export const validCategoryName = name => /^[\p{L}\p{N}][\p{L}\p{N} .-]{0,19}$/u.test(name);

// Search: lowercase without accents, so "credito" finds "Crédito"
const fold = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
// Does every word of `query` appear somewhere in `fields`?
export function matches(query, fields) {
  const text = fold(fields.join(' '));
  return fold(query).split(/\s+/).filter(Boolean).every(word => text.includes(word));
}

// Per name, this period's total against the previous one (both [[name, cents]] from totalsBy), biggest change first.
// `pct` is null when there was nothing before to compare with.
export function compareTotals(now, before) {
  const was = new Map(before), is = new Map(now);
  return [...new Set([...is.keys(), ...was.keys()])]
    .map(name => {
      const a = is.get(name) ?? 0, b = was.get(name) ?? 0;
      return { name, now: a, before: b, diff: a - b, pct: b ? Math.round((a - b) / b * 100) : null };
    })
    .filter(r => r.diff)
    .sort((x, y) => Math.abs(y.diff) - Math.abs(x.diff));
}

// Rows as CSV for Excel: fields with a comma, quote or line break get quoted; the BOM makes Excel read accents as UTF-8.
export const toCSV = rows => '﻿' + rows.map(row => row.map(value => {
  const v = String(value ?? '');
  return /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}).join(',')).join('\r\n');

// ---------- Reminders: shown when the app opens (a web app can't notify at a set time) ----------

export const BACKUP_DAYS = 7;
// Days since the last backup (or since the oldest expense, if never) once it's time for another one, else 0.
export function backupAge({ lastBackup, expenses }, now = Date.now()) {
  if (!expenses.length) return 0; // nothing to lose yet
  const days = Math.floor((now - (lastBackup ?? Math.min(...expenses.map(e => e.date)))) / 864e5);
  return days >= BACKUP_DAYS ? days : 0;
}

export const monthKey = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
// Day `day` of a month, or its last day when the month is shorter (the 31st of February is the 28th or 29th)
const dayOfMonth = (y, m, day) => new Date(y, m, Math.min(day, new Date(y, m + 1, 0).getDate()));

// Fixed expenses (rent, Netflix...) whose day this month has come and that aren't registered or skipped this month yet
export function dueFixed(fixed, now = new Date()) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return fixed.filter(f => f.paidMonth !== monthKey(now) && dayOfMonth(now.getFullYear(), now.getMonth(), f.day) <= today);
}

// A credit card's latest statement: its last cut-off (on or before today), what was owed at the end of that day minus
// what's been paid since, and the deadline to pay it without interest (the first payment day after the cut).
// shortcut: a balance typed by hand after the cut counts as all statement debt; fine until that matters.
export function cardStatement(card, expenses, now = new Date()) {
  const y = now.getFullYear(), m = now.getMonth(), today = new Date(y, m, now.getDate());
  let cut = dayOfMonth(y, m, card.cutDay);
  if (cut > today) cut = dayOfMonth(y, m - 1, card.cutDay);
  let due = dayOfMonth(cut.getFullYear(), cut.getMonth(), card.payDay);
  if (due <= cut) due = dayOfMonth(cut.getFullYear(), cut.getMonth() + 1, card.payDay);
  const end = +new Date(cut.getFullYear(), cut.getMonth(), cut.getDate() + 1); // the cut-off day's purchases are in it
  const owed = cardUsed(card, expenses.filter(e => e.date < end));
  const paid = expenses.filter(e => e.debtId === card.id && e.date >= end).reduce((total, e) => total + e.amount, 0);
  const toPay = Math.min(Math.max(0, owed - paid), cardUsed(card, expenses)); // never more than owed today
  return { cut, due, toPay, daysLeft: Math.round((due - today) / 864e5) };
}

const optional = (value, check) => value === undefined || check(value);
const isText = v => typeof v === 'string';
const isDay = v => Number.isInteger(v) && v >= 1 && v <= 31;
const isObject = v => !!v && typeof v === 'object' && !Array.isArray(v);
// A saved expense to repeat (fixed or quick): what the wizard needs to register it again
const isShortcut = f => isText(f.id) && isText(f.name) && Number.isInteger(f.amount) && isText(f.category)
  && ['efectivo', 'debito', 'credito'].includes(f.method);

// Older backups have no debts, card limits or expense details; those fields are optional.
export function validBackup(d) {
  return !!d && isText(d.name) && Array.isArray(d.cards) && Array.isArray(d.expenses)
    && d.cards.every(c => isText(c.id) && isText(c.name) && ['debito', 'credito'].includes(c.type)
      && optional(c.limit, Number.isInteger) && optional(c.startUsed, Number.isInteger) && optional(c.since, Number.isFinite)
      && optional(c.cutDay, isDay) && optional(c.payDay, isDay))
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
    && optional(d.budgetPeriod, v => ['semana', 'mes'].includes(v))
    && optional(d.goalMoves, list => Array.isArray(list) && list.every(m => isText(m.goalId) && Number.isInteger(m.amount) && Number.isFinite(m.date)))
    && optional(d.fixed, list => Array.isArray(list) && list.every(f => isShortcut(f) && isDay(f.day)
      && optional(f.paidMonth, v => /^\d{4}-\d{2}$/.test(v))))
    && optional(d.quick, list => Array.isArray(list) && list.every(isShortcut))
    && optional(d.budgetHistory, h => isObject(h) && Object.entries(h).every(([month, b]) => /^\d{4}-\d{2}$/.test(month)
      && isObject(b) && isObject(b.budgets) && Object.values(b.budgets).every(Number.isInteger) && ['semana', 'mes'].includes(b.period)))
    && optional(d.lastBackup, Number.isFinite)
    && optional(d.categories, list => Array.isArray(list) && list.every(c => isText(c.name) && validCategoryName(c.name) && isText(c.icon)
      && Number.isInteger(c.c) && c.c >= 1 && c.c <= 8 && optional(c.detail, isText)))
    && optional(d.lastMonthReview, v => /^\d{4}-\d{2}$/.test(v));
}
