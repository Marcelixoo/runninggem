import { addDays, weekStart } from "./model.js";
const formatters = new Map();
export function localDate(value = new Date(), timeZone) {
  const formatterKey = timeZone || "local";
  if (!formatters.has(formatterKey))
    formatters.set(
      formatterKey,
      new Intl.DateTimeFormat("en", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        ...(timeZone ? { timeZone } : {}),
      }),
    );
  const parts = formatters.get(formatterKey).formatToParts(new Date(value));
  const part = (name) => parts.find((p) => p.type === name).value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}
export function activityTotals(activities) {
  const runs = activities.filter((a) => a.sport === "run");
  const meters = runs.reduce((n, a) => n + a.meters, 0),
    seconds = runs.reduce((n, a) => n + a.seconds, 0);
  return {
    km: meters / 1000,
    minutes: seconds / 60,
    runs: runs.length,
    pace: meters > 0 && seconds > 0 ? seconds / (meters / 1000) : null,
  };
}
export function paceLabel(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return "—";
  const rounded = Math.round(seconds);
  return `${Math.floor(rounded / 60)}:${String(rounded % 60).padStart(2, "0")}`;
}
export function periodActivities(activities, start, end, timeZone) {
  return activities.filter((a) => {
    const day = localDate(a.start, timeZone);
    return day >= start && day < end;
  });
}
export function volumeSeries(activities, today, period, timeZone) {
  return Array.from({ length: period === "week" ? 7 : 6 }, (_, i) => {
    let start, end;
    if (period === "week") {
      start = addDays(weekStart(today), (i - 6) * 7);
      end = addDays(start, 7);
    } else {
      const date = new Date(`${today.slice(0, 7)}-01T12:00:00Z`);
      date.setUTCMonth(date.getUTCMonth() + i - 5);
      start = date.toISOString().slice(0, 10);
      date.setUTCMonth(date.getUTCMonth() + 1);
      end = date.toISOString().slice(0, 10);
    }
    return {
      start,
      end,
      ...activityTotals(periodActivities(activities, start, end, timeZone)),
    };
  });
}
