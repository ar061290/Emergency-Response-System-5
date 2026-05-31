import { Router } from "express";
import { db, incidentsTable, insertIncidentSchema, timelineEventsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { z } from "zod/v4";

const router = Router();

const statusUpdateSchema = z.object({
  status: z.enum(["active", "en_route", "on_scene", "transporting", "at_hospital", "resolved"]),
  notes: z.string().optional(),
});

router.get("/incidents", async (req, res) => {
  try {
    const { status } = req.query as { status?: string };
    let query = db.select().from(incidentsTable).orderBy(desc(incidentsTable.createdAt));
    const rows = await query;
    const filtered = status ? rows.filter((r) => r.status === status) : rows;
    res.json(filtered);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to list incidents" });
  }
});

router.post("/incidents", async (req, res) => {
  const parsed = insertIncidentSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input", details: parsed.error.issues });
    return;
  }
  try {
    const [incident] = await db.insert(incidentsTable).values(parsed.data).returning();
    await db.insert(timelineEventsTable).values({
      incidentId: incident.id,
      eventType: "incident_created",
      title: "Incident Reported",
      description: `Emergency detected for ${incident.childName}`,
      timestamp: new Date(),
    });
    res.status(201).json(incident);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to create incident" });
  }
});

router.get("/incidents/:incidentId", async (req, res) => {
  try {
    const [incident] = await db
      .select()
      .from(incidentsTable)
      .where(eq(incidentsTable.id, req.params.incidentId));
    if (!incident) { res.status(404).json({ error: "Incident not found" }); return; }
    res.json(incident);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to get incident" });
  }
});

router.put("/incidents/:incidentId/status", async (req, res) => {
  const parsed = statusUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input", details: parsed.error.issues });
    return;
  }
  try {
    const resolvedAt = parsed.data.status === "resolved" ? new Date() : undefined;
    const [updated] = await db
      .update(incidentsTable)
      .set({ status: parsed.data.status, updatedAt: new Date(), ...(resolvedAt ? { resolvedAt } : {}) })
      .where(eq(incidentsTable.id, req.params.incidentId))
      .returning();
    if (!updated) { res.status(404).json({ error: "Incident not found" }); return; }

    const statusLabels: Record<string, string> = {
      en_route: "Ambulance En Route",
      on_scene: "Ambulance On Scene",
      transporting: "Child Being Transported",
      at_hospital: "Arrived at Hospital",
      resolved: "Incident Resolved",
    };
    if (statusLabels[parsed.data.status]) {
      await db.insert(timelineEventsTable).values({
        incidentId: req.params.incidentId,
        eventType: `status_${parsed.data.status}`,
        title: statusLabels[parsed.data.status],
        description: parsed.data.notes ?? `Status updated to ${parsed.data.status}`,
        timestamp: new Date(),
      });
    }
    res.json(updated);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to update incident status" });
  }
});

// Alias: PATCH /incidents/{incidentId} matches the Orval-generated client URL
router.patch("/incidents/:incidentId", async (req, res) => {
  const parsed = statusUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input", details: parsed.error.issues });
    return;
  }
  try {
    const resolvedAt = parsed.data.status === "resolved" ? new Date() : undefined;
    const [updated] = await db
      .update(incidentsTable)
      .set({ status: parsed.data.status, updatedAt: new Date(), ...(resolvedAt ? { resolvedAt } : {}) })
      .where(eq(incidentsTable.id, req.params.incidentId))
      .returning();
    if (!updated) { res.status(404).json({ error: "Incident not found" }); return; }

    const statusLabels: Record<string, string> = {
      en_route: "Ambulance En Route",
      on_scene: "Ambulance On Scene",
      transporting: "Child Being Transported",
      at_hospital: "Arrived at Hospital",
      resolved: "Incident Resolved",
    };
    if (statusLabels[parsed.data.status]) {
      await db.insert(timelineEventsTable).values({
        incidentId: req.params.incidentId,
        eventType: `status_${parsed.data.status}`,
        title: statusLabels[parsed.data.status],
        description: parsed.data.notes ?? `Status updated to ${parsed.data.status}`,
        timestamp: new Date(),
      });
    }
    res.json(updated);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to update incident status" });
  }
});

export default router;
