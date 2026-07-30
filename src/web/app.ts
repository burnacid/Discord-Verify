import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import type { NextFunction, Request, Response } from "express";
import { healthRouter } from "./routes/health.js";
import { joinRouter } from "./routes/join.js";
import { verifyRouter } from "./routes/verify.js";
import { requestLogger } from "./requestLogger.js";
import { sessionMiddleware } from "./admin/session.js";
import { oauthRouter } from "./admin/oauth.js";
import { dashboardRouter } from "./admin/dashboardRoutes.js";
import { membersRouter } from "./admin/membersRoutes.js";
import "./admin/modules.js";
import { adminModules } from "./admin/moduleRegistry.js";
import { errorPage, notFoundPage } from "./views/verifyPages.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const assetsPath = path.join(__dirname, "public", "assets");

export function createApp() {
  const app = express();
  // Trust exactly one hop (the Virtualmin Apache/Nginx reverse proxy in front of this app),
  // not the whole X-Forwarded-For chain — trusting all hops would let a client spoof req.ip
  // by sending their own X-Forwarded-For header, undermining both rate limiting and GeoIP checks.
  app.set("trust proxy", 1);
  app.use(express.urlencoded({ extended: false }));
  app.use(requestLogger);
  app.use(sessionMiddleware());
  // Only the shared theme.css/admin.js live here — deliberately not serving
  // the whole public/ directory (join.html is served explicitly by joinRouter).
  app.use("/assets", express.static(assetsPath));

  app.use(healthRouter);
  app.use(joinRouter);
  app.use(verifyRouter);
  app.use(oauthRouter);
  app.use(dashboardRouter);
  app.use(membersRouter);
  for (const mod of adminModules) app.use(mod.router);

  app.use((req: Request, res: Response) => {
    if (req.path.startsWith("/join/invite") || req.path === "/health.json") {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.status(404).send(notFoundPage());
  });

  app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
    console.error("Unhandled request error", err);
    if (res.headersSent) return;

    if (req.path.startsWith("/join/invite")) {
      res.status(500).json({ error: "Something went wrong. Please try again shortly." });
      return;
    }

    res
      .status(500)
      .send(errorPage("Something went wrong", "An unexpected error occurred. Please try again shortly."));
  });

  return app;
}
