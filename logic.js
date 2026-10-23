// Pure helpers (no DOM) so they can be tested with `npm test`.

// "150", "12.5" or "12,5" -> cents (integer) to avoid float rounding in sums; null if not a positive number.
export function parseAmount(text) {
  const n = Number(String(text).trim().replace(',', '.'));
  return n > 0 && Number.isFinite(n) ? Math.round(n * 100) : null;
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

// [[key, totalCents], ...] sorted from biggest to smallest.
export function totalsBy(expenses, key) {
  const totals = new Map();
  for (const e of expenses) totals.set(key(e), (totals.get(key(e)) || 0) + e.amount);
  return [...totals].sort((a, b) => b[1] - a[1]);
}

export function validBackup(d) {
  return !!d && typeof d.name === 'string' && Array.isArray(d.cards) && Array.isArray(d.expenses)
    && d.cards.every(c => typeof c.id === 'string' && typeof c.name === 'string' && ['debito', 'credito'].includes(c.type))
    && d.expenses.every(e => typeof e.id === 'string' && Number.isInteger(e.amount) && typeof e.date === 'number'
      && typeof e.category === 'string' && (e.detail === undefined || typeof e.detail === 'string')
      && ['efectivo', 'debito', 'credito'].includes(e.method));
}
