import { pgTable, text, real, integer, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const coverageRequestsTable = pgTable(
  "coverage_requests",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    routeAnalyticId: text("route_analytic_id").notNull(),
    routeName: text("route_name").notNull(),
    schoolName: text("school_name").notNull(),
    coverageScore: real("coverage_score").notNull(),
    gapCount: integer("gap_count").notNull().default(0),
    avgAmbulanceDistanceKm: real("avg_ambulance_distance_km"),
    recommendedPostName: text("recommended_post_name"),
    projectedResponseTimeMin: integer("projected_response_time_min"),
    avgResponseTimeMin: integer("avg_response_time_min"),
    submittedBy: text("submitted_by").notNull().default("parent"),
    status: text("status").notNull().default("pending"),
    notes: text("notes"),
    reviewedAt: timestamp("reviewed_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    statusIdx: index("coverage_requests_status_idx").on(t.status),
    routeIdx: index("coverage_requests_route_idx").on(t.routeAnalyticId),
  })
);

export const insertCoverageRequestSchema = createInsertSchema(coverageRequestsTable).omit({ id: true, createdAt: true, reviewedAt: true });
export type InsertCoverageRequest = z.infer<typeof insertCoverageRequestSchema>;
export type CoverageRequest = typeof coverageRequestsTable.$inferSelect;
