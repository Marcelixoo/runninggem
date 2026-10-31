import test from "node:test";
import assert from "node:assert/strict";
import {
  localDate,
  activityTotals,
  periodActivities,
  volumeSeries,
  paceLabel,
} from "../src/activity-stats.js";
import { mergeActivities } from "../src/sync-model.js";
const run = (start, meters = 5000, seconds = 1800) => ({
  id: start,
  start,
  source: "strava",
  meters,
  seconds,
  sport: "run",
});
test("totals use running distance and weighted pace, excluding other sports and plans", () => {
  const totals = activityTotals([
    run("2026-10-31T12:00:00Z"),
    run("2026-10-30T12:00:00Z", 10000, 3000),
    { ...run("2026-10-29T12:00:00Z", 20000, 3600), sport: "ride" },
  ]);
  assert.deepEqual(totals, { km: 15, minutes: 80, runs: 2, pace: 320 });
  assert.equal(paceLabel(totals.pace), "5:20");
  assert.equal(paceLabel(359.8), "6:00");
  assert.equal(paceLabel(activityTotals([]).pace), "—");
});
test("calendar days use athlete timezone and week boundaries remain exclusive", () => {
  assert.equal(
    localDate("2026-11-02T01:00:00Z", "America/Sao_Paulo"),
    "2026-11-01",
  );
  assert.equal(localDate("2026-11-02T01:00:00Z", "Asia/Tokyo"), "2026-11-02");
  const rows = [run("2026-11-02T01:00:00Z"), run("2026-11-02T03:00:00Z")];
  assert.equal(
    periodActivities(rows, "2026-10-26", "2026-11-02", "America/Sao_Paulo")
      .length,
    1,
  );
});
test("rolling charts include empty periods and year/month rollover", () => {
  const series = volumeSeries(
    [run("2026-12-31T12:00:00Z"), run("2027-01-01T12:00:00Z")],
    "2027-01-02",
    "month",
    "UTC",
  );
  assert.equal(series[0].start, "2026-08-01");
  assert.equal(series.at(-1).km, 5);
  assert.equal(series.at(-2).km, 5);
  assert.equal(series[0].km, 0);
  assert.equal(
    volumeSeries([], "2026-11-01", "week", "UTC").at(-1).start,
    "2026-10-26",
  );
});
test("matching Strava and Garmin activities contribute once to totals", () => {
  const strava = run("2026-10-31T12:00:00Z");
  const garmin = { ...strava, id: "garmin:123", source: "garmin" };
  assert.equal(activityTotals(mergeActivities([strava, garmin])).km, 5);
});
