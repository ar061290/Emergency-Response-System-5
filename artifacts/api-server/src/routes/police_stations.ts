import { Router } from "express";
import { db, policeStationsTable } from "@workspace/db";

const router = Router();

router.get("/police-stations", async (req, res) => {
  try {
    const stations = await db.select().from(policeStationsTable).orderBy(policeStationsTable.name);
    res.json(stations);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to list police stations" });
  }
});

export default router;
