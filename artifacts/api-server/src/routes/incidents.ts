import { Router } from "express";
import { db, incidentsTable, insertIncidentSchema, timelineEventsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { z } from "zod/v4";
import { broadcast } from "../lib/sseClients";

const router = Router();

const statusUpdateSchema = z.object({
  status: z.enum(["active", "en_route", "on_scene", "transporting", "at_hospital", "resolved"]),
  notes: z.string().optional(),
});

router.get("/incidents", async (req, res) => {
  try {
    const { status } = req.query as { status?: string };
    const rows = await db.select().from(incidentsTable).orderBy(desc(incidentsTable.createdAt));
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
    broadcast("incident:created", {
      incidentId: incident.id,
      childName: incident.childName,
      severity: incident.severity,
      status: incident.status,
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

async function applyStatusUpdate(
  incidentId: string,
  status: string,
  notes: string | undefined,
  log: import("pino").Logger,
): Promise<{ updated: typeof incidentsTable.$inferSelect | null; error?: string }> {
  const resolvedAt = status === "resolved" ? new Date() : undefined;
  const [updated] = await db
    .update(incidentsTable)
    .set({ status: status as "active", updatedAt: new Date(), ...(resolvedAt ? { resolvedAt } : {}) })
    .where(eq(incidentsTable.id, incidentId))
    .returning();
  if (!updated) return { updated: null, error: "Incident not found" };

  const statusLabels: Record<string, string> = {
    en_route: "Ambulance En Route",
    on_scene: "Ambulance On Scene",
    transporting: "Child Being Transported",
    at_hospital: "Arrived at Hospital",
    resolved: "Incident Resolved",
  };
  if (statusLabels[status]) {
    await db.insert(timelineEventsTable).values({
      incidentId,
      eventType: `status_${status}`,
      title: statusLabels[status],
      description: notes ?? `Status updated to ${status}`,
      timestamp: new Date(),
    });
  }
  broadcast("incident:updated", {
    incidentId: updated.id,
    status: updated.status,
    childName: updated.childName,
  });
  log.info({ incidentId, status }, "Incident status updated");
  return { updated };
}

router.put("/incidents/:incidentId/status", async (req, res) => {
  const parsed = statusUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input", details: parsed.error.issues });
    return;
  }
  try {
    const { updated, error } = await applyStatusUpdate(
      req.params.incidentId, parsed.data.status, parsed.data.notes, req.log,
    );
    if (!updated) { res.status(404).json({ error }); return; }
    res.json(updated);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to update incident status" });
  }
});

router.patch("/incidents/:incidentId", async (req, res) => {
  const parsed = statusUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input", details: parsed.error.issues });
    return;
  }
  try {
    const { updated, error } = await applyStatusUpdate(
      req.params.incidentId, parsed.data.status, parsed.data.notes, req.log,
    );
    if (!updated) { res.status(404).json({ error }); return; }
    res.json(updated);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to update incident status" });
  }
});

export default router;
