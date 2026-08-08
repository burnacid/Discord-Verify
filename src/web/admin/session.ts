import session from "express-session";
import type { NextFunction, Request, Response } from "express";
import { config } from "../../config.js";
import { isAdminMember } from "../../bot/verificationService.js";

declare module "express-session" {
  interface SessionData {
    discordId?: string;
    username?: string;
    avatar?: string | null;
    oauthState?: string;
    // The guild this session is currently managing — unset right after
    // login until either exactly one candidate is found or the admin picks
    // one at /admin/select-server. See src/web/admin/guildAccess.ts.
    guildId?: string;
  }
}

export function sessionMiddleware() {
  return session({
    secret: config.web.sessionSecret,
    name: "dv.sid",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      // "auto" trusts req.secure, which correctly reflects HTTPS behind the
      // reverse proxy now that trust proxy is set — works over plain HTTP
      // in local dev too.
      secure: "auto",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    },
  });
}

export async function requireAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  const discordId = req.session.discordId;
  if (!discordId) {
    res.redirect("/admin/login");
    return;
  }

  if (!req.session.guildId) {
    res.redirect("/admin/select-server");
    return;
  }

  // Re-check admin status on every request (not just at login) so a
  // revoked Administrator permission takes effect immediately.
  const stillAdmin = await isAdminMember(discordId, req.session.guildId);
  if (!stillAdmin) {
    req.session.destroy(() => {});
    res.redirect("/admin/login");
    return;
  }

  next();
}
