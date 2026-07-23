import { Router } from "express";
import { getHealthStatus } from "../../health/status.js";
import { healthPage } from "../../health/view.js";
import { asyncHandler } from "../asyncHandler.js";

export const healthRouter = Router();

healthRouter.get(
  "/health",
  asyncHandler(async (req, res) => {
    const status = await getHealthStatus();
    const statusCode = status.ok ? 200 : 503;

    const wantsJson = req.query.format === "json" || req.accepts(["html", "json"]) === "json";
    if (wantsJson) {
      res.status(statusCode).json(status);
      return;
    }

    res.status(statusCode).send(healthPage(status));
  }),
);

healthRouter.get(
  "/health.json",
  asyncHandler(async (_req, res) => {
    const status = await getHealthStatus();
    res.status(status.ok ? 200 : 503).json(status);
  }),
);
