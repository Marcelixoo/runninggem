import test from 'node:test';
import assert from 'node:assert/strict';
import { addDays, weekStart, inWeek, summarize, loadLogs, workouts, isComplete } from '../src/model.js';

test('Monday-based weeks span months without shifting dates', () => {
  assert.equal(weekStart('2026-11-01'), '2026-10-26');
  assert.equal(addDays('2026-10-30', 3), '2026-11-02');
  assert.equal(addDays('2026-01-01', -1), '2025-12-31');
  assert.equal(weekStart('2026-11-02'), '2026-11-02');
});
test('week totals exclude next Monday and uncompleted work', () => {
  const week = inWeek(workouts, '2026-10-26');
  assert.equal(week.length, 4);
  assert.deepEqual(summarize(week, {}), { km: 12, minutes: 75, activities: 2 });
});
test('completion overrides update all totals, including non-running sessions', () => {
  const week = inWeek(workouts, '2026-10-26');
  const logs = { 'strength-30': { completed: true }, 'easy-27': { completed: false } };
  assert.deepEqual(summarize(week, logs), { km: 7, minutes: 77, activities: 2 });
  assert.equal(isComplete(workouts.find(w=>w.id==='easy-27'),logs), false);
});
test('empty future weeks produce zero totals', () => {
  assert.deepEqual(summarize(inWeek(workouts,'2027-01-04'),{}), { km:0, minutes:0, activities:0 });
});
test('stored data is validated and corrupt/unavailable storage is recoverable', () => {
  const store = value => ({ getItem:()=>value });
  assert.deepEqual(loadLogs(store('{broken')), {});
  assert.deepEqual(loadLogs(store('null')), {});
  assert.deepEqual(loadLogs(store('[]')), {});
  assert.deepEqual(loadLogs({getItem(){throw new Error('blocked');}}), {});
  const valid = { a:{completed:true, effort:4,note:'steady'}, bad:{completed:'yes',effort:4,note:''}, out:{completed:true,effort:11,note:''} };
  assert.deepEqual(loadLogs(store(JSON.stringify(valid))), { a:valid.a });
});
