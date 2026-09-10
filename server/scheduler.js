// server/scheduler.js — U8 (ask 34): pg-boss wiring for the two automation
// jobs. Imported and started ONLY from index.js, and only when
// NODE_ENV !== "test" -- app.js (imported by every test file) never touches
// this module, so the test suite never boots pg-boss.
import { PgBoss } from "pg-boss";
import { runDailyMonitor, runWeeklySummary } from "./jobs.js";
import { generateFromContext } from "./ai.js";

const DEPS = { generateFromContext };

// Droplet is UTC; Sam is ET. 13:00/13:30 UTC is 9:00/9:30am ET during EDT
// (UTC-4) and 8:00/8:30am ET during EST (UTC-5) -- the DST drift is accepted,
// not solved, this unit.
const JOBS = [
  { name: "daily-monitor", cron: "0 13 * * *", run: runDailyMonitor },
  { name: "weekly-summary", cron: "30 13 * * 1", run: runWeeklySummary },
];

// startScheduler(pool) -> the PgBoss instance, or null if it couldn't start.
// Never throws -- a pg-boss outage must not take the API down with it.
export async function startScheduler(pool) {
  let boss;
  try {
    boss = new PgBoss(process.env.DATABASE_URL);
    boss.on("error", (err) => console.error(`pg-boss error: ${err.message}`));
    await boss.start(); // creates/migrates its own schema
  } catch (err) {
    console.error(`scheduler: pg-boss failed to start: ${err.message}`);
    return null;
  }

  for (const job of JOBS) {
    try {
      // singleton policy: at most one run of this queue in flight at a time,
      // so two firings of the same cron schedule (or a manual trigger
      // overlapping a scheduled one) can never run concurrently.
      await boss.createQueue(job.name, { policy: "singleton", retryLimit: 2, retryBackoff: true });
      await boss.schedule(job.name, job.cron, {}, { tz: "UTC" });
      await boss.work(job.name, async () => {
        const start = Date.now();
        try {
          const summary = await job.run(pool, DEPS, { now: new Date() });
          const ms = Date.now() - start;
          console.log(
            `job ${job.name} ok: users=${summary.users} acted=${summary.acted} skipped=${summary.skipped} errors=${summary.errors} (${ms}ms)`
          );
        } catch (err) {
          // No payloads/secrets -- message only. pg-boss retries per
          // retryLimit/retryBackoff above, then marks it failed.
          console.error(`job ${job.name} failed: ${err.message}`);
          throw err;
        }
      });
    } catch (err) {
      console.error(`scheduler: failed to register ${job.name}: ${err.message}`);
    }
  }

  return boss;
}
