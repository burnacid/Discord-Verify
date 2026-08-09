import { renderAdminPage } from "./layout.js";
import type { AdminUser, FlashKind } from "./layout.js";
import type { JobDefinition } from "../../../jobs/registry.js";
import type { JobRunStatus } from "../../../jobs/jobTracking.js";

function formatDate(value: Date | null | undefined): string {
  return value ? value.toISOString().slice(0, 16).replace("T", " ") + " UTC" : "never";
}

function formatDuration(ms: number | null | undefined): string {
  if (ms == null) return "—";
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}

export function jobsPage(
  user: AdminUser,
  jobs: JobDefinition[],
  statuses: Map<string, JobRunStatus>,
  flash?: string,
  flashKind?: FlashKind,
): string {
  const rows = jobs
    .map((job) => {
      const status = statuses.get(job.key);
      const errorRow = status?.lastError
        ? `<div class="hint" style="color: var(--color-error, #d33)">Last error: ${status.lastError}</div>`
        : "";
      return `
        <tr>
          <td>
            <strong>${job.label}</strong>
            <div class="hint">${job.description}</div>
            ${errorRow}
          </td>
          <td>${formatDate(status?.lastRunAt)}</td>
          <td>${formatDate(status?.lastSuccessAt)}</td>
          <td>${formatDuration(status?.lastDurationMs)}</td>
          <td>
            <form method="post" action="/admin/jobs/${job.key}/run" data-loading-text="Running…">
              <button type="submit" class="btn-primary">Run now</button>
            </form>
          </td>
        </tr>`;
    })
    .join("");

  const body = `
    <h1>Scheduled tasks</h1>
    <div class="card">
      <table>
        <thead>
          <tr>
            <th>Task</th>
            <th>Last run</th>
            <th>Last success</th>
            <th>Duration</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
    </div>
  `;

  return renderAdminPage("Scheduled tasks", user, body, flash, flashKind);
}
