import { Router } from "express";
import { db, schoolBusesTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router = Router();

router.get("/buses", async (req, res) => {
  try {
    const { schoolId } = req.query as { schoolId?: string };
    const buses = schoolId
      ? await db.select().from(schoolBusesTable).where(eq(schoolBusesTable.schoolId, schoolId))
      : await db.select().from(schoolBusesTable);
    res.json(buses);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to list buses" });
  }
});

router.get("/buses/:busId", async (req, res) => {
  try {
    const [bus] = await db.select().from(schoolBusesTable).where(eq(schoolBusesTable.busId, req.params.busId));
    if (!bus) { res.status(404).json({ error: "Bus not found" }); return; }
    res.json(bus);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to get bus" });
  }
});

router.post("/buses/:busId/location", async (req, res) => {
  try {
    const { lat, lon, locationName } = req.body as { lat: number; lon: number; locationName?: string };
    if (lat == null || lon == null) {
      res.status(400).json({ error: "lat and lon are required" });
      return;
    }
    const [updated] = await db
      .update(schoolBusesTable)
      .set({
        currentLat: lat,
        currentLon: lon,
        currentLocationName: locationName ?? null,
        lastLocationUpdate: new Date(),
        currentStatus: "in_transit",
        updatedAt: new Date(),
      })
      .where(eq(schoolBusesTable.busId, req.params.busId))
      .returning();
    if (!updated) { res.status(404).json({ error: "Bus not found" }); return; }
    res.json(updated);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to update bus location" });
  }
});

export default router;
