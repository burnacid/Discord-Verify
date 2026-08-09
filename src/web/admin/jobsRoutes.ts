import { Router } from "express";
import { asyncHandler } from "../asyncHandler.js";
import { requireAdmin } from "./session.js";
import { flashQuery, parseFlashKind } from "./flashQuery.js";
import { jobsPage } from "../views/admin/jobs.js";
import { JOB_DEFINITIONS } from "../../jobs/registry.js";
import { getJobRunStatuses } from "../../jobs/jobTracking.js";

export const jobsRouter = Router();

jobsRouter.use("/admin/jobs", requireAdmin);

function adminUser(req: { session: { discordId?: string; username?: string } }) {
  return { discordId: req.session.discordId!, username: req.session.username ?? "Admin" };
}

jobsRouter.get(
  "/admin/jobs",
  asyncHandler(async (req, res) => {
    const flash = typeof req.query.flash === "string" ? req.query.flash : undefined;
    const flashKind = parseFlashKind(req.query.flashKind);
    const statuses = await getJobRunStatuses();
    res.send(jobsPage(adminUser(req), JOB_DEFINITIONS, statuses, flash, flashKind));
  }),
);

jobsRouter.post(
  "/admin/jobs/:key/run",
  asyncHandler(async (req, res) => {
    const job = JOB_DEFINITIONS.find((j) => j.key === req.params.key);
    if (!job) {
      res.redirect(`/admin/jobs?${flashQuery("Unknown task.", "error")}`);
      return;
    }

    try {
      await job.run();
      res.redirect(`/admin/jobs?${flashQuery(`${job.label} ran successfully.`)}`);
    } catch (err) {
      console.error(`Manual run of job "${job.key}" failed`, err);
      res.redirect(`/admin/jobs?${flashQuery(`${job.label} failed — see server logs.`, "error")}`);
    }
  }),
);
