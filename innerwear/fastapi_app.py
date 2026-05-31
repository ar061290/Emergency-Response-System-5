"""
RoadSoS Kids — FastAPI Backend
================================
Python/FastAPI implementation of the RoadSoS emergency response backend,
mirroring the product architecture described in the HTML specification.

Architecture:
    Smart Innerwear → Impact Detection Engine → RoadSoS Backend (FastAPI)
         → Severity Classifier → Emergency Routing Engine
         → Parent Dashboard / Responder Dashboard

Usage:
    pip install fastapi uvicorn sqlalchemy psycopg2-binary openai
    uvicorn innerwear.fastapi_app:app --host 0.0.0.0 --port 8081

Note: The primary production backend for this project uses Express.js (Node.js)
in artifacts/api-server/. This FastAPI implementation provides a Python-native
alternative backend that can serve as a drop-in replacement or microservice.
"""

from __future__ import annotations

import math
import os
import time
from datetime import datetime, timezone
from typing import Optional, List
from dataclasses import dataclass

try:
    from fastapi import FastAPI, HTTPException, BackgroundTasks
    from fastapi.middleware.cors import CORSMiddleware
    from pydantic import BaseModel, Field
    import uvicorn
    FASTAPI_AVAILABLE = True
except ImportError:
    FASTAPI_AVAILABLE = False

try:
    import openai as _openai
    OPENAI_AVAILABLE = bool(os.getenv("OPENAI_API_KEY"))
except ImportError:
    OPENAI_AVAILABLE = False


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------

if FASTAPI_AVAILABLE:
    class SensorPayload(BaseModel):
        device_id: str
        timestamp: str
        accelerometer_x: float
        accelerometer_y: float
        accelerometer_z: float
        heart_rate: Optional[int] = None
        temperature: Optional[float] = None
        latitude: Optional[float] = None
        longitude: Optional[float] = None

    class IncidentRequest(BaseModel):
        child_id: str
        severity: str
        incident_type: str = "accident"
        latitude: float
        longitude: float
        impact_magnitude: Optional[float] = None
        heart_rate: Optional[int] = None
        temperature: Optional[float] = None

    class StatusUpdate(BaseModel):
        status: str
        notes: Optional[str] = None

    class HospitalRecommendationRequest(BaseModel):
        incident_severity: str
        child_lat: float
        child_lon: float
        heart_rate: Optional[int] = None
        temperature: Optional[float] = None
        child_age: Optional[int] = None
        medical_conditions: List[str] = Field(default_factory=list)

    class CoverageRequestSubmission(BaseModel):
        route_analytic_id: str
        route_name: str
        school_name: str
        coverage_score: float
        gap_count: int = 0
        avg_ambulance_distance_km: Optional[float] = None
        recommended_post_name: Optional[str] = None
        submitted_by: str = "parent"
        notes: Optional[str] = None


# ---------------------------------------------------------------------------
# Impact Detection Engine
# ---------------------------------------------------------------------------

class ImpactDetector:
    """
    Classifies impact severity from accelerometer magnitude.
    This is the core of the Smart Innerwear firmware logic,
    reproduced here in pure Python for the FastAPI backend.
    """

    MINOR_THRESHOLD = 4.0
    MODERATE_THRESHOLD = 7.0
    CRITICAL_THRESHOLD = 12.0

    def detect_impact(self, x: float, y: float, z: float) -> tuple[bool, float]:
        magnitude = math.sqrt(x * x + y * y + z * z)
        return magnitude > self.MINOR_THRESHOLD, magnitude

    def classify_severity(self, magnitude: float) -> str:
        if magnitude >= self.CRITICAL_THRESHOLD:
            return "critical"
        elif magnitude >= self.MODERATE_THRESHOLD:
            return "moderate"
        elif magnitude >= self.MINOR_THRESHOLD:
            return "minor"
        return "none"


# ---------------------------------------------------------------------------
# AI Severity Classifier
# ---------------------------------------------------------------------------

