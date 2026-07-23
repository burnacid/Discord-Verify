import { prisma } from "./db.js";
import { config } from "./config.js";

export interface RuntimeSettings {
  allowedCountries: string[];
  maxFraudScore: number;
  sendJoinDm: boolean;
}

let current: RuntimeSettings | null = null;

export async function initRuntimeSettings(): Promise<void> {
  const row = await prisma.settings.upsert({
    where: { id: 1 },
    update: {},
    create: {
      id: 1,
      allowedCountries: config.verificationDefaults.allowedCountries.join(","),
      maxFraudScore: config.verificationDefaults.maxFraudScore,
      sendJoinDm: config.verificationDefaults.sendJoinDm,
    },
  });
  current = fromRow(row);
}

function fromRow(row: { allowedCountries: string; maxFraudScore: number; sendJoinDm: boolean }): RuntimeSettings {
  return {
    allowedCountries: row.allowedCountries
      .split(",")
      .map((c) => c.trim().toUpperCase())
      .filter(Boolean),
    maxFraudScore: row.maxFraudScore,
    sendJoinDm: row.sendJoinDm,
  };
}

export function getRuntimeSettings(): RuntimeSettings {
  if (!current) {
    throw new Error("Runtime settings accessed before initRuntimeSettings() completed");
  }
  return current;
}

export async function updateRuntimeSettings(patch: Partial<RuntimeSettings>): Promise<RuntimeSettings> {
  const next = { ...getRuntimeSettings(), ...patch };
  const row = await prisma.settings.update({
    where: { id: 1 },
    data: {
      allowedCountries: next.allowedCountries.join(","),
      maxFraudScore: next.maxFraudScore,
      sendJoinDm: next.sendJoinDm,
    },
  });
  current = fromRow(row);
  return current;
}
