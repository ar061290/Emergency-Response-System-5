import { Router } from "express";
import { z } from "zod/v4";
import { db, vitalsTable, incidentsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { broadcast } from "../lib/sseClients";

const router = Router();

const IMPACT_THRESHOLD_CREATE = 30.0;

const sensorSchema = z.object({
  deviceId: z.string(),
  timestamp: z.string(),
  accelerometerX: z.number(),
  accelerometerY: z.number(),
  accelerometerZ: z.number(),
  heartRate: z.number(),
  temperature: z.number(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
});

function classifySeverity(mag: number): "minor" | "moderate" | "critical" {
  if (mag >= 80) return "critical";
  if (mag >= 50) return "moderate";
  return "minor";
}

const handleSensorData = async (req: import("express").Request, res: import("express").Response) => {
  const parsed = sensorSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid sensor payload", details: parsed.error.issues });
    return;
  }
  try {
    const d = parsed.data;
    const mag = Math.sqrt(d.accelerometerX ** 2 + d.accelerometerY ** 2 + d.accelerometerZ ** 2);
    const confidence = Math.min(1, 0.7 + (d.heartRate > 40 && d.heartRate < 200 ? 0.3 : 0));
    const alerts: string[] = [];
    if (d.heartRate > 140) alerts.push("high_heart_rate");
    if (d.heartRate < 50) alerts.push("low_heart_rate");
    if (d.temperature > 38.5) alerts.push("fever");
    if (mag > 15) alerts.push("high_impact");

    let [incident] = await db
      .select()
      .from(incidentsTable)
      .where(eq(incidentsTable.status, "active"))
      .limit(1);

    if (!incident && mag >= IMPACT_THRESHOLD_CREATE) {
      const severity = classifySeverity(mag);
      const [created] = await db
        .insert(incidentsTable)
        .values({
          childId: "child-emma-001",
          childName: "Emma Chen",
          childAge: 9,
          parentName: "Maria Torres",
          parentPhone: "+1-555-0274",
          severity,
          status: "active",
          incidentType: "transportation_accident",
          latitude: d.latitude ?? 33.749,
          longitude: d.longitude ?? -84.388,
          locationAddress: "Sensor-detected impact",
          impactMagnitude: mag,
          heartRate: d.heartRate,
          temperature: d.temperature,
          ambulanceUnit: "AMB-1",
          ambulanceEtaMinutes: 8,
          hospitalName: "Grady Memorial Hospital",
        })
        .returning();
      incident = created;
      broadcast("incident:created", {
        incidentId: incident.id,
        childName: incident.childName,
        severity: incident.severity,
        impactMagnitude: mag,
        sensorTriggered: true,
      });
      req.log.info({ incidentId: incident.id, mag, severity }, "Auto-created incident from sensor impact");
    }

    if (!incident) {
      res.json({ processed: true, incidentId: null, impactMagnitude: mag, alerts, confidence });
      return;
    }

    const [vitals] = await db
      .insert(vitalsTable)
      .values({
        incidentId: incident.id,
        heartRate: d.heartRate,
        temperature: d.temperature,
        accelerometerX: d.accelerometerX,
        accelerometerY: d.accelerometerY,
        accelerometerZ: d.accelerometerZ,
        impactMagnitude: mag,
        latitude: d.latitude,
        longitude: d.longitude,
        confidence,
        alerts,
        timestamp: new Date(d.timestamp),
      })
      .returning();

    broadcast("vitals:new", {
      incidentId: incident.id,
      heartRate: d.heartRate,
      temperature: d.temperature,
      impactMagnitude: mag,
      confidence,
      alerts,
    });

    res.json({
      processed: true,
      incidentId: incident.id,
      vitalsId: vitals.id,
      impactMagnitude: mag,
      alerts,
      confidence,
      autoCreatedIncident: mag >= IMPACT_THRESHOLD_CREATE,
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to process sensor data" });
  }
};

router.post("/innerwear/sensor-data", handleSensorData);
router.post("/sensor-data", handleSensorData);

export default router;