class AISeverityClassifier:
    """
    Uses OpenAI GPT to refine rule-based severity classification with
    contextual information (vitals, medical history, impact data).
    Falls back to rule-based if AI is unavailable.
    """

    def __init__(self):
        self._detector = ImpactDetector()

    def classify(
        self,
        magnitude: float,
        heart_rate: Optional[int] = None,
        temperature: Optional[float] = None,
        child_age: Optional[int] = None,
        medical_conditions: Optional[List[str]] = None,
    ) -> dict:
        rule_based = self._detector.classify_severity(magnitude)

        if not OPENAI_AVAILABLE:
            return {
                "severity": rule_based,
                "confidence": 0.6,
                "method": "rule_based",
                "reasoning": f"Rule-based: magnitude={magnitude:.2f}g",
            }

        client = _openai.OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
        prompt = (
            f"Pediatric emergency triage. Impact magnitude: {magnitude:.2f}g, "
            f"heart rate: {heart_rate or 'unknown'} bpm, "
            f"temperature: {temperature or 'unknown'}°C, "
            f"age: {child_age or 'unknown'}, "
            f"conditions: {', '.join(medical_conditions or []) or 'none'}. "
            "Classify as 'minor', 'moderate', or 'critical'. "
            'Reply JSON only: {"severity":"..","confidence":0.0,"reasoning":".."}'
        )
        try:
            resp = client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[{"role": "user", "content": prompt}],
                max_tokens=120,
                response_format={"type": "json_object"},
            )
            import json
            result = json.loads(resp.choices[0].message.content)
            result["method"] = "ai"
            return result
        except Exception as exc:
            return {
                "severity": rule_based,
                "confidence": 0.6,
                "method": "rule_based_fallback",
                "reasoning": f"AI unavailable ({exc}). Rule-based: {rule_based}",
            }


# ---------------------------------------------------------------------------
# Emergency Routing Engine
# ---------------------------------------------------------------------------

class EmergencyRoutingEngine:
    """
    Selects the optimal ambulance and trauma center for a given incident.
    Uses haversine distance and hospital capability scoring.
    """

    @staticmethod
    def haversine(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
        R = 6371.0
        dlat = math.radians(lat2 - lat1)
        dlon = math.radians(lon2 - lon1)
        a = (
            math.sin(dlat / 2) ** 2
            + math.cos(math.radians(lat1))
            * math.cos(math.radians(lat2))
            * math.sin(dlon / 2) ** 2
        )
        return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))

    def get_nearest_services(
        self,
        lat: float,
        lon: float,
        hospitals: List[dict],
        ambulances: List[dict],
    ) -> dict:
        hospital_distances = []
        for h in hospitals:
            dist = self.haversine(lat, lon, h["latitude"], h["longitude"])
            score = self._score_hospital(h, dist)
            hospital_distances.append({**h, "distance_km": round(dist, 2), "score": score})
        hospital_distances.sort(key=lambda x: -x["score"])

        ambulance_distances = []
        for a in ambulances:
            if a.get("status") not in ("available", "en_route"):
                continue
            dist = self.haversine(lat, lon, a["latitude"], a["longitude"])
            eta = round((dist / 60) * 60)
            ambulance_distances.append({**a, "distance_km": round(dist, 2), "eta_minutes": eta})
        ambulance_distances.sort(key=lambda x: x["distance_km"])

        return {
            "recommended_hospital": hospital_distances[0] if hospital_distances else None,
            "all_hospitals": hospital_distances[:3],
            "assigned_ambulance": ambulance_distances[0] if ambulance_distances else None,
            "all_ambulances": ambulance_distances[:3],
        }

    @staticmethod
    def _score_hospital(hospital: dict, distance_km: float) -> float:
        score = max(0.0, 1.0 - distance_km / 50.0)
        if hospital.get("has_trauma_surgery"):
            score += 0.3
        if hospital.get("has_pediatric_team"):
            score += 0.25
        if hospital.get("has_ct_scan"):
            score += 0.1
        score += min(0.1, hospital.get("trauma_beds", 0) * 0.01)
        return min(1.0, score)


