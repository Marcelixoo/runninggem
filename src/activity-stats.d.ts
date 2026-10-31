import type { Activity } from "../lib/types";
export function localDate(value?: string | Date, timeZone?: string): string;
export function activityTotals(activities: Activity[]): {
  km: number;
  minutes: number;
  runs: number;
  pace: number | null;
};
export function paceLabel(seconds: number | null): string;
export function periodActivities(
  activities: Activity[],
  start: string,
  end: string,
  timeZone?: string,
): Activity[];
export function volumeSeries(
  activities: Activity[],
  today: string,
  period: "week" | "month",
  timeZone?: string,
): ({ start: string; end: string } & ReturnType<typeof activityTotals>)[];
