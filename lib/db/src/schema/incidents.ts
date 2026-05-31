import { pgTable, text, real, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const incidentsTable = pgTable("incidents", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  childId: text("child_id").notNull(),
  childName: text("child_name").notNull(),
  childAge: integer("child_age").notNull(),
  severity: text("severity").notNull(),
  status: text("status").notNull().default("active"),
  incidentType: text("incident_type").notNull(),
  latitude: real("latitude").notNull(),
  longitude: real("longitude").notNull(),
  locationAddress: text("location_address"),
  accuracyMeters: real("accuracy_meters"),
  heartRate: integer("heart_rate"),
  temperature: real("temperature"),
  vitalsConfidence: real("vitals_confidence"),
  heartRateTrend: text("heart_rate_trend"),
  parentName: text("parent_name").notNull(),
  parentPhone: text("parent_phone").notNull(),
  parentStatus: text("parent_status").notNull().default("notified"),
  ambulanceId: text("ambulance_id"),
  ambulanceUnit: text("ambulance_unit"),
  ambulanceEtaMinutes: integer("ambulance_eta_minutes"),
  ambulanceDistanceKm: real("ambulance_distance_km"),
  hospitalId: text("hospital_id"),
  hospitalName: text("hospital_name"),
  impactMagnitude: real("impact_magnitude"),
  busId: text("bus_id"),
  busRoute: text("bus_route"),
  traumaCenterSelected: text("trauma_center_selected"),
  traumaCenterReason: text("trauma_center_reason"),
  painBodyPart: text("pain_body_part"),
  painLevel: integer("pain_level"),
  offlineBuffered: boolean("offline_buffered").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  resolvedAt: timestamp("resolved_at"),
});

export const insertIncidentSchema = createInsertSchema(incidentsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertIncident = z.infer<typeof insertIncidentSchema>;
export type Incident = typeof incidentsTable.$inferSelect;
