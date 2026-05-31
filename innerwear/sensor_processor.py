"""
RoadSoS Kids — Smart Innerwear Sensor Processor
================================================
Handles:
  - Raw sensor data collection (accelerometer, heart rate, temperature, GPS)
  - Noise removal via Kalman filtering
  - Impact detection and severity classification
  - Alert generation and dispatch to backend APIs
  - Integration with Child Watch, Parent Command Center,
    and Emergency Response Dashboard via REST/WebSocket

Dependencies:
    pip install numpy requests websocket-client pyserial aiohttp asyncio
"""

import asyncio
import json
import logging
import math
import time
from collections import deque
from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone
from enum import Enum
from typing import Optional, List, Callable, Deque

import numpy as np

try:
    import requests
    import aiohttp
    import websockets
except ImportError:
    pass  # Optional at import time; required at runtime

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("roadsos.innerwear")


# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

class Config:
    API_BASE_URL: str = "http://localhost:80/api"
    WS_BASE_URL: str = "ws://localhost:80/ws"

    # Impact detection thresholds (m/s²)
    IMPACT_THRESHOLD_MINOR: float = 30.0
    IMPACT_THRESHOLD_MODERATE: float = 50.0
    IMPACT_THRESHOLD_CRITICAL: float = 80.0

    # Heart rate alert thresholds (BPM)
    HEART_RATE_LOW: int = 50
    HEART_RATE_HIGH: int = 140
    HEART_RATE_CRITICAL: int = 180

    # Temperature alert thresholds (°C)
    TEMPERATURE_FEVER: float = 38.0
    TEMPERATURE_HIGH_FEVER: float = 39.5

    # Kalman filter process/measurement noise
    ACCEL_PROCESS_NOISE: float = 0.01
    ACCEL_MEASUREMENT_NOISE: float = 0.1
    HR_PROCESS_NOISE: float = 0.5
    HR_MEASUREMENT_NOISE: float = 5.0
    TEMP_PROCESS_NOISE: float = 0.001
    TEMP_MEASUREMENT_NOISE: float = 0.05

    # Sampling & transmission
    SENSOR_SAMPLE_RATE_HZ: int = 100       # accelerometer samples per second
    VITALS_TRANSMIT_INTERVAL_S: float = 10.0  # send vitals every 10 s
    LOCATION_TRANSMIT_INTERVAL_S: float = 2.0  # send GPS every 2 s

    # Impact confirmation: sustained threshold for this many ms
    IMPACT_CONFIRMATION_MS: int = 150
    IMPACT_COOLDOWN_S: float = 5.0         # ignore subsequent impacts within window

    DEVICE_ID: str = "innerwear_dev_001"
    CHILD_ID: str = "child_demo_001"


# ---------------------------------------------------------------------------
# Data structures
# ---------------------------------------------------------------------------

class Severity(Enum):
    NONE = "none"
    MINOR = "minor"
    MODERATE = "moderate"
    CRITICAL = "critical"


@dataclass
class RawSensorFrame:
    """One frame of raw sensor data from the MCU."""
    timestamp_ms: int
    accel_x: float          # m/s²
    accel_y: float
    accel_z: float
    heart_rate_raw: Optional[float] = None  # BPM, None if not ready
    skin_temp_raw: Optional[float] = None   # °C
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    device_id: str = Config.DEVICE_ID


@dataclass
class FilteredSensorFrame:
    """Output after Kalman filtering."""
    timestamp_ms: int
    accel_x: float
    accel_y: float
    accel_z: float
    impact_magnitude: float
    heart_rate: Optional[float] = None
    skin_temperature: Optional[float] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    device_id: str = Config.DEVICE_ID


@dataclass
class ImpactEvent:
    timestamp_ms: int
    magnitude: float
    severity: Severity
    accel_x: float
    accel_y: float
    accel_z: float
    latitude: Optional[float]
    longitude: Optional[float]


@dataclass
class VitalsSnapshot:
    heart_rate: Optional[int]
    skin_temperature: Optional[float]
    heart_rate_trend: str = "stable"  # "stable" | "increasing" | "decreasing"
    confidence: float = 0.0
    alerts: List[str] = field(default_factory=list)


# ---------------------------------------------------------------------------
# Kalman Filter (1D scalar — applied independently per channel)
# ---------------------------------------------------------------------------

