import type { Session, FeedbackMap } from "../lib/types";
export const DEMO_TODAY: string;
export const workouts: Session[];
export const history: number[];
export function addDays(iso: string, n: number): string;
export function weekStart(iso: string): string;
export function inWeek(items: Session[], start: string): Session[];
export function isComplete(workout: Session, logs: FeedbackMap): boolean;
export function summarize(
  items: Session[],
  logs: FeedbackMap,
): { km: number; minutes: number; activities: number };
export function loadLogs(storage: Pick<Storage, "getItem">): FeedbackMap;
