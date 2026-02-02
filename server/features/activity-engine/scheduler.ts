export interface ScheduleConfig {
  minIntervalMs: number;
  maxIntervalMs: number;
  maxPerDay: number;
}

export interface SchedulerState {
  lastRunAt: Date | null;
  runCountToday: number;
  dayStart: Date;
}

export function getRandomInterval(config: ScheduleConfig): number {
  return Math.floor(
    Math.random() * (config.maxIntervalMs - config.minIntervalMs) + config.minIntervalMs
  );
}

export function shouldRun(state: SchedulerState, config: ScheduleConfig): boolean {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  if (state.dayStart.getTime() !== today.getTime()) {
    state.dayStart = today;
    state.runCountToday = 0;
  }

  if (state.runCountToday >= config.maxPerDay) {
    return false;
  }

  return true;
}

export function createSchedulerState(): SchedulerState {
  const now = new Date();
  return {
    lastRunAt: null,
    runCountToday: 0,
    dayStart: new Date(now.getFullYear(), now.getMonth(), now.getDate()),
  };
}

const MINUTE = 60 * 1000;

export const defaultConfigs = {
  agent: {
    minIntervalMs: 45 * MINUTE,
    maxIntervalMs: 180 * MINUTE,
    maxPerDay: 16,
  } as ScheduleConfig,

  listing: {
    minIntervalMs: 20 * MINUTE,
    maxIntervalMs: 90 * MINUTE,
    maxPerDay: 40,
  } as ScheduleConfig,

  comment: {
    minIntervalMs: 10 * MINUTE,
    maxIntervalMs: 45 * MINUTE,
    maxPerDay: 80,
  } as ScheduleConfig,

  transaction: {
    minIntervalMs: 60 * MINUTE,
    maxIntervalMs: 240 * MINUTE,
    maxPerDay: 12,
  } as ScheduleConfig,
};

export type ActivityType = keyof typeof defaultConfigs;