class KalmanFilter1D:
    """
    Discrete-time 1D Kalman filter for scalar signals.

    State equation:   x[k] = x[k-1] + w[k],   w ~ N(0, Q)
    Measurement eq:   z[k] = x[k]   + v[k],   v ~ N(0, R)

    Args:
        process_noise (Q): Variance of the process (how much the true signal
            can jump between steps).  Higher Q = tracks faster changes but
            more noisy. Lower Q = smoother but slower to adapt.
        measurement_noise (R): Variance of sensor measurement noise.  Higher R
            = trust sensor less, rely more on model prediction.
    """

    def __init__(
        self,
        process_noise: float,
        measurement_noise: float,
        initial_estimate: float = 0.0,
        initial_error_covariance: float = 1.0,
    ):
        self.Q = process_noise
        self.R = measurement_noise
        self.x = initial_estimate         # state estimate
        self.P = initial_error_covariance # error covariance

    def update(self, measurement: float) -> float:
        """
        Feed one measurement and return the filtered (posterior) estimate.

        Steps:
          1. Predict: project state and covariance forward.
          2. Update:  correct with new measurement using Kalman gain.
        """
        # ── Predict ──
        x_pred = self.x
        P_pred = self.P + self.Q

        # ── Update ──
        K = P_pred / (P_pred + self.R)        # Kalman gain
        self.x = x_pred + K * (measurement - x_pred)
        self.P = (1 - K) * P_pred

        return self.x

    def reset(self, value: float = 0.0) -> None:
        self.x = value
        self.P = 1.0


# ---------------------------------------------------------------------------
# Multi-axis Kalman filter wrapping three 1D filters (for accelerometer)
# ---------------------------------------------------------------------------

class AccelerometerKalmanFilter:
    """
    Independent Kalman filters for X, Y, Z accelerometer axes.
    Returns filtered (x, y, z) and the Euclidean magnitude of the filtered
    acceleration vector.
    """

    def __init__(self, Q: float = Config.ACCEL_PROCESS_NOISE, R: float = Config.ACCEL_MEASUREMENT_NOISE):
        self.kf_x = KalmanFilter1D(Q, R)
        self.kf_y = KalmanFilter1D(Q, R)
        self.kf_z = KalmanFilter1D(Q, R)

    def update(self, ax: float, ay: float, az: float):
        fx = self.kf_x.update(ax)
        fy = self.kf_y.update(ay)
        fz = self.kf_z.update(az)
        magnitude = math.sqrt(fx**2 + fy**2 + fz**2)
        return fx, fy, fz, magnitude


# ---------------------------------------------------------------------------
# Rolling window statistics helper
# ---------------------------------------------------------------------------

class RollingStats:
    """Track mean and trend over a sliding window."""

    def __init__(self, window: int = 10):
        self.buf: Deque[float] = deque(maxlen=window)

    def push(self, value: float) -> None:
        self.buf.append(value)

    def mean(self) -> Optional[float]:
        return float(np.mean(self.buf)) if self.buf else None

    def trend(self) -> str:
        if len(self.buf) < 3:
            return "stable"
        recent = list(self.buf)
        mid = len(recent) // 2
        first_half_avg = np.mean(recent[:mid])
        second_half_avg = np.mean(recent[mid:])
        delta = second_half_avg - first_half_avg
        if delta > 3:
            return "increasing"
        if delta < -3:
            return "decreasing"
        return "stable"


# ---------------------------------------------------------------------------
# Impact detector
# ---------------------------------------------------------------------------

class ImpactDetector:
    """
    Detects sustained high-magnitude acceleration events.

    A real impact must:
      - Exceed the minor threshold
      - Be sustained for at least IMPACT_CONFIRMATION_MS milliseconds
        (prevents false positives from bumps/drops)
      - Not fire again within IMPACT_COOLDOWN_S seconds
    """

    def __init__(self):
        self._above_since_ms: Optional[int] = None
        self._last_impact_ts_ms: Optional[int] = None
        self._peak_magnitude: float = 0.0

    def feed(self, magnitude: float, timestamp_ms: int,
             lat: Optional[float], lon: Optional[float],
             ax: float, ay: float, az: float) -> Optional[ImpactEvent]:
        # Cooldown guard
        if self._last_impact_ts_ms is not None:
            elapsed_s = (timestamp_ms - self._last_impact_ts_ms) / 1000.0
            if elapsed_s < Config.IMPACT_COOLDOWN_S:
                return None

        threshold = Config.IMPACT_THRESHOLD_MINOR
        if magnitude >= threshold:
            if self._above_since_ms is None:
                self._above_since_ms = timestamp_ms
                self._peak_magnitude = magnitude
            else:
                self._peak_magnitude = max(self._peak_magnitude, magnitude)
                sustained_ms = timestamp_ms - self._above_since_ms
                if sustained_ms >= Config.IMPACT_CONFIRMATION_MS:
                    severity = self._classify(self._peak_magnitude)
                    event = ImpactEvent(
                        timestamp_ms=timestamp_ms,
                        magnitude=self._peak_magnitude,
                        severity=severity,
                        accel_x=ax,
                        accel_y=ay,
                        accel_z=az,
                        latitude=lat,
                        longitude=lon,
                    )
                    self._above_since_ms = None
                    self._peak_magnitude = 0.0
                    self._last_impact_ts_ms = timestamp_ms
                    return event
        else:
            self._above_since_ms = None
            self._peak_magnitude = 0.0

        return None

    @staticmethod
    def _classify(magnitude: float) -> Severity:
        if magnitude >= Config.IMPACT_THRESHOLD_CRITICAL:
            return Severity.CRITICAL
        if magnitude >= Config.IMPACT_THRESHOLD_MODERATE:
            return Severity.MODERATE
        return Severity.MINOR


