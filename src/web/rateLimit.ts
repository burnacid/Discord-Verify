import rateLimit from "express-rate-limit";
import { errorPage } from "./views/verifyPages.js";

const FIFTEEN_MINUTES = 15 * 60 * 1000;

// Each fresh visit here can trigger a paid GeoIP/VPN lookup, so keep this tight.
export const verifyLimiter = rateLimit({
  windowMs: FIFTEEN_MINUTES,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    res
      .status(429)
      .send(errorPage("Too many requests", "You're doing that too often. Please wait a bit and try again."));
  },
});

// Invite lookups are cheap (cached), but still worth capping against abuse.
export const joinInviteLimiter = rateLimit({
  windowMs: FIFTEEN_MINUTES,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(429).json({ error: "Too many requests. Please try again later." });
  },
});
