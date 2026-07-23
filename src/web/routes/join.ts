import path from "node:path";
import { fileURLToPath } from "node:url";
import { Router } from "express";
import { getOrCreateJoinInvite } from "../../bot/inviteManager.js";
import { joinInviteLimiter } from "../rateLimit.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const joinPagePath = path.join(__dirname, "..", "public", "join.html");

export const joinRouter = Router();

joinRouter.get("/join", (_req, res) => {
  res.sendFile(joinPagePath);
});

joinRouter.get("/join/invite", joinInviteLimiter, async (_req, res) => {
  try {
    const url = await getOrCreateJoinInvite();
    res.json({ url });
  } catch (err) {
    console.error("Failed to create join invite", err);
    res.status(502).json({ error: "Could not generate a join link right now. Please try again shortly." });
  }
});