# ---------------------------------------------------------------------------
# Vitals analyser
# ---------------------------------------------------------------------------

class VitalsAnalyser:
    """
    Analyses filtered heart rate and temperature, generates alerts.
    Maintains rolling history for trend detection.
    """

    def __init__(self):
        self._hr_filter = KalmanFilter1D(Config.HR_PROCESS_NOISE, Config.HR_MEASUREMENT_NOISE)
        self._temp_filter = KalmanFilter1D(Config.TEMP_PROCESS_NOISE, Config.TEMP_MEASUREMENT_NOISE)
        self._hr_stats = RollingStats(window=12)
        self._temp_stats = RollingStats(window=6)
        self._hr_initialized = False
        self._temp_initialized = False

    def feed(self, raw_hr: Optional[float], raw_temp: Optional[float]) -> VitalsSnapshot:
        alerts: List[str] = []
        hr_filtered: Optional[int] = None
        temp_filtered: Optional[float] = None
        hr_trend = "stable"
        confidence_parts: List[float] = []

        if raw_hr is not None:
            if not self._hr_initialized:
                self._hr_filter.reset(raw_hr)
                self._hr_initialized = True
            filtered = self._hr_filter.update(raw_hr)
            hr_filtered = int(round(filtered))
            self._hr_stats.push(filtered)
            hr_trend = self._hr_stats.trend()

            if hr_filtered < Config.HEART_RATE_LOW:
                alerts.append("HR_LOW")
            elif hr_filtered >= Config.HEART_RATE_CRITICAL:
                alerts.append("HR_CRITICAL")
            elif hr_filtered >= Config.HEART_RATE_HIGH:
                alerts.append("HR_ELEVATED")

            confidence_parts.append(0.9)

        if raw_temp is not None:
            if not self._temp_initialized:
                self._temp_filter.reset(raw_temp)
                self._temp_initialized = True
            filtered_t = self._temp_filter.update(raw_temp)
            temp_filtered = round(filtered_t, 1)
            self._temp_stats.push(filtered_t)

            if filtered_t >= Config.TEMPERATURE_HIGH_FEVER:
                alerts.append("HIGH_FEVER")
            elif filtered_t >= Config.TEMPERATURE_FEVER:
                alerts.append("FEVER")

            confidence_parts.append(0.92)

        confidence = float(np.mean(confidence_parts)) if confidence_parts else 0.0

        return VitalsSnapshot(
            heart_rate=hr_filtered,
            skin_temperature=temp_filtered,
            heart_rate_trend=hr_trend,
            confidence=confidence,
            alerts=alerts,
        )


# ---------------------------------------------------------------------------
# Backend API client
# ---------------------------------------------------------------------------

class BackendClient:
    """
    Synchronous REST client to the RoadSoS backend.
    In production replace with the async version below.
    """

    def __init__(self, base_url: str = Config.API_BASE_URL):
        self.base = base_url.rstrip("/")
        self._session = None
        try:
            import requests as req
            self._req = req
        except ImportError:
            self._req = None
            logger.warning("requests library not installed — API calls disabled")

    def _post(self, path: str, payload: dict) -> Optional[dict]:
        if self._req is None:
            logger.debug("Skipping API call (requests not available): POST %s", path)
            return None
        url = f"{self.base}{path}"
        try:
            resp = self._req.post(url, json=payload, timeout=5)
            resp.raise_for_status()
            return resp.json()
        except Exception as exc:
            logger.error("API POST %s failed: %s", path, exc)
            return None

    def _patch(self, path: str, payload: dict) -> Optional[dict]:
        if self._req is None:
            return None
        url = f"{self.base}{path}"
        try:
            resp = self._req.patch(url, json=payload, timeout=5)
            resp.raise_for_status()
            return resp.json()
        except Exception as exc:
            logger.error("API PATCH %s failed: %s", path, exc)
            return None

    def submit_sensor_data(self, frame: RawSensorFrame) -> Optional[dict]:
        """Send raw sensor data to /innerwear/sensor-data for server-side processing."""
        payload = {
            "deviceId": frame.device_id,
            "accelerometerX": frame.accel_x,
            "accelerometerY": frame.accel_y,
            "accelerometerZ": frame.accel_z,
            "heartRate": int(frame.heart_rate_raw) if frame.heart_rate_raw else None,
            "skinTemperature": frame.skin_temp_raw,
            "latitude": frame.latitude,
            "longitude": frame.longitude,
            "timestamp": datetime.fromtimestamp(
                frame.timestamp_ms / 1000.0, tz=timezone.utc
            ).isoformat(),
        }
        return self._post("/innerwear/sensor-data", payload)

    def create_incident(self, impact: ImpactEvent, child_id: str,
                        vitals: VitalsSnapshot) -> Optional[dict]:
        payload = {
            "childId": child_id,
            "severity": impact.severity.value,
            "incidentType": "transportation_accident",
            "latitude": impact.latitude or 0.0,
            "longitude": impact.longitude or 0.0,
            "impactMagnitude": impact.magnitude,
            "heartRate": vitals.heart_rate,
            "temperature": vitals.skin_temperature,
        }
        result = self._post("/incidents", payload)
        if result:
            logger.info("Incident created: %s (severity=%s)", result.get("id"), impact.severity.value)
        return result

    def submit_vitals(self, incident_id: str, vitals: VitalsSnapshot,
                      frame: FilteredSensorFrame) -> Optional[dict]:
        payload = {
            "heartRate": vitals.heart_rate or 0,
            "temperature": vitals.skin_temperature or 0.0,
            "accelerometerX": frame.accel_x,
            "accelerometerY": frame.accel_y,
            "accelerometerZ": frame.accel_z,
            "latitude": frame.latitude,
            "longitude": frame.longitude,
            "confidence": vitals.confidence,
        }
        return self._post(f"/incidents/{incident_id}/vitals", payload)

    def update_incident_status(self, incident_id: str, status: str,
                               notes: str = "") -> Optional[dict]:
        payload = {"status": status, "responderNotes": notes}
        return self._patch(f"/incidents/{incident_id}", payload)


