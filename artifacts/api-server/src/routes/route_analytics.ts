import { Router } from "express";
import { db, routeAnalyticsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router = Router();

router.get("/route-analytics", async (req, res) => {
  try {
    const rows = await db.select().from(routeAnalyticsTable).orderBy(routeAnalyticsTable.coverageScore);
    res.json(rows);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to list route analytics" });
  }
});

router.get("/route-analytics/:routeId", async (req, res) => {
  try {
    const [row] = await db.select().from(routeAnalyticsTable).where(eq(routeAnalyticsTable.id, req.params.routeId));
    if (!row) { res.status(404).json({ error: "Route not found" }); return; }
    res.json(row);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to get route analytics" });
  }
});

export default router;
