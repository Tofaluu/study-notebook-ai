import { Router, type IRouter } from "express";
import { resolveAuthenticatedUser } from "../lib/billing";
import {
  ALLOWED_CLIENT_EVENTS,
  getStatsSnapshot,
  isAdminUser,
  recordAnalyticsEvent,
} from "../lib/analytics";

const router: IRouter = Router();

router.post("/analytics/event", async (req, res) => {
  const eventName = typeof req.body?.eventName === "string" ? req.body.eventName.trim() : "";
  if (!ALLOWED_CLIENT_EVENTS.has(eventName)) {
    res.status(400).json({ error: "Unsupported event name." });
    return;
  }

  const user = req.headers.authorization ? await resolveAuthenticatedUser(req) : null;

  await recordAnalyticsEvent({
    eventName,
    sessionId: typeof req.body?.sessionId === "string" ? req.body.sessionId : null,
    userId: user?.id ?? null,
    path: typeof req.body?.path === "string" ? req.body.path : null,
    properties:
      req.body?.properties && typeof req.body.properties === "object"
        ? (req.body.properties as Record<string, unknown>)
        : undefined,
  });

  res.status(204).end();
});

router.get("/stats", async (req, res) => {
  const user = await resolveAuthenticatedUser(req);
  if (!user) {
    res.status(401).json({ error: "Sign in to view stats." });
    return;
  }

  if (!isAdminUser(user)) {
    res.status(403).json({ error: "Forbidden." });
    return;
  }

  const rawDays = Number(req.query.days);
  const days = Number.isFinite(rawDays) ? Math.max(1, Math.min(90, Math.floor(rawDays))) : 30;
  const stats = await getStatsSnapshot(days);
  res.json(stats);
});

export default router;