# ---------------------------------------------------------------------------
# Async backend client (WebSocket streaming)
# ---------------------------------------------------------------------------

class AsyncBackendClient:
    """
    Async version using aiohttp + websockets for streaming vitals.
    """

    def __init__(self, base_url: str = Config.API_BASE_URL,
                 ws_url: str = Config.WS_BASE_URL):
        self.base = base_url.rstrip("/")
        self.ws_base = ws_url.rstrip("/")
        self._session: Optional[object] = None

    async def _get_session(self):
        import aiohttp
        if self._session is None or self._session.closed:
            self._session = aiohttp.ClientSession()
        return self._session

    async def post(self, path: str, payload: dict) -> Optional[dict]:
        import aiohttp
        session = await self._get_session()
        try:
            async with session.post(f"{self.base}{path}", json=payload, timeout=aiohttp.ClientTimeout(total=5)) as resp:
                resp.raise_for_status()
                return await resp.json()
        except Exception as exc:
            logger.error("Async POST %s failed: %s", path, exc)
            return None

    async def stream_vitals(self, incident_id: str,
                            vitals_iter,
                            stop_event: asyncio.Event) -> None:
        """
        Connects to the WebSocket at /ws/incidents/{id}/stream and
        continuously pushes vitals readings until stop_event is set.

        vitals_iter: async generator yielding (VitalsSnapshot, FilteredSensorFrame)
        """
        uri = f"{self.ws_base}/incidents/{incident_id}/stream"
        try:
            import websockets as ws_lib
            async with ws_lib.connect(uri) as ws:
                logger.info("WebSocket connected: %s", uri)
                async for vitals, frame in vitals_iter:
                    if stop_event.is_set():
                        break
                    msg = {
                        "msg_type": "vitals_update",
                        "timestamp": int(time.time() * 1000),
                        "data": {
                            "heart_rate": vitals.heart_rate,
                            "temperature": vitals.skin_temperature,
                            "heart_rate_trend": vitals.heart_rate_trend,
                            "alerts": vitals.alerts,
                            "location": {
                                "latitude": frame.latitude,
                                "longitude": frame.longitude,
                            },
                        },
                    }
                    await ws.send(json.dumps(msg))
        except Exception as exc:
            logger.error("WebSocket stream error: %s", exc)


# ---------------------------------------------------------------------------
# Offline incident buffer  (store-and-forward when connectivity is lost)
# ---------------------------------------------------------------------------

