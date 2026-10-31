export type Tab = "today" | "calendar" | "performance";
export interface Feedback {
  completed: boolean;
  effort: number;
  note: string;
}
export type FeedbackMap = Record<string, Feedback>;
export interface Session {
  id: string;
  date: string;
  title: string;
  type: string;
  km: number;
  minutes: number;
  done: boolean;
  pace?: string;
  effort?: number;
  description?: string;
  steps?: string[];
}
export interface WorkoutStep {
  kind: "warmup" | "interval" | "recovery" | "cooldown";
  seconds: number;
  target: "open" | "pace" | "hr";
  low?: number;
  high?: number;
}
export interface RunningWorkout {
  id?: string;
  title: string;
  date: string;
  steps: WorkoutStep[];
}
export interface Activity {
  id: string;
  source: string;
  start: string;
  name: string;
  meters: number;
  seconds: number;
  sport: string;
  sources: { id: string; source: string }[];
}
export interface HealthDay {
  date: string;
  steps: number | null;
  restingHeartRate: number | null;
  bodyBatteryLow: number | null;
  bodyBatteryHigh: number | null;
}
export interface ConnectionStatus {
  configured: boolean;
  authenticated: boolean;
  stravaConfigured: boolean;
  garminOAuthConfigured?: boolean;
  garminPersonalAvailable?: boolean;
  garminPersonalSetupRequired?: boolean;
  experimentalGarminEnabled?: boolean;
  garminAuthorized?: boolean;
  garminPermissions?: string[];
  athlete?: string;
  stravaConnected?: boolean;
  garminConnected?: boolean;
}
export interface ImportedHistory {
  activities: Activity[];
  health: HealthDay[] | null;
  stravaLast?: string;
  garminLast?: string;
}