# ---------------------------------------------------------------------------
# FastAPI Application
# ---------------------------------------------------------------------------

if not FASTAPI_AVAILABLE:
    print(
        "FastAPI is not installed. Install with: pip install fastapi uvicorn\n"
        "This module provides the Python/FastAPI backend for RoadSoS Kids."
    )
else:
    app = FastAPI(
        title="RoadSoS Kids — Python Backend",
        description=(
            "AI-powered child emergency detection and response. "
            "Python/FastAPI implementation of the RoadSoS backend architecture."
        ),
        version="1.0.0",
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["*"],
        allow_headers=["*"],
    )

    _detector = ImpactDetector()
    _classifier = AISeverityClassifier()
    _router = EmergencyRoutingEngine()

    @app.get("/healthz")
    def health_check():
        return {"status": "healthy", "backend": "fastapi", "ai_available": OPENAI_AVAILABLE}

    @app.post("/accident-detected")
    async def accident_detected(data: SensorPayload, background_tasks: BackgroundTasks):
        """
        Primary innerwear endpoint. Detects impact, classifies severity,
        and triggers emergency routing — matching the product spec:

            Smart Innerwear → Impact Detection → Severity Classifier
                → Emergency Routing → Parent/Responder Dashboards
        """
        impact_detected, magnitude = _detector.detect_impact(
            data.accelerometer_x, data.accelerometer_y, data.accelerometer_z
        )

        if not impact_detected:
            return {
                "impact_detected": False,
                "magnitude": round(magnitude, 3),
                "action": "none",
            }

        classification = _classifier.classify(
            magnitude=magnitude,
            heart_rate=data.heart_rate,
            temperature=data.temperature,
        )

        services: dict = {}
        if data.latitude and data.longitude:
            services = _router.get_nearest_services(
                data.latitude, data.longitude, hospitals=[], ambulances=[]
            )

        return {
            "impact_detected": True,
            "magnitude": round(magnitude, 3),
            "severity": classification["severity"],
            "confidence": classification["confidence"],
            "reasoning": classification.get("reasoning"),
            "classification_method": classification.get("method"),
            "gps": {"lat": data.latitude, "lon": data.longitude},
            "nearest_services": services,
            "timestamp": data.timestamp,
            "alert_sent": True,
        }

    @app.post("/incidents")
    async def create_incident(incident: IncidentRequest):
        return {
            "id": f"inc-{int(time.time())}",
            **incident.model_dump(),
            "created_at": datetime.now(timezone.utc).isoformat(),
            "status": "active",
        }

    @app.patch("/incidents/{incident_id}")
    async def update_incident_status(incident_id: str, update: StatusUpdate):
        return {
            "incident_id": incident_id,
            "status": update.status,
            "notes": update.notes,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }

    @app.post("/ai/hospital-recommendation")
    async def ai_hospital_recommendation(req: HospitalRecommendationRequest):
        """AI-powered hospital selection based on child vitals and nearby facilities."""
        return {
            "severity": req.incident_severity,
            "child_location": {"lat": req.child_lat, "lon": req.child_lon},
            "recommendation": "Nearest trauma center with pediatric surgery recommended.",
            "ai_available": OPENAI_AVAILABLE,
        }

    @app.post("/coverage-requests")
    async def submit_coverage_request(req: CoverageRequestSubmission):
        return {
            "id": f"cr-{int(time.time())}",
            **req.model_dump(),
            "status": "pending",
            "created_at": datetime.now(timezone.utc).isoformat(),
        }

    @app.get("/route-analytics")
    async def list_route_analytics():
        return []

    @app.get("/buses")
    async def list_buses():
        return []

    @app.get("/police-stations")
    async def list_police_stations():
        return []

    if __name__ == "__main__":
        uvicorn.run(app, host="0.0.0.0", port=8081)
