import { Router } from "express";
import { config } from "../../config.js";
import { asyncHandler } from "../asyncHandler.js";
import { listAdminGuilds } from "./guildAccess.js";
import { selectServerPage } from "../views/admin/selectServer.js";
import { errorPage } from "../views/verifyPages.js";

export const selectServerRouter = Router();

// Create Instant Invite (1) + Kick Members (2) + View Channel (1024) +
// Send Messages (2048) + Manage Roles (268435456) — matches the bot
// permissions documented in the README's setup steps.
const BOT_PERMISSIONS = "268438531";

export function buildBotInviteUrl(): string {
  const url = new URL("https://discord.com/api/oauth2/authorize");
  url.searchParams.set("client_id", config.discord.clientId);
  url.searchParams.set("scope", "bot applications.commands");
  url.searchParams.set("permissions", BOT_PERMISSIONS);
  return url.toString();
}

// Deliberately lighter than requireAdmin — only needs discordId (from
// OAuth login), not guildId, since picking/switching the guild is exactly
// what this route is for.
selectServerRouter.use("/admin/select-server", (req, res, next) => {
  if (!req.session.discordId) {
    res.redirect("/admin/login");
    return;
  }
  next();
});

selectServerRouter.get(
  "/admin/select-server",
  asyncHandler(async (req, res) => {
    const guilds = await listAdminGuilds(req.session.discordId!);
    if (guilds.length === 0) {
      res
        .status(403)
        .send(
          errorPage(
            "Access denied",
            "Your Discord account doesn't have Administrator permission in any server this bot manages. " +
              `<a href="${buildBotInviteUrl()}">Add the bot to a server</a> you administer, then log in again.`,
          ),
        );
      return;
    }
    res.send(
      selectServerPage(
        { discordId: req.session.discordId!, username: req.session.username ?? "Admin" },
        guilds,
        req.session.guildId,
        buildBotInviteUrl(),
      ),
    );
  }),
);

selectServerRouter.post(
  "/admin/select-server",
  asyncHandler(async (req, res) => {
    const guildId = typeof req.body?.guildId === "string" ? req.body.guildId.trim() : "";
    const guilds = await listAdminGuilds(req.session.discordId!);
    if (!guilds.some((g) => g.id === guildId)) {
      res.status(403).send(errorPage("Access denied", "You're not an admin of that server."));
      return;
    }
    req.session.guildId = guildId;
    res.redirect("/admin");
  }),
);
