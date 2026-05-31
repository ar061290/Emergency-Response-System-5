import { pgTable, text, real, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const gpsHistoryTable = pgTable(
  "gps_history",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    incidentId: text("incident_id").notNull(),
    latitude: real("latitude").notNull(),
    longitude: real("longitude").notNull(),
    locationName: text("location_name"),
    recordedAt: timestamp("recorded_at").notNull().defaultNow(),
  },
  (t) => ({
    incidentIdx: index("gps_history_incident_idx").on(t.incidentId),
    timeIdx: index("gps_history_time_idx").on(t.recordedAt),
  })
);

export const insertGpsHistorySchema = createInsertSchema(gpsHistoryTable).omit({ id: true });
export type InsertGpsHistory = z.infer<typeof insertGpsHistorySchema>;
export type GpsHistory = typeof gpsHistoryTable.$inferSelect;
