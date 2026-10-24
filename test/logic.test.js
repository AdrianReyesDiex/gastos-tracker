import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanMoney, parseMoney, parseAmount, cardUsed, debtLeft, periodRange, filterExpenses, totalsBy, timeBins, validBackup,
  localDate, daysUntil, goalPlan, goalMilestone, isSpending, isCashOut, budgetStatus, lastMonthResults, streakDays } from '../logic.js';

test('parseAmount', () => {
  assert.equal(parseAmount('150'), 15000);
  assert.equal(parseAmount(' 12.5 '), 1250);
  assert.equal(parseAmount('12,5'), 1250);
  assert.equal(parseAmount('0.1'), 10);
  for (const bad of ['', '0', '-5', 'abc', '1.2.3']) assert.equal(parseAmount(bad), null, bad);
});

test('parseMoney allows empty and zero', () => {
  assert.equal(parseMoney(''), 0);
  assert.equal(parseMoney(undefined), 0);
  assert.equal(parseMoney('0'), 0);
  assert.equal(parseMoney('15000'), 1500000);
  for (const bad of ['-1', 'abc']) assert.equal(parseMoney(bad), null, bad);
});

test('cleanMoney keeps only numbers with up to 2 decimals', () => {
  const cases = { '1500': '1500', 'abc': '', '12a3': '123', '-5': '5', '$1,500': '1.50', '12,5': '12.5',
    '12.345': '12.34', '12.': '12.', '1.2.3': '1.23', '0.05': '0.05', '': '' };
  for (const [input, expected] of Object.entries(cases)) assert.equal(cleanMoney(input), expected, input);
});

test('cardUsed and debtLeft', () => {
  const card = { id: 'c1', type: 'credito', limit: 1000000, startUsed: 200000 };
  const debt = { id: 'd1', name: 'Préstamo', total: 500000 };
  const expenses = [
    { date: 1, amount: 30000, method: 'credito', cardId: 'c1' },                // purchase with the card
    { date: 2, amount: 10000, method: 'credito', cardId: 'other' },             // another card
    { date: 3, amount: 50000, method: 'debito', cardId: 'x', debtId: 'c1' },    // paying the card
    { date: 4, amount: 100000, method: 'efectivo', debtId: 'd1' },              // paying the loan
    { date: 5, amount: 7000, method: 'credito', cardId: 'c1', debtId: 'd1' },   // paying the loan with the card
  ];
  assert.equal(cardUsed(card, expenses), 200000 + 30000 - 50000 + 7000);
  assert.equal(cardUsed({ id: 'new' }, expenses), 0, 'no startUsed');
  assert.equal(debtLeft(debt, expenses), 500000 - 100000 - 7000);
  assert.equal(debtLeft(debt, expenses.slice(0, 3)), 500000, 'deleting the payment restores the balance');
});

test('balances never go below 0', () => {
  const card = { id: 'c1', startUsed: 122 };
  // the user's case: $1.22 in use, paid $2
  assert.equal(cardUsed(card, [{ date: 1, amount: 200, method: 'debito', debtId: 'c1' }]), 0);
  // bought 10, paid 10, then deleted the purchase: the leftover payment doesn't create credit...
  const paidOnly = [{ date: 2, amount: 1000, method: 'debito', debtId: 'c1' }];
  assert.equal(cardUsed({ id: 'c1' }, paidOnly), 0);
  // ...so a later purchase counts in full
  assert.equal(cardUsed({ id: 'c1' }, [...paidOnly, { date: 3, amount: 500, method: 'credito', cardId: 'c1' }]), 500);
  // order is by date, not by position in the list
  assert.equal(cardUsed({ id: 'c1' }, [{ date: 9, amount: 300, method: 'debito', debtId: 'c1' }, { date: 8, amount: 500, method: 'credito', cardId: 'c1' }]), 200);
  assert.equal(debtLeft({ id: 'd1', total: 500 }, [{ date: 1, amount: 900, method: 'efectivo', debtId: 'd1' }]), 0);
});

