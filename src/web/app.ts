import express from "express";
import type { NextFunction, Request, Response } from "express";
import { healthRouter } from "./routes/health.js";
import { joinRouter } from "./routes/join.js";
import { verifyRouter } from "./routes/verify.js";
import { requestLogger } from "./requestLogger.js";
import { errorPage, notFoundPage } from "./views/verifyPages.js";

export function createApp() {
  const app = express();
  // Required so req.ip reflects the real client IP behind Virtualmin's Apache/Nginx reverse proxy.
  app.set("trust proxy", true);
  app.use(express.urlencoded({ extended: false }));
  app.use(requestLogger);

  app.use(healthRouter);
  app.use(joinRouter);
  app.use(verifyRouter);

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
