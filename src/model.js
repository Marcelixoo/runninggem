// Entirely synthetic fixture. Dates deliberately frozen for a reproducible pilot.
export const DEMO_TODAY = '2026-10-30';
export const workouts = [
  { id: 'easy-20', date: '2026-10-20', title: 'Easy miles', type: 'Easy run', km: 5, minutes: 33, done: true, pace: '6:36', effort: 3 },
  { id: 'tempo-22', date: '2026-10-22', title: 'Find your rhythm', type: 'Tempo', km: 7, minutes: 42, done: true, pace: '6:00', effort: 6 },
  { id: 'long-25', date: '2026-10-25', title: 'Sunday, unhurried', type: 'Long run', km: 11, minutes: 73, done: true, pace: '6:38', effort: 4 },
  { id: 'easy-27', date: '2026-10-27', title: 'A little fresh air', type: 'Easy run', km: 5, minutes: 33, done: true, pace: '6:36', effort: 3 },
  { id: 'tempo-29', date: '2026-10-29', title: 'Pick up the pace', type: 'Tempo', km: 7, minutes: 42, done: true, pace: '6:00', effort: 6 },
  { id: 'strength-30', date: '2026-10-30', title: 'Build your foundation', type: 'Strength', km: 0, minutes: 35, done: false, description: 'A steady session for stronger hips, calves and core. Keep every movement controlled.', steps: ['5 min · Gentle warm-up', '3 × 10 · Step-ups on each side', '3 × 12 · Calf raises', '3 × 30 sec · Side plank', '5 min · Easy mobility'] },
  { id: 'long-01', date: '2026-11-01', title: 'Go a little further', type: 'Long run', km: 12, minutes: 79, done: false, description: 'Keep this conversational. The goal is time on your feet, not a faster finish.', steps: ['10 min · Start gently', '60 min · Comfortable, conversational running', '9 min · Ease down'] },
  { id: 'easy-03', date: '2026-11-03', title: 'Easy does it', type: 'Easy run', km: 5, minutes: 33, done: false },
  { id: 'interval-05', date: '2026-11-05', title: 'A change of pace', type: 'Intervals', km: 7, minutes: 45, done: false, steps: ['10 min · Easy warm-up', '6 × 2 min · Brisk, with 2 min easy recovery', '11 min · Cool-down'] },
  { id: 'strength-06', date: '2026-11-06', title: 'Strong and steady', type: 'Strength', km: 0, minutes: 35, done: false },
  { id: 'long-08', date: '2026-11-08', title: 'Make room for the long run', type: 'Long run', km: 13, minutes: 86, done: false }
];
export const history = [18, 22, 20, 26, 21, 23];
export function addDays(iso, n) { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
export function weekStart(iso) { const d = new Date(iso + 'T12:00:00Z'); return addDays(iso, -((d.getUTCDay() + 6) % 7)); }
export function isComplete(w, logs) { return logs[w.id]?.completed ?? w.done; }
export function summarize(items, logs) { return items.filter(w => isComplete(w, logs)).reduce((a, w) => ({ km: a.km + w.km, minutes: a.minutes + w.minutes, activities: a.activities + 1 }), { km: 0, minutes: 0, activities: 0 }); }
export function inWeek(items, start) { return items.filter(w => w.date >= start && w.date < addDays(start, 7)); }
export function loadLogs(storage) { try { const v = JSON.parse(storage.getItem('runninggem.logs.v1')); if (!v || typeof v !== 'object' || Array.isArray(v)) return {}; return Object.fromEntries(Object.entries(v).filter(([, log]) => log && typeof log === 'object' && typeof log.completed === 'boolean' && typeof log.note === 'string' && Number.isInteger(log.effort) && log.effort >= 1 && log.effort <= 10)); } catch { return {}; } }