test('a balance typed by hand includes everything before it', () => {
  const purchase = { date: 100, amount: 1000, method: 'credito', cardId: 'c1' };
  const card = { id: 'c1', startUsed: 500, since: 200 }; // bought 10, then said "I owe 5"
  assert.equal(cardUsed(card, [purchase]), 500, 'the older purchase is already in the 5');
  assert.equal(cardUsed(card, []), 500, 'deleting that older purchase changes nothing');
  assert.equal(cardUsed(card, [purchase, { date: 300, amount: 500, method: 'debito', debtId: 'c1' }]), 0, 'paying the 5 leaves 0');
  const debt = { id: 'd1', total: 3000, since: 200 };
  assert.equal(debtLeft(debt, [{ date: 100, amount: 1000, method: 'efectivo', debtId: 'd1' }, { date: 300, amount: 1000, method: 'efectivo', debtId: 'd1' }]), 2000);
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

test('savings goals', () => {
  const now = new Date(2026, 9, 23, 22, 30); // late at night: still Oct 23
  assert.deepEqual(localDate('2026-12-15'), new Date(2026, 11, 15));
  assert.equal(daysUntil('2026-10-24', now), 1);
  assert.equal(daysUntil('2026-11-22', now), 30);
  assert.equal(daysUntil('2026-10-20', now), -3);

  const goal = { amount: 300000, saved: 0, date: '2026-11-22' };
  assert.equal(goalPlan(goal, now).daily, 10000, '3000 in 30 days = 100 a day');
  assert.equal(goalPlan({ ...goal, saved: 150000 }, now).daily, 5000, 'what is saved lowers the daily');
  assert.equal(goalPlan({ ...goal, amount: 100000 }, now).daily, 3334, 'rounds up to the cent');
  assert.deepEqual(goalPlan({ ...goal, saved: 300000 }, now), { left: 0, days: 30, overdue: false, done: true, daily: 0 });
  assert.equal(goalPlan({ ...goal, date: '2026-10-23' }, now).daily, 300000, 'the date is today: everything left, today');
  const late = goalPlan({ ...goal, date: '2026-10-20' }, now);
  assert.equal(late.overdue, true);
  assert.equal(late.daily, 0, 'overdue goals are out of the daily total');
});

test('goal milestones', () => {
  const goal = 300000;
  assert.equal(goalMilestone(0, 75000, goal), 25);
  assert.equal(goalMilestone(100000, 150000, goal), 50, 'exactly half counts');
  assert.equal(goalMilestone(70000, 160000, goal), 50, '23% -> 53%');
  assert.equal(goalMilestone(0, 240000, goal), 75, 'several at once: the highest');
  assert.equal(goalMilestone(160000, 200000, goal), null, '53% -> 67%: none passed');
  assert.equal(goalMilestone(200000, 300000, goal), null, 'done is not a milestone');
  assert.equal(goalMilestone(150000, 150000, goal), null, 'nothing changed');
});

test('last month results', () => {
  const now = new Date(2026, 10, 1, 9); // Nov 1st: reviewing October
  const oct = (d, x) => ({ date: +new Date(2026, 9, d, 12), ...x });
  const keyOf = c => ['Comida', 'Transporte'].includes(c) ? c : 'Otros';
  const expenses = [
    oct(3, { amount: 200000, category: 'Comida', method: 'efectivo' }),
    oct(9, { amount: 50000, category: 'Transporte', method: 'credito', cardId: 'c' }),                 // on credit: not cash out yet
    oct(20, { amount: 50000, category: 'Deuda', method: 'debito', debtId: 'c', toCard: true }),         // paying the card: cash out, not spending
    { date: +new Date(2026, 10, 1, 8), amount: 999999, category: 'Comida', method: 'efectivo' },       // November: ignored
  ];
  const incomes = [oct(1, { amount: 1000000 })];
  assert.deepEqual(lastMonthResults({ expenses, incomes, budgets: { Comida: 300000, Transporte: 50000 } }, keyOf, now), { underBudget: true, savedPct: 75 });
  assert.equal(lastMonthResults({ expenses, incomes, budgets: { Comida: 150000 } }, keyOf, now).underBudget, false);
  assert.equal(lastMonthResults({ expenses, incomes, budgets: {} }, keyOf, now).underBudget, null, 'no budgets');
  assert.equal(lastMonthResults({ expenses: [], incomes: [], budgets: { Comida: 1 } }, keyOf, now).underBudget, null, 'no spending');
  assert.equal(lastMonthResults({ expenses, incomes: [], budgets: {} }, keyOf, now).savedPct, null, 'no income');
});

test('streak of days with expenses', () => {
  const now = new Date(2026, 9, 23, 20);
  const on = (d, h = 12) => ({ date: +new Date(2026, 9, d, h), amount: 1 });
  assert.equal(streakDays([on(23), on(22), on(21, 23), on(21, 1), on(19)], now), 3, '23, 22, 21; the 20th is missing');
  assert.equal(streakDays([on(22), on(21)], now), 0, 'nothing today yet');
  assert.equal(streakDays([on(1), on(30 - 30 + 23)], now), 1);
  assert.equal(streakDays([], now), 0);
});

test('card payments are not spending; budgets', () => {
  assert.equal(isSpending({ category: 'Comida' }), true);
  assert.equal(isSpending({ category: 'Deuda', debtId: 'loan' }), true, 'paying a loan is spending');
  assert.equal(isSpending({ category: 'Deuda', debtId: 'c1', toCard: true }), false);
  // the user's case: income 4000, buy with credit -> income untouched until the card is paid
  const buyOnCredit = { amount: 100000, method: 'credito', cardId: 'c1' };
  const payTheCard = { amount: 100000, method: 'debito', debtId: 'c1', toCard: true };
  assert.equal(isCashOut(buyOnCredit), false);
  assert.equal(isCashOut(payTheCard), true);
  assert.equal(isCashOut({ amount: 5000, method: 'efectivo' }), true);
  assert.equal(isSpending(buyOnCredit) && !isSpending(payTheCard), true, 'spending counts the purchase once');
  assert.deepEqual(budgetStatus(150000, 300000), { pct: 50, left: 150000, level: 'ok' });
  assert.equal(budgetStatus(240000, 300000).level, 'warn', '80%');
  assert.equal(budgetStatus(300000, 300000).level, 'warn', 'exactly the budget is not over yet');
  assert.deepEqual(budgetStatus(330000, 300000), { pct: 110, left: -30000, level: 'over' });
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
  assert.equal(validBackup({ ...ok, cards: [{ ...ok.cards[0], limit: 100, startUsed: 0 }], debts: [{ id: 'd', name: 'X', total: 500 }] }), true);
  assert.equal(validBackup({ ...ok, cards: [{ ...ok.cards[0], limit: '100' }] }), false);
  assert.equal(validBackup({ ...ok, debts: [{ id: 'd', name: 'X' }] }), false);
  assert.equal(validBackup({ ...ok, expenses: [{ ...ok.expenses[0], debtId: 7 }] }), false);
  assert.equal(validBackup({ ...ok, goals: [{ id: 'g', name: 'Viaje', amount: 500000, saved: 0, date: '2026-12-15' }] }), true);
  assert.equal(validBackup({ ...ok, goals: [{ id: 'g', name: 'Viaje', amount: 500000, saved: 0, date: '15/12/2026' }] }), false);
  assert.equal(validBackup({ ...ok, incomes: [{ id: 'i', source: 'Quincena', amount: 800000, date: 1 }], budgets: { Comida: 300000 } }), true);
  assert.equal(validBackup({ ...ok, incomes: [{ id: 'i', source: 'Quincena', amount: '8000', date: 1 }] }), false);
  assert.equal(validBackup({ ...ok, budgets: { Comida: 'mucho' } }), false);
  assert.equal(validBackup({ ...ok, expenses: [{ ...ok.expenses[0], toCard: 'yes' }] }), false);
});
