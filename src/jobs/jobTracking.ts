import { prisma } from "../db.js";

export type JobKey = "cleanup" | "rssPoller" | "eventSync" | "geoUpdater" | "roleSync";

function errorMessage(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  return message.length > 500 ? message.slice(0, 500) + "…" : message;
}

// Wraps a job's run-once function so every invocation — scheduled tick or
// manual "Run now" from the admin panel — records lastRunAt/lastSuccessAt/
// lastError/lastDurationMs in one place, instead of every job file having to
// track this itself (only a couple of jobs persisted any per-run status
// before this, and each did it differently on their own per-item rows).
export async function runTracked(key: JobKey, fn: () => Promise<void>): Promise<void> {
  const startedAt = new Date();
  try {
    await fn();
    await prisma.jobRun.upsert({
      where: { key },
      update: { lastRunAt: startedAt, lastSuccessAt: new Date(), lastError: null, lastDurationMs: Date.now() - startedAt.getTime() },
      create: {
        key,
        lastRunAt: startedAt,
        lastSuccessAt: new Date(),
        lastDurationMs: Date.now() - startedAt.getTime(),
      },
    });
  } catch (err) {
    await prisma.jobRun
      .upsert({
        where: { key },
        update: { lastRunAt: startedAt, lastError: errorMessage(err), lastDurationMs: Date.now() - startedAt.getTime() },
        create: { key, lastRunAt: startedAt, lastError: errorMessage(err), lastDurationMs: Date.now() - startedAt.getTime() },
      })
      .catch(() => {});
    throw err;
  }
}

export interface JobRunStatus {
  key: JobKey;
  lastRunAt: Date | null;
  lastSuccessAt: Date | null;
  lastError: string | null;
  lastDurationMs: number | null;
}

export async function getJobRunStatuses(): Promise<Map<JobKey, JobRunStatus>> {
  const rows = await prisma.jobRun.findMany();
  return new Map(rows.map((r) => [r.key as JobKey, { ...r, key: r.key as JobKey }]));
}
