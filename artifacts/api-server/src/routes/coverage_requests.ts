import { Router } from "express";
import { db, coverageRequestsTable, insertCoverageRequestSchema } from "@workspace/db";
import { desc } from "drizzle-orm";

const router = Router();

router.get("/coverage-requests", async (req, res) => {
  try {
    const requests = await db.select().from(coverageRequestsTable).orderBy(desc(coverageRequestsTable.createdAt));
    res.json(requests);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to list coverage requests" });
  }
});

router.post("/coverage-requests", async (req, res) => {
  const parsed = insertCoverageRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input", details: parsed.error.issues });
    return;
  }
  try {
    const [request] = await db.insert(coverageRequestsTable).values(parsed.data).returning();
    res.status(201).json(request);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to submit coverage request" });
  }
});

export default router;
