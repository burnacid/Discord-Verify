type ShutdownFn = (reason: string) => Promise<void>;

let shutdownFn: ShutdownFn | null = null;

/** Called once from index.ts once the graceful-shutdown handler is ready. */
export function registerShutdown(fn: ShutdownFn): void {
  shutdownFn = fn;
}

/**
 * Triggers the same graceful shutdown used for SIGTERM/SIGINT (closes the
 * HTTP server, disconnects Prisma, logs the bot out) and exits — relies on
 * a process manager (PM2's autorestart, Passenger, etc.) to bring it back up.
 */
export async function requestRestart(): Promise<void> {
  if (!shutdownFn) {
    throw new Error("Shutdown handler not registered yet");
  }
  await shutdownFn("admin-requested restart");
}
