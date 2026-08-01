import { Router } from "express";
import { isIP } from "node:net";
import { geoProvider } from "../../geo/provider.js";
import { isPrivateIp } from "../../geo/privateIp.js";
import { refreshGeoData } from "../../geo/updater.js";
import { getGeoStoreStatus } from "../../geo/store.js";
import { asyncHandler } from "../asyncHandler.js";
import { requireAdmin } from "./session.js";
import { geoPage } from "../views/admin/geo.js";
import { flashQuery, parseFlashKind } from "./flashQuery.js";

export const geoRouter = Router();

geoRouter.use("/admin/geo", requireAdmin);

function adminUser(req: { session: { discordId?: string; username?: string } }) {
  return { discordId: req.session.discordId!, username: req.session.username ?? "Admin" };
}

geoRouter.get(
  "/admin/geo",
  asyncHandler(async (req, res) => {
    const flash = typeof req.query.flash === "string" ? req.query.flash : undefined;
    const flashKind = parseFlashKind(req.query.flashKind);
    res.send(geoPage(adminUser(req), getGeoStoreStatus(), flash, flashKind));
  }),
);

geoRouter.post(
  "/admin/geo/test",
  asyncHandler(async (req, res) => {
    const ip = typeof req.body?.ip === "string" ? req.body.ip.trim() : "";
    if (!ip || !isIP(ip)) {
      res.redirect(`/admin/geo?${flashQuery("Enter a valid IPv4 or IPv6 address.", "error")}`);
      return;
    }

    if (isPrivateIp(ip)) {
      res.redirect(
        `/admin/geo?${flashQuery(`${ip} is a private/loopback address — it has no public GeoIP data.`, "warning")}`,
      );
      return;
    }

    const result = await geoProvider.check(ip);
    const summary =
      `${ip} → country: ${result.countryCode ?? "unknown"}, ` +
      `VPN/proxy: ${result.isVpn ? "yes" : "no"}, fraud score: ${result.fraudScore}`;
    res.redirect(`/admin/geo?${flashQuery(summary, result.isVpn ? "warning" : undefined)}`);
  }),
);

geoRouter.post(
  "/admin/geo/refresh",
  asyncHandler(async (req, res) => {
    try {
      await refreshGeoData();
      const status = getGeoStoreStatus();
      res.redirect(
        `/admin/geo?${flashQuery(
          `GeoIP/VPN data refreshed — ${status.vpnRangeCount} VPN ranges, ${status.vpnAsnLoaded ? status.vpnAsnCount : "no"} VPN ASNs loaded.`,
        )}`,
      );
    } catch (err) {
      console.error("Manual GeoIP data refresh failed", err);
      res.redirect(`/admin/geo?${flashQuery("Refresh failed — see server logs.", "error")}`);
    }
  }),
);
