import { refreshGeoData } from "../geo/updater.js";

export function startGeoUpdaterJob(intervalMs: number): NodeJS.Timeout {
  return setInterval(() => {
    refreshGeoData().catch((err) => console.error("GeoIP data refresh job failed", err));
  }, intervalMs);
}
