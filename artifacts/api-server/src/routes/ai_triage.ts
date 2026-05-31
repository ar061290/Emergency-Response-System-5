import { Router } from "express";
import { openai } from "../lib/openai.js";

const router = Router();

router.post("/ai/hospital-recommendation", async (req, res) => {
  const { incident, hospitals } = req.body as {
    incident: {
      severity: string;
      heartRate?: number;
      temperature?: number;
      impactMagnitude?: number;
      childAge?: number;
      medicalConditions?: string[];
      allergies?: string[];
    };
    hospitals: Array<{
      id: string;
      name: string;
      type: string;
      traumaBeds: number;
      icuBeds: number;
      hasPediatricTeam: boolean;
      hasTraumaSurgery: boolean;
      hasCTScan: boolean;
      rating: number;
      distanceKm?: number;
      etaMinutes?: number;
    }>;
  };

  if (!incident || !hospitals?.length) {
    res.status(400).json({ error: "incident and hospitals are required" });
    return;
  }

  try {
    const prompt = `You are an emergency medical dispatch AI. A child has been in an accident.

Incident details:
- Severity: ${incident.severity}
- Heart rate: ${incident.heartRate ?? "unknown"} bpm
- Temperature: ${incident.temperature ?? "unknown"}°C
- Impact magnitude: ${incident.impactMagnitude ?? "unknown"}
- Child age: ${incident.childAge ?? "unknown"} years
- Medical conditions: ${incident.medicalConditions?.join(", ") || "none"}
- Allergies: ${incident.allergies?.join(", ") || "none"}

Available hospitals:
${hospitals.map((h, i) => `${i + 1}. ${h.name} (${h.type})
   - Distance: ${h.distanceKm ?? "unknown"} km, ETA: ${h.etaMinutes ?? "unknown"} min
   - Trauma beds: ${h.traumaBeds}, ICU beds: ${h.icuBeds}
   - Pediatric team: ${h.hasPediatricTeam}, Trauma surgery: ${h.hasTraumaSurgery}, CT scan: ${h.hasCTScan}
   - Rating: ${h.rating}/5`).join("\n")}

Rank these hospitals from best to worst for this specific child's emergency. For each hospital, provide a confidence score (0.0-1.0) and a brief reason (1 sentence). Respond with ONLY valid JSON in this exact format:
{
  "rankings": [
    { "id": "<hospital_id>", "rank": 1, "confidenceScore": 0.95, "reason": "..." },
    ...
  ],
  "aiAssessment": "Brief overall assessment of the situation in 1-2 sentences."
}`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 600,
      response_format: { type: "json_object" },
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) throw new Error("Empty AI response");

    const parsed = JSON.parse(content);
    res.json(parsed);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "AI recommendation failed", fallback: true });
  }
});

router.post("/ai/classify-severity", async (req, res) => {
  const { impactMagnitude, heartRate, temperature, childAge, medicalConditions } = req.body as {
    impactMagnitude: number;
    heartRate?: number;
    temperature?: number;
    childAge?: number;
    medicalConditions?: string[];
  };

  if (typeof impactMagnitude !== "number") {
    res.status(400).json({ error: "impactMagnitude is required" });
    return;
  }

  try {
    const prompt = `You are a pediatric emergency triage AI. Classify the severity of a child's accident.

Sensor data:
- Impact magnitude (g-force): ${impactMagnitude.toFixed(2)}
- Heart rate: ${heartRate ?? "unknown"} bpm
- Temperature: ${temperature ?? "unknown"}°C
- Child age: ${childAge ?? "unknown"} years
- Pre-existing medical conditions: ${medicalConditions?.join(", ") || "none"}

Classify severity as one of: "minor", "moderate", or "critical".
Respond with ONLY valid JSON:
{
  "severity": "moderate",
  "confidence": 0.87,
  "reasoning": "One sentence explanation.",
  "recommendImmediateDispatch": true
}`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 200,
      response_format: { type: "json_object" },
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) throw new Error("Empty AI response");

    const parsed = JSON.parse(content);
    res.json(parsed);
  } catch (err) {
    req.log.error(err);
    const fallbackSeverity =
      impactMagnitude > 12 ? "critical" : impactMagnitude > 7 ? "moderate" : "minor";
    res.json({
      severity: fallbackSeverity,
      confidence: 0.6,
      reasoning: "Rule-based fallback (AI unavailable).",
      recommendImmediateDispatch: impactMagnitude > 7,
      fallback: true,
    });
  }
});

router.post("/ai/voice-chat", async (req, res) => {
  const { message, childName, incidentContext } = req.body as {
    message: string;
    childName?: string;
    incidentContext?: string;
  };

  if (!message?.trim()) {
    res.status(400).json({ error: "message is required" });
    return;
  }

  try {
    const systemPrompt = `You are a calm, reassuring emergency AI assistant talking directly to a child named ${childName ?? "a child"} who was just in an accident. The child is wearing a smartwatch.

Rules:
- Speak simply, warmly, and calmly. Use short sentences.
- Never say anything scary. Always be reassuring.
- If the child says where it hurts, acknowledge it and say help is coming.
- Always end with something reassuring like "Help is on the way" or "You're doing great".
- Keep responses under 3 sentences.
${incidentContext ? `\nIncident context: ${incidentContext}` : ""}`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: message },
      ],
      max_tokens: 150,
    });

    const reply = completion.choices[0]?.message?.content ?? "Help is on the way. Stay calm, you're doing great.";
    res.json({ reply });
  } catch (err) {
    req.log.error(err);
    res.json({
      reply: "Help is on the way. Stay calm, you're doing great.",
      fallback: true,
    });
  }
});

export default router;
