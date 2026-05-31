import { pgTable, text, real, integer, boolean, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const routeAnalyticsTable = pgTable(
  "route_analytics",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    routeName: text("route_name").notNull(),
    schoolName: text("school_name").notNull(),
    startLocationName: text("start_location_name").notNull(),
    endLocationName: text("end_location_name").notNull(),
    routePoints: jsonb("route_points").notNull().$type<Array<{ lat: number; lon: number }>>(),
    coverageScore: real("coverage_score").notNull(),
    avgResponseTimeMin: integer("avg_response_time_min").notNull(),
    avgAmbulanceDistanceKm: real("avg_ambulance_distance_km").notNull(),
    incidentCount: integer("incident_count").notNull().default(0),
    totalChildrenOnRoute: integer("total_children_on_route").notNull().default(0),
    gapCount: integer("gap_count").notNull().default(0),
    gaps: jsonb("gaps").$type<Array<{ lat: number; lon: number; severity: string; distanceKm: number }>>(),
    recommendedPostLat: real("recommended_post_lat"),
    recommendedPostLon: real("recommended_post_lon"),
    recommendedPostName: text("recommended_post_name"),
    projectedResponseTimeMin: integer("projected_response_time_min"),
    isHighRisk: boolean("is_high_risk").notNull().default(false),
    lastAnalyzed: timestamp("last_analyzed").notNull().defaultNow(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    routeNameIdx: index("route_analytics_name_idx").on(t.routeName),
    coverageIdx: index("route_analytics_coverage_idx").on(t.coverageScore),
  })
);

export const insertRouteAnalyticSchema = createInsertSchema(routeAnalyticsTable).omit({ id: true, createdAt: true });
export type InsertRouteAnalytic = z.infer<typeof insertRouteAnalyticSchema>;
export type RouteAnalytic = typeof routeAnalyticsTable.$inferSelect;
