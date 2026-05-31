import { Router } from "express";
import { db, ambulancesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { z } from "zod/v4";

const router = Router();

const locationUpdateSchema = z.object({
  latitude: z.number(),
  longitude: z.number(),
  speedKmh: z.number().optional(),
  status: z.string().optional(),
});

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function bearingDeg(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const y = Math.sin(dLon) * Math.cos((lat2 * Math.PI) / 180);
  const x =
    Math.cos((lat1 * Math.PI) / 180) * Math.sin((lat2 * Math.PI) / 180) -
    Math.sin((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.cos(dLon);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

router.get("/ambulances", async (req, res) => {
  try {
    const ambulances = await db.select().from(ambulancesTable).orderBy(ambulancesTable.unitNumber);
    res.json(ambulances);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to list ambulances" });
  }
});

router.get("/ambulances/nearest", async (req, res) => {
  const lat = parseFloat(req.query.lat as string);
  const lon = parseFloat(req.query.lon as string);
  if (isNaN(lat) || isNaN(lon)) {
    res.status(400).json({ error: "Query params lat and lon are required numbers" });
    return;
  }
  try {
    const ambulances = await db.select().from(ambulancesTable);
    const available = ambulances.filter(
      (a) => a.status !== "on_scene" && a.latitude != null && a.longitude != null,
    );
    if (available.length === 0) {
      res.status(404).json({ error: "No available ambulances" });
      return;
    }
    const ranked = available
      .map((a) => {
        const distanceKm = haversineKm(lat, lon, a.latitude!, a.longitude!);
        const avgSpeedKmh = a.speedKmh ?? 60;
        const etaMinutes = Math.round((distanceKm / avgSpeedKmh) * 60);
        const bearing = bearingDeg(a.latitude!, a.longitude!, lat, lon);
        return { ambulance: a, distanceKm: Math.round(distanceKm * 100) / 100, etaMinutes, bearing: Math.round(bearing) };
      })
      .sort((a, b) => a.distanceKm - b.distanceKm);

    const nearest = ranked[0];
    res.json({
      ...nearest,
      allAmbulances: ranked.map((r) => ({
        id: r.ambulance.id,
        unitNumber: r.ambulance.unitNumber,
        status: r.ambulance.status,
        distanceKm: r.distanceKm,
        etaMinutes: r.etaMinutes,
      })),
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to find nearest ambulance" });
  }
});

router.put("/ambulances/:ambulanceId/location", async (req, res) => {
  const parsed = locationUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input", details: parsed.error.issues });
    return;
  }
  try {
    const [updated] = await db
      .update(ambulancesTable)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(eq(ambulancesTable.id, req.params.ambulanceId))
      .returning();
    if (!updated) { res.status(404).json({ error: "Ambulance not found" }); return; }
    res.json(updated);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to update ambulance location" });
  }
});

export default router;
