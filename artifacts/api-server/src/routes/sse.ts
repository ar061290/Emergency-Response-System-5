import { Router } from "express";
import { addSseClient, removeSseClient } from "../lib/sseClients";

const router = Router();

router.get("/events", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  res.write(": connected\n\n");

  const heartbeat = setInterval(() => {
    try {
      res.write(": heartbeat\n\n");
    } catch {
      clearInterval(heartbeat);
    }
  }, 25000);

  addSseClient(res);

  req.on("close", () => {
    clearInterval(heartbeat);
    removeSseClient(res);
  });
});

export default router;
