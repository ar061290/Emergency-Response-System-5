import { pgTable, text, real, boolean, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const schoolBusesTable = pgTable(
  "school_buses",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    busId: text("bus_id").notNull().unique(),
    busNumber: text("bus_number"),
    licensePlate: text("license_plate").notNull(),
    schoolId: text("school_id").notNull(),
    schoolName: text("school_name").notNull(),
    routeId: text("route_id").notNull(),
    routeName: text("route_name").notNull(),
    currentLat: real("current_lat"),
    currentLon: real("current_lon"),
    currentLocationName: text("current_location_name"),
    lastLocationUpdate: timestamp("last_location_update"),
    isActive: boolean("is_active").notNull().default(true),
    currentStatus: text("current_status").notNull().default("not_started"),
    driverName: text("driver_name"),
    driverPhone: text("driver_phone"),
    capacity: text("capacity"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    busIdIdx: index("school_buses_bus_id_idx").on(t.busId),
    schoolIdx: index("school_buses_school_idx").on(t.schoolId),
  })
);

export const insertSchoolBusSchema = createInsertSchema(schoolBusesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertSchoolBus = z.infer<typeof insertSchoolBusSchema>;
export type SchoolBus = typeof schoolBusesTable.$inferSelect;
