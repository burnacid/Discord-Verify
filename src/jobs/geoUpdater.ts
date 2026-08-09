import { refreshGeoData } from "../geo/updater.js";
import { runTracked } from "./jobTracking.js";

export function runOnce(): Promise<void> {
  return runTracked("geoUpdater", refreshGeoData);
}

export function startGeoUpdaterJob(intervalMs: number): NodeJS.Timeout {
  return setInterval(() => {
    runOnce().catch((err) => console.error("GeoIP data refresh job failed", err));
  }, intervalMs);
}
