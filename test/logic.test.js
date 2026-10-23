import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseAmount, periodRange, filterExpenses, totalsBy, timeBins, validBackup } from '../logic.js';

test('parseAmount', () => {
  assert.equal(parseAmount('150'), 15000);
  assert.equal(parseAmount(' 12.5 '), 1250);
  assert.equal(parseAmount('12,5'), 1250);
  assert.equal(parseAmount('0.1'), 10);
  for (const bad of ['', '0', '-5', 'abc', '1.2.3']) assert.equal(parseAmount(bad), null, bad);
});

test('periodRange', () => {
  const fri = new Date(2026, 9, 23, 15); // Friday Oct 23 2026
  assert.deepEqual(periodRange('dia', 0, fri), [new Date(2026, 9, 23), new Date(2026, 9, 24)]);
  assert.deepEqual(periodRange('dia', -23, fri), [new Date(2026, 8, 30), new Date(2026, 9, 1)]);
  assert.deepEqual(periodRange('semana', 0, fri), [new Date(2026, 9, 19), new Date(2026, 9, 26)]);
  assert.deepEqual(periodRange('semana', 0, new Date(2026, 9, 25)), [new Date(2026, 9, 19), new Date(2026, 9, 26)], 'Sunday ends the week');
  assert.deepEqual(periodRange('semana', -3, fri), [new Date(2026, 8, 28), new Date(2026, 9, 5)]);
  assert.deepEqual(periodRange('mes', 0, fri), [new Date(2026, 9, 1), new Date(2026, 10, 1)]);
  assert.deepEqual(periodRange('mes', -10, fri), [new Date(2025, 11, 1), new Date(2026, 0, 1)]);
});

test('filterExpenses + totalsBy', () => {
  const now = new Date(2026, 9, 23);
  const e = (day, method, amount, category = 'Comida') => ({ date: +new Date(2026, 9, day, 12), method, amount, category });
  const list = [e(1, 'efectivo', 100), e(23, 'debito', 250, 'Deuda'), e(23, 'efectivo', 50), { ...e(1, 'credito', 999), date: +new Date(2026, 8, 30, 23) }];
  assert.equal(filterExpenses(list, { period: 'mes', offset: 0, method: 'todos' }, now).length, 3);
  assert.equal(filterExpenses(list, { period: 'mes', offset: -1, method: 'todos' }, now).length, 1);
  assert.equal(filterExpenses(list, { period: 'dia', offset: 0, method: 'efectivo' }, now).length, 1);
  assert.deepEqual(totalsBy(list.slice(0, 3), x => x.category), [['Deuda', 250], ['Comida', 150]]);
});

test('timeBins', () => {
  const now = new Date(2026, 9, 23);
  const at = (m, d, h, amount) => ({ date: +new Date(2026, m, d, h), amount });
  const list = [at(9, 1, 8, 100), at(9, 23, 8, 50), at(9, 23, 20, 25), at(9, 31, 23, 7)];
  const month = timeBins(list, 'mes', 0, now);
  assert.equal(month.length, 31);
  assert.deepEqual([month[0], month[22], month[30]], [100, 75, 7]);
  assert.equal(timeBins(list, 'mes', 1, now).length, 30, 'November');
  const week = timeBins(list, 'semana', 0, now);
  assert.deepEqual(week, [0, 0, 0, 0, 75, 0, 0], 'Friday is index 4');
  const day = timeBins(list, 'dia', 0, now);
  assert.equal(day.length, 24);
  assert.deepEqual([day[8], day[20]], [50, 25]);
});

test('validBackup', () => {
  const ok = { name: 'A', cards: [{ id: 'c', type: 'debito', name: 'BBVA' }], expenses: [{ id: 'x', amount: 100, date: 1, category: 'Comida', method: 'debito', cardId: 'c' }] };
  assert.equal(validBackup(ok), true);
  assert.equal(validBackup(null), false);
  assert.equal(validBackup({ ...ok, expenses: undefined }), false);
  assert.equal(validBackup({ ...ok, expenses: [{ ...ok.expenses[0], amount: 1.5 }] }), false);
  assert.equal(validBackup({ ...ok, cards: [{ ...ok.cards[0], type: 'otro' }] }), false);
  assert.equal(validBackup({ ...ok, expenses: [{ ...ok.expenses[0], detail: 'Uber' }] }), true);
  assert.equal(validBackup({ ...ok, expenses: [{ ...ok.expenses[0], detail: 5 }] }), false);
});