class OfflineIncidentBuffer:
    """
    Stores incidents locally when connectivity is lost.
    Syncs automatically when connectivity returns by calling
    BackendClient.submit_sensor_data for each buffered frame.

    Usage::

        buffer = OfflineIncidentBuffer()
        if is_offline:
            buffer_id = buffer.save_incident_offline(incident_data)
        else:
            results = buffer.flush(backend_client)
    """

    def __init__(self, buffer_dir: str = "/tmp/roadsos_offline"):
        import json as _json
        from pathlib import Path as _Path
        self._json = _json
        self._buffer_dir = _Path(buffer_dir)
        self._buffer_dir.mkdir(parents=True, exist_ok=True)
        self.sync_status = "ready"
        logger.info("OfflineIncidentBuffer initialised at %s", self._buffer_dir)

    def save_incident_offline(self, incident_data: dict) -> str:
        """
        Persist incident data to local filesystem while offline.

        Args:
            incident_data: {
                child_id, device_id, lat, lon,
                impact_magnitude, heart_rate, temperature,
                acceleration_vector: {x, y, z},
                timestamp (ISO)
            }

        Returns:
            buffer_id — unique key for this buffered entry
        """
        buffer_id = f"offline_{int(time.time() * 1000)}"
        path = self._buffer_dir / f"{buffer_id}.json"
        incident_data.update(
            buffer_id=buffer_id,
            buffered_at=datetime.now(timezone.utc).isoformat(),
            synced=False,
        )
        path.write_text(self._json.dumps(incident_data))
        logger.warning("Incident buffered offline: %s (mag=%.2f)", buffer_id,
                       incident_data.get("impact_magnitude", 0))
        return buffer_id

    def get_pending(self) -> list:
        """Return all unsynced buffered incidents sorted by buffer time."""
        pending = []
        for path in sorted(self._buffer_dir.glob("offline_*.json")):
            try:
                entry = self._json.loads(path.read_text())
                if not entry.get("synced"):
                    pending.append(entry)
            except Exception as exc:
                logger.error("Failed to read buffer file %s: %s", path, exc)
        return pending

    def mark_synced(self, buffer_id: str) -> bool:
        """Mark a buffered incident as successfully synced."""
        path = self._buffer_dir / f"{buffer_id}.json"
        if not path.exists():
            return False
        entry = self._json.loads(path.read_text())
        entry["synced"] = True
        entry["synced_at"] = datetime.now(timezone.utc).isoformat()
        path.write_text(self._json.dumps(entry))
        logger.info("Buffer entry synced: %s", buffer_id)
        return True

    def flush(self, backend: "BackendClient") -> dict:
        """
        Replay all pending buffered incidents against the backend.
        Call this when connectivity is restored.

        Returns:
            {"synced": int, "failed": int, "results": list}
        """
        pending = self.get_pending()
        if not pending:
            logger.info("No offline incidents to flush.")
            return {"synced": 0, "failed": 0, "results": []}

        self.sync_status = "syncing"
        synced, failed, results = 0, 0, []

        for entry in pending:
            try:
                raw = RawSensorFrame(
                    timestamp_ms=int(
                        datetime.fromisoformat(entry["timestamp"]).timestamp() * 1000
                    ),
                    accel_x=entry["acceleration_vector"]["x"],
                    accel_y=entry["acceleration_vector"]["y"],
                    accel_z=entry["acceleration_vector"]["z"],
                    heart_rate_raw=entry.get("heart_rate"),
                    skin_temp_raw=entry.get("temperature"),
                    latitude=entry.get("lat"),
                    longitude=entry.get("lon"),
                    device_id=entry.get("device_id", Config.DEVICE_ID),
                )
                result = backend.submit_sensor_data(raw)
                if result:
                    self.mark_synced(entry["buffer_id"])
                    synced += 1
                    results.append({"buffer_id": entry["buffer_id"], "status": "ok"})
                else:
                    failed += 1
                    results.append({"buffer_id": entry["buffer_id"], "status": "backend_error"})
            except Exception as exc:
                failed += 1
                results.append({"buffer_id": entry["buffer_id"], "status": "error", "detail": str(exc)})
                logger.error("Failed to sync buffer entry %s: %s", entry.get("buffer_id"), exc)

        self.sync_status = "ready"
        logger.info("Flush complete: %d synced, %d failed", synced, failed)
        return {"synced": synced, "failed": failed, "results": results}


# ---------------------------------------------------------------------------
# Main sensor processor pipeline
# ---------------------------------------------------------------------------

