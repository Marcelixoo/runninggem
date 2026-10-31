import type { Activity, RunningWorkout } from "../lib/types";
export function validateWorkout(workout: unknown): RunningWorkout;
export function normalize(
  source: "strava" | "garmin",
  activity: Record<string, unknown>,
): Activity | null;
export function mergeActivities(rows: (Activity | null)[]): Activity[];
export function garminWorkout(workout: RunningWorkout): Record<string, unknown>;
