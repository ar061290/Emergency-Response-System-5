import { Router } from "express";
import { db, vitalsTable, incidentsTable, insertVitalsSchema } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { broadcast } from "../lib/sseClients";

const router = Router();

router.get("/incidents/:incidentId/vitals", async (req, res) => {
  try {
    const readings = await db
      .select()
      .from(vitalsTable)
      .where(eq(vitalsTable.incidentId, req.params.incidentId))
      .orderBy(desc(vitalsTable.timestamp))
      .limit(20);
    res.json(readings);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to get vitals" });
  }
});

router.post("/incidents/:incidentId/vitals", async (req, res) => {
  const body = { ...req.body, incidentId: req.params.incidentId };
  const parsed = insertVitalsSchema.safeParse(body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input", details: parsed.error.issues });
    return;
  }
  try {
    const [vitals] = await db.insert(vitalsTable).values(parsed.data).returning();
    await db
      .update(incidentsTable)
      .set({
        heartRate: parsed.data.heartRate,
        temperature: parsed.data.temperature,
        vitalsConfidence: parsed.data.confidence,
        updatedAt: new Date(),
      })
      .where(eq(incidentsTable.id, req.params.incidentId));
    broadcast("vitals:new", {
      incidentId: req.params.incidentId,
      heartRate: parsed.data.heartRate,
      temperature: parsed.data.temperature,
      confidence: parsed.data.confidence,
    });
    res.status(201).json(vitals);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to submit vitals" });
  }
});

export default router;