class InnerwearSensorProcessor:
    """
    Top-level pipeline that ties together:
      - Kalman filtering for all sensor channels
      - Impact detection with confirmation + cooldown
      - Vitals analysis and alerting
      - Backend integration (REST + optionally WebSocket)

    Usage (polling / hardware integration):

        processor = InnerwearSensorProcessor(child_id="child_abc123")

        while True:
            raw = read_from_hardware()           # your hardware layer
            result = processor.process(raw)

            if result["impact_detected"]:
                print(f"IMPACT: {result['severity']}, mag={result['magnitude']:.1f}")
            if result["vitals_alerts"]:
                print(f"VITALS ALERTS: {result['vitals_alerts']}")

    Usage (demo / simulation):

        processor = InnerwearSensorProcessor()
        processor.run_demo(duration_seconds=30)
    """

    def __init__(
        self,
        child_id: str = Config.CHILD_ID,
        device_id: str = Config.DEVICE_ID,
        api_base_url: str = Config.API_BASE_URL,
        on_impact: Optional[Callable[[ImpactEvent, VitalsSnapshot], None]] = None,
        on_vitals_alert: Optional[Callable[[VitalsSnapshot], None]] = None,
    ):
        self.child_id = child_id
        self.device_id = device_id
        self.backend = BackendClient(api_base_url)

        self._accel_filter = AccelerometerKalmanFilter()
        self._vitals_analyser = VitalsAnalyser()
        self._impact_detector = ImpactDetector()

        self._active_incident_id: Optional[str] = None
        self._last_vitals_tx_s: float = 0.0
        self._last_location_tx_s: float = 0.0
        self._frame_count: int = 0

        self._on_impact = on_impact
        self._on_vitals_alert = on_vitals_alert

        logger.info(
            "InnerwearSensorProcessor initialised | child=%s | device=%s",
            child_id,
            device_id,
        )

    # ------------------------------------------------------------------
    # Core processing method — call once per sensor frame
    # ------------------------------------------------------------------

    def process(self, raw: RawSensorFrame) -> dict:
        """
        Process one raw sensor frame through the full pipeline.

        Returns a summary dict:
          {
            "impact_detected": bool,
            "severity": str,           # "none" | "minor" | "moderate" | "critical"
            "magnitude": float,
            "filtered_accel": (x, y, z),
            "heart_rate": int | None,
            "temperature": float | None,
            "vitals_alerts": list[str],
            "confidence": float,
            "incident_id": str | None,
          }
        """
        self._frame_count += 1
        now_s = raw.timestamp_ms / 1000.0

        # ── 1. Kalman-filter accelerometer ──────────────────────────────
        fx, fy, fz, magnitude = self._accel_filter.update(
            raw.accel_x, raw.accel_y, raw.accel_z
        )

        filtered = FilteredSensorFrame(
            timestamp_ms=raw.timestamp_ms,
            accel_x=fx,
            accel_y=fy,
            accel_z=fz,
            impact_magnitude=magnitude,
            heart_rate=raw.heart_rate_raw,
            skin_temperature=raw.skin_temp_raw,
            latitude=raw.latitude,
            longitude=raw.longitude,
            device_id=raw.device_id,
        )

        # ── 2. Kalman-filter vitals ──────────────────────────────────────
        vitals = self._vitals_analyser.feed(raw.heart_rate_raw, raw.skin_temp_raw)

        # ── 3. Impact detection ──────────────────────────────────────────
        impact_event = self._impact_detector.feed(
            magnitude=magnitude,
            timestamp_ms=raw.timestamp_ms,
            lat=raw.latitude,
            lon=raw.longitude,
            ax=fx,
            ay=fy,
            az=fz,
        )

        if impact_event is not None:
            logger.warning(
                "IMPACT DETECTED | magnitude=%.1f m/s² | severity=%s | "
                "HR=%s BPM | temp=%s°C",
                impact_event.magnitude,
                impact_event.severity.value,
                vitals.heart_rate,
                vitals.skin_temperature,
            )
            self._handle_impact(impact_event, vitals)

        # ── 4. Periodic vitals transmission ─────────────────────────────
        if (self._active_incident_id and
                now_s - self._last_vitals_tx_s >= Config.VITALS_TRANSMIT_INTERVAL_S):
            self.backend.submit_vitals(self._active_incident_id, vitals, filtered)
            self._last_vitals_tx_s = now_s

            if vitals.alerts:
                logger.warning("Vitals alerts: %s", vitals.alerts)
                if self._on_vitals_alert:
                    self._on_vitals_alert(vitals)

        return {
            "impact_detected": impact_event is not None,
            "severity": impact_event.severity.value if impact_event else "none",
            "magnitude": impact_event.magnitude if impact_event else magnitude,
            "filtered_accel": (fx, fy, fz),
            "heart_rate": vitals.heart_rate,
            "temperature": vitals.skin_temperature,
            "vitals_alerts": vitals.alerts,
            "confidence": vitals.confidence,
            "incident_id": self._active_incident_id,
        }

    # ------------------------------------------------------------------
    # Impact response
    # ------------------------------------------------------------------

    def _handle_impact(self, impact: ImpactEvent, vitals: VitalsSnapshot) -> None:
        """
        On confirmed impact:
          1. Fire user callback
          2. Create incident via backend API
          3. Store incident ID for subsequent vitals streaming
        """
        if self._on_impact:
            self._on_impact(impact, vitals)

        if impact.severity == Severity.NONE:
            return

        if self._active_incident_id:
            logger.info("Secondary impact on existing incident %s — skipping new creation",
                        self._active_incident_id)
            return

        incident = self.backend.create_incident(impact, self.child_id, vitals)
        if incident:
            self._active_incident_id = incident.get("id")
            logger.info("Active incident set: %s", self._active_incident_id)

    # ------------------------------------------------------------------
    # Incident resolution
    # ------------------------------------------------------------------

    def resolve_incident(self, notes: str = "Resolved by device operator") -> None:
        """
        Call when the emergency is resolved (e.g., child responds 'NO' to alert).
        Clears local state and updates backend.
        """
        if self._active_incident_id:
            self.backend.update_incident_status(
                self._active_incident_id, "resolved", notes
            )
            logger.info("Incident %s resolved", self._active_incident_id)
            self._active_incident_id = None

    def get_active_incident_id(self) -> Optional[str]:
        return self._active_incident_id

    # ------------------------------------------------------------------
    # Demo / simulation mode
    # ------------------------------------------------------------------

    def run_demo(self, duration_seconds: int = 60, sample_rate_hz: int = 20) -> None:
        """
        Run a simulated sensor stream for testing without physical hardware.

        Scenario timeline:
          0 – 10 s  : Normal riding (mild vibration)
          10 – 12 s : Bus collision impact (high-G event)
          12 – 60 s : Post-impact monitoring (elevated HR)
        """
        logger.info("=== DEMO MODE STARTED (duration=%ds) ===", duration_seconds)
        interval_s = 1.0 / sample_rate_hz
        start_ms = int(time.time() * 1000)
        elapsed_s = 0.0
        step_ms = int(interval_s * 1000)

        rng = np.random.default_rng(seed=42)

        while elapsed_s < duration_seconds:
            ts_ms = start_ms + int(elapsed_s * 1000)

            # Simulate different phases
            if elapsed_s < 10:
                # Normal: 1G gravity on Z, mild noise
                ax = rng.normal(0, 2)
                ay = rng.normal(0, 2)
                az = rng.normal(-9.8, 1.5)
                hr = rng.normal(90, 3)
                temp = rng.normal(36.5, 0.05)
            elif elapsed_s < 12:
                # Collision phase: spike to ~85 m/s²
                frac = (elapsed_s - 10) / 2.0
                spike = 85.0 * math.sin(frac * math.pi)
                ax = rng.normal(spike * 0.5, 3)
                ay = rng.normal(spike * 0.3, 3)
                az = rng.normal(-spike * 0.8, 3)
                hr = rng.normal(110, 8)
                temp = rng.normal(36.6, 0.05)
            else:
                # Post-impact: elevated but stabilising HR
                decay = math.exp(-(elapsed_s - 12) / 20.0)
                ax = rng.normal(0, 2)
                ay = rng.normal(0, 2)
                az = rng.normal(-9.8, 1)
                hr = rng.normal(130 * decay + 90 * (1 - decay), 4)
                temp = rng.normal(36.8, 0.05)

            frame = RawSensorFrame(
                timestamp_ms=ts_ms,
                accel_x=float(ax),
                accel_y=float(ay),
                accel_z=float(az),
                heart_rate_raw=float(hr),
                skin_temp_raw=float(temp),
                latitude=12.9716 + rng.normal(0, 0.0001),
                longitude=77.5946 + rng.normal(0, 0.0001),
                device_id=self.device_id,
            )

            result = self.process(frame)

            if result["impact_detected"]:
                print(
                    f"\n{'='*60}\n"
                    f"  🚨 IMPACT DETECTED at t={elapsed_s:.1f}s\n"
                    f"  Severity   : {result['severity'].upper()}\n"
                    f"  Magnitude  : {result['magnitude']:.1f} m/s²\n"
                    f"  Heart Rate : {result['heart_rate']} BPM\n"
                    f"  Temperature: {result['temperature']}°C\n"
                    f"  Incident ID: {result['incident_id']}\n"
                    f"{'='*60}\n"
                )
            elif self._frame_count % (sample_rate_hz * 5) == 0:
                # Print status every 5 seconds
                print(
                    f"[t={elapsed_s:5.1f}s] "
                    f"mag={result['magnitude']:6.2f} m/s²  "
                    f"HR={result['heart_rate']}  "
                    f"temp={result['temperature']}°C  "
                    f"alerts={result['vitals_alerts']}"
                )

            elapsed_s += interval_s
            time.sleep(interval_s)

        logger.info("=== DEMO MODE ENDED ===")


