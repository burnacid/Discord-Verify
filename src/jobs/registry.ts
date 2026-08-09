import type { JobKey } from "./jobTracking.js";
import { runOnce as runCleanup } from "./cleanup.js";
import { runOnce as runRssPoller } from "./rssPoller.js";
import { runOnce as runEventSync } from "./eventSync.js";
import { runOnce as runGeoUpdater } from "./geoUpdater.js";
import { runOnce as runRoleSync } from "./roleSync.js";

export interface JobDefinition {
  key: JobKey;
  label: string;
  description: string;
  run: () => Promise<void>;
}

// Drives the admin "Scheduled Tasks" page (src/web/admin/jobsRoutes.ts) —
// the single place both the list of jobs and their manual-trigger action
// come from, so a new background job only needs one line added here to show
// up there.
export const JOB_DEFINITIONS: JobDefinition[] = [
  {
    key: "cleanup",
    label: "Cleanup",
    description: "Deletes expired verification tokens and invite links; sweeps empty Join-to-Create channels.",
    run: runCleanup,
  },
  {
    key: "rssPoller",
    label: "RSS Poller",
    description: "Checks every enabled RSS feed for new posts and sends them to their configured channel.",
    run: runRssPoller,
  },
  {
    key: "eventSync",
    label: "Event Sync",
    description: "Syncs configured external event sources to Discord scheduled events.",
    run: runEventSync,
  },
  {
    key: "geoUpdater",
    label: "GeoIP Updater",
    description: "Refreshes the GeoIP/VPN lookup database used during verification.",
    run: runGeoUpdater,
  },
  {
    key: "roleSync",
    label: "Verified Role Sync",
    description: "Reconciles each member's verified status with whether they hold the Verified Discord role.",
    run: runRoleSync,
  },
];
