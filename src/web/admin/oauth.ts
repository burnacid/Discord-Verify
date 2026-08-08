import { randomBytes } from "node:crypto";
import { Router } from "express";
import { config } from "../../config.js";
import { asyncHandler } from "../asyncHandler.js";
import { errorPage } from "../views/verifyPages.js";
import { listAdminGuilds } from "./guildAccess.js";
import { noAdminGuildsMessage } from "./selectServerRoutes.js";

export const oauthRouter = Router();

const REDIRECT_URI = `${config.web.publicBaseUrl}/admin/callback`;

interface DiscordUser {
  id: string;
  username: string;
  avatar: string | null;
}

oauthRouter.get("/admin/login", (req, res) => {
  const state = randomBytes(16).toString("hex");
  req.session.oauthState = state;

  const url = new URL("https://discord.com/api/oauth2/authorize");
  url.searchParams.set("client_id", config.discord.clientId);
  url.searchParams.set("redirect_uri", REDIRECT_URI);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "identify");
  url.searchParams.set("state", state);
  url.searchParams.set("prompt", "none");

  res.redirect(url.toString());
});

oauthRouter.get(
  "/admin/callback",
  asyncHandler(async (req, res) => {
    const { code, state } = req.query;

    if (typeof code !== "string" || typeof state !== "string" || state !== req.session.oauthState) {
      res.status(400).send(errorPage("Login failed", "Invalid or expired login attempt. Please try again."));
      return;
    }
    delete req.session.oauthState;

    const tokenRes = await fetch("https://discord.com/api/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: config.discord.clientId,
        client_secret: config.discord.clientSecret,
        grant_type: "authorization_code",
        code,
        redirect_uri: REDIRECT_URI,
      }),
    });

    if (!tokenRes.ok) {
      console.error("Discord OAuth2 token exchange failed", tokenRes.status, await tokenRes.text());
      res.status(502).send(errorPage("Login failed", "Could not complete Discord login. Please try again."));
      return;
    }

    const tokenData = (await tokenRes.json()) as { access_token: string };

    const userRes = await fetch("https://discord.com/api/users/@me", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    if (!userRes.ok) {
      console.error("Discord user info fetch failed", userRes.status, await userRes.text());
      res.status(502).send(errorPage("Login failed", "Could not complete Discord login. Please try again."));
      return;
    }
    const user = (await userRes.json()) as DiscordUser;

    const adminGuilds = await listAdminGuilds(user.id);
    if (adminGuilds.length === 0) {
      res.status(403).send(errorPage("Access denied", noAdminGuildsMessage()));
      return;
    }

    req.session.discordId = user.id;
    req.session.username = user.username;
    req.session.avatar = user.avatar;
    // Skip the picker when there's only one candidate — most admins manage
    // exactly one server.
    req.session.guildId = adminGuilds.length === 1 ? adminGuilds[0].id : undefined;

    res.redirect(req.session.guildId ? "/admin" : "/admin/select-server");
  }),
);

oauthRouter.get("/admin/logout", (req, res) => {
  req.session.destroy(() => {
    res.redirect("/admin/login");
  });
});