# ---------------------------------------------------------------------------
# Async integration façade — called by IoT firmware running asyncio
# ---------------------------------------------------------------------------

class AsyncInnerwearIntegration:
    """
    Async wrapper around InnerwearSensorProcessor for use with asyncio event
    loops (e.g., MicroPython on the device MCU or CPython with bleak/asyncio).

    Designed to be consumed by the BLE-connected watch bridge or edge server.
    """

    def __init__(self, child_id: str = Config.CHILD_ID, device_id: str = Config.DEVICE_ID):
        self.processor = InnerwearSensorProcessor(child_id=child_id, device_id=device_id)
        self._stop_event = asyncio.Event()
        self._vitals_queue: asyncio.Queue = asyncio.Queue(maxsize=50)

    async def feed_sensor_loop(self, sensor_source) -> None:
        """
        Read sensor frames from an async source (e.g., BLE characteristic
        notifications) and push them through the processor.

        sensor_source: async generator yielding RawSensorFrame objects.
        """
        async for raw_frame in sensor_source:
            if self._stop_event.is_set():
                break
            result = self.processor.process(raw_frame)
            await self._vitals_queue.put(result)

    async def vitals_broadcast_loop(self, incident_id: str) -> None:
        """
        Consume processed vitals from the queue and stream them to the backend
        via WebSocket. Run concurrently with feed_sensor_loop.
        """
        client = AsyncBackendClient()
        logger.info("Starting vitals broadcast for incident %s", incident_id)

        async def _gen():
            while not self._stop_event.is_set():
                try:
                    result = await asyncio.wait_for(self._vitals_queue.get(), timeout=2)
                    vitals = VitalsSnapshot(
                        heart_rate=result["heart_rate"],
                        skin_temperature=result["temperature"],
                        alerts=result["vitals_alerts"],
                        confidence=result["confidence"],
                    )
                    # Reuse a minimal frame for location
                    frame = FilteredSensorFrame(
                        timestamp_ms=int(time.time() * 1000),
                        accel_x=0, accel_y=0, accel_z=0,
                        impact_magnitude=0,
                        latitude=None,
                        longitude=None,
                    )
                    yield vitals, frame
                except asyncio.TimeoutError:
                    continue

        await client.stream_vitals(incident_id, _gen(), self._stop_event)

    def stop(self) -> None:
        self._stop_event.set()


