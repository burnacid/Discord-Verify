import type { Server } from "node:http";
import { config } from "./config.js";
import { client, startBot } from "./bot/client.js";
import { registerCommands } from "./bot/commands.js";
import "./bot/events/guildMemberAdd.js";
import "./bot/events/interactionCreate.js";
import { createApp } from "./web/app.js";
import { startCleanupJob } from "./jobs/cleanup.js";
import { prisma } from "./db.js";

const CLEANUP_INTERVAL_MS = 60 * 60 * 1000;

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve) => server.close(() => resolve()));
}

async function main() {
  client.once("ready", () => {
    console.log(`Bot logged in as ${client.user?.tag}`);
  });
  await startBot();
  await registerCommands();

  const cleanupInterval = startCleanupJob(CLEANUP_INTERVAL_MS);

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
    await closeServer(server);
    await prisma.$disconnect();
    await client.destroy();

    console.log("Shutdown complete.");
    process.exit(0);
  };

  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

main().catch((err) => {
  console.error("Fatal startup error", err);
  process.exit(1);
});
