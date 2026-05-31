import { Router } from "express";
import { db, gpsHistoryTable } from "@workspace/db";
import { eq, asc } from "drizzle-orm";

const router = Router();

router.get("/incidents/:incidentId/gps-history", async (req, res) => {
  try {
    const history = await db
      .select()
      .from(gpsHistoryTable)
      .where(eq(gpsHistoryTable.incidentId, req.params.incidentId))
      .orderBy(asc(gpsHistoryTable.recordedAt));
    res.json(history);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to fetch GPS history" });
  }
});

router.post("/incidents/:incidentId/gps-history", async (req, res) => {
  const { latitude, longitude, locationName } = req.body as {
    latitude: number;
    longitude: number;
    locationName?: string;
  };
  if (typeof latitude !== "number" || typeof longitude !== "number") {
    res.status(400).json({ error: "latitude and longitude are required" });
    return;
  }
  try {
    const [entry] = await db
      .insert(gpsHistoryTable)
      .values({ incidentId: req.params.incidentId, latitude, longitude, locationName })
      .returning();
    res.status(201).json(entry);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to save GPS point" });
  }
});

export default router;
