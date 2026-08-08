import type { Server } from "node:http";
import { config } from "./config.js";
import { client, startBot } from "./bot/client.js";
import "./bot/events/guildMemberAdd.js";
import "./bot/events/guildCreate.js";
import { provisionGuild } from "./bot/events/guildCreate.js";
import "./bot/events/interactionCreate.js";
import "./bot/events/messageCreate.js";
import { sweepEmptyJtcChannels } from "./bot/events/voiceStateUpdate.js";
import { createApp } from "./web/app.js";
import { startCleanupJob } from "./jobs/cleanup.js";
import { startRssPollerJob } from "./jobs/rssPoller.js";
import { startEventSyncJob } from "./jobs/eventSync.js";
import { startGeoUpdaterJob } from "./jobs/geoUpdater.js";
import { refreshGeoData } from "./geo/updater.js";
import { prisma } from "./db.js";
import { initRuntimeSettings } from "./runtimeSettings.js";
import { registerShutdown } from "./lifecycle.js";

const CLEANUP_INTERVAL_MS = 60 * 60 * 1000;
const RSS_POLL_INTERVAL_MS = 5 * 60 * 1000;
const EVENT_SYNC_INTERVAL_MS = 5 * 60 * 1000;
const GEO_UPDATE_INTERVAL_MS = 12 * 60 * 60 * 1000;

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve) => server.close(() => resolve()));
}

async function main() {
  await initRuntimeSettings();
  // Must succeed before the web server starts accepting /verify requests —
  // there's no fallback GeoIP/VPN path once it's up.
  await refreshGeoData();

  client.once("clientReady", () => {
    console.log(`Bot logged in as ${client.user?.tag}`);

    // Reconciliation pass: covers guilds added while the bot was offline,
    // and — the first time this runs after deploying multi-guild support —
    // bootstraps whatever guild(s) were already installed into the new
    // Guild/Settings tables and re-registers their commands. Not awaited
    // here (clientReady is a sync-style listener); errors per guild are
    // caught individually inside provisionGuild's caller below.
    for (const guild of client.guilds.cache.values()) {
      provisionGuild(guild, false).catch((err) =>
        console.error(`Startup reconciliation failed for guild ${guild.id} (${guild.name})`, err),
      );
    }
  });
  await startBot();

  // Clean up any Join-to-Create channels that emptied out while the bot was
  // offline — the live voiceStateUpdate handler covers normal operation.
  sweepEmptyJtcChannels().catch((err) => console.error("JTC startup sweep failed", err));

  const cleanupInterval = startCleanupJob(CLEANUP_INTERVAL_MS);
  const rssPollerInterval = startRssPollerJob(RSS_POLL_INTERVAL_MS);
  const eventSyncInterval = startEventSyncJob(EVENT_SYNC_INTERVAL_MS);
  const geoUpdaterInterval = startGeoUpdaterJob(GEO_UPDATE_INTERVAL_MS);

  const app = createApp();
  // Bind to localhost only — this app is meant to sit behind a reverse
  // proxy (Apache/Nginx), never exposed directly on the public interface.
  const server = app.listen(config.web.port, "127.0.0.1", () => {
    console.log(`Web server listening on 127.0.0.1:${config.web.port}`);
  });

  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`Received ${signal}, shutting down...`);

    clearInterval(cleanupInterval);
    clearInterval(rssPollerInterval);
    clearInterval(eventSyncInterval);
    clearInterval(geoUpdaterInterval);
    await closeServer(server);
    await prisma.$disconnect();
    await client.destroy();

    console.log("Shutdown complete.");
    process.exit(0);
  };

  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
  registerShutdown(shutdown);
}

main().catch((err) => {
  console.error("Fatal startup error", err);
  process.exit(1);
});