# ---------------------------------------------------------------------------
# Simulator: generate synthetic sensor frames for testing
# ---------------------------------------------------------------------------

def simulate_normal_riding(n_frames: int = 100, rng: Optional[np.random.Generator] = None):
    """Yield RawSensorFrame objects simulating normal bus/vehicle riding."""
    if rng is None:
        rng = np.random.default_rng()
    t_ms = int(time.time() * 1000)
    for i in range(n_frames):
        yield RawSensorFrame(
            timestamp_ms=t_ms + i * 10,
            accel_x=float(rng.normal(0, 1.5)),
            accel_y=float(rng.normal(0, 1.5)),
            accel_z=float(rng.normal(-9.8, 1.0)),
            heart_rate_raw=float(rng.normal(88, 4)),
            skin_temp_raw=float(rng.normal(36.5, 0.03)),
            latitude=12.9716,
            longitude=77.5946,
        )


def simulate_collision_event(rng: Optional[np.random.Generator] = None):
    """Yield a short sequence of high-G frames representing a collision."""
    if rng is None:
        rng = np.random.default_rng()
    t_ms = int(time.time() * 1000)
    magnitudes = [20, 45, 70, 85, 90, 78, 55, 35, 15]
    for i, mag in enumerate(magnitudes):
        angle = rng.uniform(0, 2 * math.pi)
        yield RawSensorFrame(
            timestamp_ms=t_ms + i * 20,
            accel_x=float(mag * math.cos(angle) + rng.normal(0, 2)),
            accel_y=float(mag * math.sin(angle) + rng.normal(0, 2)),
            accel_z=float(-mag * 0.6 + rng.normal(0, 2)),
            heart_rate_raw=float(rng.normal(105, 10)),
            skin_temp_raw=float(rng.normal(36.7, 0.05)),
            latitude=12.9716,
            longitude=77.5946,
        )


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="RoadSoS Innerwear Sensor Processor")
    parser.add_argument("--demo", action="store_true", help="Run simulation demo")
    parser.add_argument("--duration", type=int, default=30, help="Demo duration in seconds")
    parser.add_argument("--child-id", default=Config.CHILD_ID)
    parser.add_argument("--device-id", default=Config.DEVICE_ID)
    parser.add_argument("--api-url", default=Config.API_BASE_URL)
    args = parser.parse_args()

    def on_impact_callback(impact: ImpactEvent, vitals: VitalsSnapshot):
        print(f"\n[CALLBACK] Impact! Severity={impact.severity.value}, "
              f"Magnitude={impact.magnitude:.1f}, HR={vitals.heart_rate}")

    def on_vitals_alert_callback(vitals: VitalsSnapshot):
        print(f"\n[CALLBACK] Vitals alert: {vitals.alerts}")

    processor = InnerwearSensorProcessor(
        child_id=args.child_id,
        device_id=args.device_id,
        api_base_url=args.api_url,
        on_impact=on_impact_callback,
        on_vitals_alert=on_vitals_alert_callback,
    )

    if args.demo:
        processor.run_demo(duration_seconds=args.duration)
    else:
        print("Running single collision test sequence…")
        rng = np.random.default_rng(seed=7)

        print("Phase 1: Normal riding (50 frames)")
        for frame in simulate_normal_riding(50, rng):
            processor.process(frame)

        print("Phase 2: Collision event")
        for frame in simulate_collision_event(rng):
            result = processor.process(frame)
            if result["impact_detected"]:
                print(f"  → Impact detected! severity={result['severity']}, "
                      f"magnitude={result['magnitude']:.1f}")

        print("Phase 3: Post-impact vitals monitoring (20 frames)")
        for frame in simulate_normal_riding(20, rng):
            processor.process(frame)

        print("\nDone. Active incident:", processor.get_active_incident_id())
