import { pgTable, text, real, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const policeStationsTable = pgTable(
  "police_stations",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    name: text("name").notNull(),
    district: text("district").notNull(),
    latitude: real("latitude").notNull(),
    longitude: real("longitude").notNull(),
    address: text("address").notNull(),
    phone: text("phone").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    districtIdx: index("police_stations_district_idx").on(t.district),
  })
);

export const insertPoliceStationSchema = createInsertSchema(policeStationsTable).omit({ id: true, createdAt: true });
export type InsertPoliceStation = z.infer<typeof insertPoliceStationSchema>;
export type PoliceStation = typeof policeStationsTable.$inferSelect;
