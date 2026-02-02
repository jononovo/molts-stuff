import { generateAgent } from "./generators/agent-generator";
import { generateListing } from "./generators/listing-generator";
import { generateComment } from "./generators/comment-generator";
import { generateTransaction } from "./generators/transaction-generator";
import {
  defaultConfigs,
  getRandomInterval,
  shouldRun,
  createSchedulerState,
  SchedulerState,
  ActivityType,
} from "./scheduler";

interface ActivityEngineConfig {
  enabled: boolean;
  mode: "dev" | "prod";
}

interface EngineState {
  isRunning: boolean;
  timers: Map<ActivityType, NodeJS.Timeout>;
  states: Map<ActivityType, SchedulerState>;
  transactionPhase: "request" | "accept" | "complete";
}

const engineState: EngineState = {
  isRunning: false,
  timers: new Map(),
  states: new Map(),
  transactionPhase: "request",
};

function getConfig(): ActivityEngineConfig {
  return {
    enabled: process.env.ACTIVITY_ENGINE_ENABLED === "true",
    mode: (process.env.ACTIVITY_ENGINE_MODE as "dev" | "prod") || "dev",
  };
}

async function runAgentActivity(): Promise<void> {
  const state = engineState.states.get("agent")!;
  const config = defaultConfigs.agent;

  if (!shouldRun(state, config)) {
    console.log("[ActivityEngine] Agent daily limit reached, skipping");
    return;
  }

  const result = await generateAgent();
  if (result.success) {
    state.runCountToday++;
    state.lastRunAt = new Date();
  }

  scheduleNext("agent");
}

async function runListingActivity(): Promise<void> {
  const state = engineState.states.get("listing")!;
  const config = defaultConfigs.listing;

  if (!shouldRun(state, config)) {
    console.log("[ActivityEngine] Listing daily limit reached, skipping");
    return;
  }

  const result = await generateListing();
  if (result.success) {
    state.runCountToday++;
    state.lastRunAt = new Date();
  }

  scheduleNext("listing");
}

async function runCommentActivity(): Promise<void> {
  const state = engineState.states.get("comment")!;
  const config = defaultConfigs.comment;

  if (!shouldRun(state, config)) {
    console.log("[ActivityEngine] Comment daily limit reached, skipping");
    return;
  }

  const result = await generateComment();
  if (result.success) {
    state.runCountToday++;
    state.lastRunAt = new Date();
  }

  scheduleNext("comment");
}

async function runTransactionActivity(): Promise<void> {
  const state = engineState.states.get("transaction")!;
  const config = defaultConfigs.transaction;

  if (!shouldRun(state, config)) {
    console.log("[ActivityEngine] Transaction daily limit reached, skipping");
    return;
  }

  const result = await generateTransaction(engineState.transactionPhase);

  if (result.success) {
    if (engineState.transactionPhase === "request") {
      engineState.transactionPhase = "accept";
    } else if (engineState.transactionPhase === "accept") {
      engineState.transactionPhase = "complete";
    } else {
      engineState.transactionPhase = "request";
      state.runCountToday++;
      state.lastRunAt = new Date();
    }
  } else {
    engineState.transactionPhase = "request";
  }

  scheduleNext("transaction");
}

const activityRunners: Record<ActivityType, () => Promise<void>> = {
  agent: runAgentActivity,
  listing: runListingActivity,
  comment: runCommentActivity,
  transaction: runTransactionActivity,
};

function scheduleNext(type: ActivityType): void {
  if (!engineState.isRunning) return;

  const config = defaultConfigs[type];
  const interval = getRandomInterval(config);

  const existingTimer = engineState.timers.get(type);
  if (existingTimer) {
    clearTimeout(existingTimer);
  }

  const timer = setTimeout(() => {
    activityRunners[type]().catch((err) => {
      console.error(`[ActivityEngine] Error in ${type} activity:`, err);
      scheduleNext(type);
    });
  }, interval);

  engineState.timers.set(type, timer);

  const minutes = Math.round(interval / 60000);
  console.log(`[ActivityEngine] Next ${type} activity in ${minutes} minutes`);
}

export function startActivityEngine(): void {
  const config = getConfig();

  if (!config.enabled) {
    console.log("[ActivityEngine] Disabled via ACTIVITY_ENGINE_ENABLED env var");
    return;
  }

  if (engineState.isRunning) {
    console.log("[ActivityEngine] Already running");
    return;
  }

  console.log(`[ActivityEngine] Starting in ${config.mode} mode...`);

  engineState.isRunning = true;

  for (const type of Object.keys(defaultConfigs) as ActivityType[]) {
    engineState.states.set(type, createSchedulerState());
  }

  const startupDelays: Record<ActivityType, number> = {
    agent: 5 * 60 * 1000,
    listing: 2 * 60 * 1000,
    comment: 1 * 60 * 1000,
    transaction: 10 * 60 * 1000,
  };

  for (const type of Object.keys(defaultConfigs) as ActivityType[]) {
    const delay = startupDelays[type];
    console.log(`[ActivityEngine] First ${type} activity in ${delay / 60000} minutes`);

    const timer = setTimeout(() => {
      activityRunners[type]().catch((err) => {
        console.error(`[ActivityEngine] Error in initial ${type} activity:`, err);
        scheduleNext(type);
      });
    }, delay);

    engineState.timers.set(type, timer);
  }

  console.log("[ActivityEngine] Started successfully");
}

export function stopActivityEngine(): void {
  if (!engineState.isRunning) {
    console.log("[ActivityEngine] Not running");
    return;
  }

  console.log("[ActivityEngine] Stopping...");

  Array.from(engineState.timers.values()).forEach((timer) => {
    clearTimeout(timer);
  });

  engineState.timers.clear();
  engineState.isRunning = false;

  console.log("[ActivityEngine] Stopped");
}

export function getActivityEngineStatus(): {
  isRunning: boolean;
  config: ActivityEngineConfig;
  stats: Record<ActivityType, { runCountToday: number; lastRunAt: Date | null }>;
} {
  const stats: Record<ActivityType, { runCountToday: number; lastRunAt: Date | null }> = {} as any;

  for (const type of Object.keys(defaultConfigs) as ActivityType[]) {
    const state = engineState.states.get(type);
    stats[type] = {
      runCountToday: state?.runCountToday || 0,
      lastRunAt: state?.lastRunAt || null,
    };
  }

  return {
    isRunning: engineState.isRunning,
    config: getConfig(),
    stats,
  };
}
