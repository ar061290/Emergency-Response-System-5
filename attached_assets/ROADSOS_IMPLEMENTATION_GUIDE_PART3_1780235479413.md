# ROADSOS KIDS V1 - IMPLEMENTATION GUIDE PART 3
## Bus Tracking, Child Interface, UI/UX & Design Modifications

---

## SECTION 6: SCHOOL BUS TRACKING INTEGRATION

### REQUIREMENT: Parent Dashboard Should Show Bus Location

**Ideal Product Specifies:**
```
🗺️ Live Map Layers:
- Student Location
- School Bus Location ← CURRENTLY MISSING
- Ambulance Locations
- Hospitals
- Trauma Centers
- Police Stations
```

### 6.1 Database Schema: Add Bus Tracking

**File:** `lib/db/src/schema/school_buses.ts`

**Create New File:**

```typescript
import { pgTable, serial, text, varchar, numeric, timestamp, jsonb, index, boolean } from "drizzle-orm/pg-core";

export const schoolBuses = pgTable(
  "school_buses",
  {
    id: serial("id").primaryKey(),
    
    // Bus identification
    busId: varchar("bus_id", { length: 50 }).notNull().unique(),
    licensePlate: varchar("license_plate", { length: 20 }).notNull(),
    busNumber: varchar("bus_number", { length: 20 }),
    
    // School assignment
    schoolId: text("school_id").notNull(),
    schoolName: text("school_name").notNull(),
    
    // Bus details
    capacity: serial("capacity").notNull(),  // Number of children
    model: text("model"),
    color: text("color"),
    
    // Route assignment
    routeId: text("route_id").notNull(),
    routeName: text("route_name").notNull(),
    routeStartLocation: jsonb("route_start_location"),
    routeEndLocation: jsonb("route_end_location"),
    
    // Tracking info
    currentLat: numeric("current_lat", { precision: 10, scale: 6 }),
    currentLon: numeric("current_lon", { precision: 10, scale: 6 }),
    currentLocationName: text("current_location_name"),
    lastLocationUpdate: timestamp("last_location_update", { mode: "date" }),
    
    // Status
    isActive: boolean("is_active").default(true),
    currentStatus: varchar("current_status", { length: 20 }).default("not_started"),  // not_started, in_transit, arrived, idle
    
    // Driver info
    driverId: text("driver_id"),
    driverName: text("driver_name"),
    driverPhone: varchar("driver_phone", { length: 20 }),
    
    // Timestamps
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow(),
  },
  (table) => ({
    busIdIdx: index("bus_id_idx").on(table.busId),
    schoolIdx: index("bus_school_idx").on(table.schoolId),
    routeIdx: index("bus_route_idx").on(table.routeId),
  })
);

export type SchoolBus = typeof schoolBuses.$inferSelect;
export type NewSchoolBus = typeof schoolBuses.$inferInsert;
```

### 6.2 Database Schema: Bus Location History

**File:** `lib/db/src/schema/bus_location_history.ts`

**Create New File:**

```typescript
import { pgTable, serial, text, numeric, timestamp, index } from "drizzle-orm/pg-core";

export const busLocationHistory = pgTable(
  "bus_location_history",
  {
    id: serial("id").primaryKey(),
    
    busId: varchar("bus_id", { length: 50 }).notNull(),
    lat: numeric("lat", { precision: 10, scale: 6 }).notNull(),
    lon: numeric("lon", { precision: 10, scale: 6 }).notNull(),
    
    speed: numeric("speed_kmh", { precision: 5, scale: 2 }),
    bearing: numeric("bearing_degrees", { precision: 5, scale: 1 }),
    
    timestamp: timestamp("timestamp", { mode: "date" }).defaultNow(),
  },
  (table) => ({
    busIdIdx: index("history_bus_id_idx").on(table.busId),
    timestampIdx: index("history_timestamp_idx").on(table.timestamp),
  })
);

export type BusLocationHistory = typeof busLocationHistory.$inferSelect;
```

### 6.3 API Endpoint: Update Bus Location (Real-time)

**File:** `main.py`

**Add Endpoint:**

```python
@app.post("/bus-location-update")
async def update_bus_location(
    bus_id: str = Query(...),
    lat: float = Query(...),
    lon: float = Query(...),
    speed_kmh: float = Query(..., default=0),
    bearing: float = Query(..., default=0),
    driver_id: str = Query(...)
):
    """
    REQUIRED for: Bus Tracking feature in Parent Dashboard
    
    Bus sends GPS location updates in real-time (every 10-30 seconds).
    Parents see live bus location on map.
    
    Args:
        bus_id: School bus identifier
        lat: Current latitude
        lon: Current longitude
        speed_kmh: Current speed
        bearing: Direction heading in degrees
        driver_id: Driver identifier (for auth)
    
    Returns:
        Acknowledgment of update
    """
    
    try:
        # Verify driver authorization
        # TODO: Check if driver_id matches bus_id assignment
        
        # Store current location
        # TODO: Update schoolBuses table SET currentLat, currentLon, lastLocationUpdate
        
        # Store in history for route playback
        # TODO: Insert into busLocationHistory table
        
        # Notify parents subscribed to this bus
        # TODO: Publish to WebSocket channel "bus_{bus_id}"
        
        return {
            "status": "location_recorded",
            "bus_id": bus_id,
            "timestamp": datetime.utcnow().isoformat()
        }
    
    except Exception as e:
        return {"error": str(e)}


@app.get("/bus-location/{bus_id}")
async def get_bus_location(bus_id: str):
    """
    Get current location of a school bus.
    Called by parent dashboard to display bus on map.
    """
    
    try:
        # TODO: Query schoolBuses table for currentLat, currentLon
        
        return {
            "bus_id": bus_id,
            "current_location": {
                "lat": 12.9252,  # placeholder
                "lon": 77.6245,  # placeholder
                "timestamp": datetime.utcnow().isoformat()
            },
            "status": "in_transit"
        }
    
    except Exception as e:
        return {"error": str(e)}


@app.get("/bus-route-history/{bus_id}")
async def get_bus_route_history(
    bus_id: str,
    start_time: str = Query(...),  # ISO format
    end_time: str = Query(...)     # ISO format
):
    """
    Get historical route trace of bus (for playback in dashboard).
    Requirement: "Historical Route Playback" in Parent Dashboard.
    """
    
    try:
        # TODO: Query busLocationHistory table for time range
        # ORDER BY timestamp DESC LIMIT 1000
        
        locations = [
            {"lat": 12.9252, "lon": 77.6245, "timestamp": "2024-01-20T08:00:00Z"},
            {"lat": 12.9260, "lon": 77.6250, "timestamp": "2024-01-20T08:05:00Z"},
        ]
        
        return {
            "bus_id": bus_id,
            "route_trace": locations,
            "total_points": len(locations),
            "time_range": {
                "start": start_time,
                "end": end_time
            }
        }
    
    except Exception as e:
        return {"error": str(e)}
```

---

## SECTION 7: ENHANCED CHILD INTERFACE (SMARTWATCH)

### REQUIREMENT: Pain Reporting & Injury Localization

**Ideal Product Shows:**
```
🚨 Emergency Detected
RoadSoS is helping you.

Voice Assistant: "Can you tell me where it hurts?"
🎤 Listening...

ETA: 7 minutes
```

**Current Implementation Status:**
- ✅ Voice chatbot exists (WebSocket)
- ❌ Pain reporting UI missing
- ❌ Injury localization missing

### 7.1 Add Pain Reporting to WebSocket Chatbot

**File:** `main.py`

**Modify WebSocket Endpoint (around line 757-810):**

**Add to Chatbot Conversation Logic:**

```python
# Inside the WebSocket handler, add this pain assessment flow

async def assess_child_injuries(websocket_message: str) -> dict:
    """
    Parse child's pain report and create injury assessment.
    
    REQUIRED for: Child Interface > Pain Reporting
    
    Process flow:
    1. Bot asks: "Where does it hurt?"
    2. Child responds with injury location/description
    3. System extracts: body_part, pain_level (1-10), description
    4. Sends to ambulance/hospital with incident
    
    Args:
        websocket_message: Child's speech-to-text message
    
    Returns:
        {
            "detected_injury": str,
            "body_part": str,
            "pain_level": int (1-10),
            "requires_immediate_attention": bool,
            "follow_up_question": str
        }
    """
    
    # Pain keywords mapping
    PAIN_KEYWORDS = {
        "head": ["head", "skull", "headache", "temple", "forehead"],
        "chest": ["chest", "ribs", "lungs", "breathing"],
        "abdomen": ["stomach", "belly", "abdomen", "pain below"],
        "legs": ["leg", "legs", "ankle", "feet", "knee"],
        "arms": ["arm", "arms", "elbow", "wrist", "hand"],
        "neck": ["neck", "shoulder", "spine"],
        "back": ["back", "spine", "lower back"],
    }
    
    PAIN_INTENSITY = {
        "mild": [1, 2, 3],
        "moderate": [4, 5, 6],
        "severe": [7, 8, 9, 10]
    }
    
    message_lower = websocket_message.lower()
    
    # Detect body part
    detected_body_part = "unknown"
    for part, keywords in PAIN_KEYWORDS.items():
        if any(keyword in message_lower for keyword in keywords):
            detected_body_part = part
            break
    
    # Detect pain level (look for numbers)
    pain_level = 5  # Default moderate
    for intensity, levels in PAIN_INTENSITY.items():
        if intensity in message_lower:
            pain_level = levels[-1]  # Use max of that intensity
    
    # Extract numeric pain level if stated
    import re
    number_match = re.search(r'\b([1-9]|10)\b', message_lower)
    if number_match:
        pain_level = int(number_match.group(1))
    
    # Determine severity
    requires_immediate = pain_level >= 7
    
    # Generate follow-up question
    if detected_body_part == "head":
        follow_up = "Are you able to remember what happened? Did you lose consciousness?"
    elif detected_body_part == "chest":
        follow_up = "Are you having trouble breathing? Any shortness of breath?"
    elif detected_body_part == "abdomen":
        follow_up = "Any nausea or vomiting? Can you move your legs?"
    else:
        follow_up = "Can you move this area? Any numbness or tingling?"
    
    return {
        "detected_injury": f"Reported pain in {detected_body_part}",
        "body_part": detected_body_part,
        "pain_level": pain_level,
        "pain_intensity": "severe" if pain_level >= 7 else "moderate" if pain_level >= 4 else "mild",
        "requires_immediate_attention": requires_immediate,
        "follow_up_question": follow_up
    }
```

### 7.2 Add Injury Assessment to Incident Record

**File:** `main.py`

**Modify Incident Severity Classifier:**

```python
def classify_severity_with_injuries(
    impact: float,
    heart_rate: int,
    temperature: float,
    injury_assessment: dict = None,
    context: str = "accident"
) -> str:
    """
    Enhanced severity classification that includes child-reported injuries.
    
    REQUIRED for: Trauma center selection to use injury data
    
    Args:
        impact: Accelerometer impact magnitude
        heart_rate: BPM
        temperature: Celsius
        injury_assessment: {body_part, pain_level, requires_immediate_attention}
        context: "accident" or "post_incident"
    
    Returns:
        Severity level: "critical", "severe", "moderate", "minor"
    """
    
    # Original algorithm
    severity = classify_severity(impact, heart_rate, temperature, context)
    
    # Enhance with injury data
    if injury_assessment:
        body_part = injury_assessment.get("body_part", "unknown")
        pain_level = injury_assessment.get("pain_level", 5)
        
        # Critical body parts
        if body_part in ["head", "chest", "neck"]:
            if pain_level >= 7:
                return "critical"
            elif pain_level >= 4:
                severity = max(severity, "severe", key=lambda x: ["minor", "moderate", "severe", "critical"].index(x))
        
        # Pain level escalation
        if pain_level >= 9 and severity != "critical":
            return "severe"
    
    return severity
```

---

## SECTION 8: UI/UX MODIFICATIONS REQUIRED

### 8.1 Parent Dashboard Map Layer Modifications

**File:** `artifacts/roadsos/src/pages/ParentDashboardPage.tsx`

**Current Map Shows:** Ambulances, Hospitals

**Required Additions:**

1. **Add Bus Layer to Map**

```typescript
// Add after existing ambulance markers layer

// School Bus Markers
{liveData?.bus && (
  <Marker 
    position={[liveData.bus.lat, liveData.bus.lon]}
    icon={L.icon({
      iconUrl: '/icons/bus-icon.svg',  // Create this SVG
      iconSize: [40, 40],
      className: 'bus-marker'
    })}
  >
    <Popup>
      <div className="popup-content">
        <h3>🚌 School Bus</h3>
        <p><b>Route:</b> {liveData.bus.routeName}</p>
        <p><b>Status:</b> {liveData.bus.status}</p>
        <p><b>Driver:</b> {liveData.bus.driverName}</p>
        <a href="#" onClick={() => trackBusHistory()}>View Route History</a>
      </div>
    </Popup>
  </Marker>
)}

// Bus Route Polyline
{liveData?.busRoute && (
  <Polyline 
    positions={liveData.busRoute.coordinates}
    color="blue"
    weight={3}
    opacity={0.5}
    dashArray="5,5"
  />
)}
```

2. **Add Layer Toggle Controls**

```typescript
// Add layer visibility toggles to existing map controls

const MapLayerControls = () => {
  const [visibleLayers, setVisibleLayers] = useState({
    studentLocation: true,
    busLocation: true,          // NEW
    ambulances: true,
    hospitals: true,
    traumaCenters: true,
    policeStations: true
  });

  return (
    <div className="map-layer-controls">
      {Object.entries(visibleLayers).map(([layer, visible]) => (
        <label key={layer}>
          <input 
            type="checkbox" 
            checked={visible}
            onChange={(e) => setVisibleLayers({
              ...visibleLayers,
              [layer]: e.target.checked
            })}
          />
          {layer.replace(/([A-Z])/g, ' $1').toUpperCase()}
        </label>
      ))}
    </div>
  );
};
```

3. **Add Route Safety Analytics Widget**

**File:** `artifacts/roadsos/src/components/RouteSafetyWidget.tsx`

**Create New Component:**

```typescript
import React, { useEffect, useState } from 'react';
import { AlertCircle, TrendingUp, MapPin } from 'lucide-react';

interface RouteSafetyData {
  coverageScore: number;
  averageResponseTime: number;
  gaps: any[];
  recommendation: {
    lat: number;
    lon: number;
    description: string;
  };
}

export const RouteSafetyWidget: React.FC<{ busId: string }> = ({ busId }) => {
  const [safetyData, setSafetyData] = useState<RouteSafetyData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Fetch route safety analytics from backend
    fetchRouteSafetyData(busId);
  }, [busId]);

  const fetchRouteSafetyData = async (busId: string) => {
    try {
      const response = await fetch(`/api/route-safety/${busId}`);
      const data = await response.json();
      setSafetyData(data);
      setLoading(false);
    } catch (error) {
      console.error('Failed to load route safety data:', error);
      setLoading(false);
    }
  };

  if (loading) return <div>Loading safety analytics...</div>;
  if (!safetyData) return null;

  const coverageColor = 
    safetyData.coverageScore >= 85 ? 'green' :
    safetyData.coverageScore >= 70 ? 'yellow' :
    'red';

  return (
    <div className="route-safety-widget">
      <h3>🛣️ Route Safety Analytics</h3>
      
      <div className="coverage-score">
        <span>Coverage Score:</span>
        <span className={`score score-${coverageColor}`}>
          {safetyData.coverageScore}%
        </span>
      </div>

      <div className="response-time">
        <TrendingUp size={16} />
        <span>Average ETA: {safetyData.averageResponseTime} min</span>
      </div>

      {safetyData.gaps.length > 0 && (
        <div className="coverage-gaps">
          <AlertCircle size={16} color="red" />
          <span>{safetyData.gaps.length} Coverage Gaps Identified</span>
          
          <button 
            className="btn-request-coverage"
            onClick={() => submitCoverageRequest(safetyData.recommendation)}
          >
            📍 Request Ambulance Post
          </button>
          
          <div className="recommended-location">
            <p><small>Suggested Location:</small></p>
            <p>{safetyData.recommendation.description}</p>
          </div>
        </div>
      )}
    </div>
  );
};

const submitCoverageRequest = async (location: any) => {
  // Opens modal/form to submit request to authority
  console.log('Submit coverage request for:', location);
};
```

### 8.2 Child Interface: Pain Reporting UI

**File:** `artifacts/roadsos/src/pages/ChildWatchPage.tsx`

**Add Pain Reporting Section:**

```typescript
// Add to existing emergency detected screen

const EmergencyDetectedScreen = ({ incident }) => {
  const [injuryAssessment, setInjuryAssessment] = useState(null);
  const [listeningForPain, setListeningForPain] = useState(false);

  return (
    <div className="emergency-detected-screen">
      <h2>🚨 Emergency Detected</h2>
      <p>RoadSoS is helping you.</p>
      <p>Emergency services are being notified.</p>

      {!injuryAssessment ? (
        <>
          <h3>Voice Assistant</h3>
          <p>"Can you tell me where it hurts?"</p>
          
          <button 
            className="btn-listen"
            onClick={() => startVoiceListening()}
          >
            🎤 {listeningForPain ? 'Listening...' : 'Start Speaking'}
          </button>

          {/* OPTIONAL: Visual Body Map for Pain Reporting */}
          <div className="body-map">
            <p>Or tap where it hurts:</p>
            <BodyMapClickable onPartSelected={(part) => reportPain(part)} />
          </div>
        </>
      ) : (
        <>
          <div className="injury-assessment">
            <h4>✓ Injury Recorded</h4>
            <p><b>{injuryAssessment.body_part}</b></p>
            <p>Pain Level: {injuryAssessment.pain_level}/10</p>
            <p>Ambulance has been notified.</p>
          </div>
        </>
      )}

      <div className="eta-display">
        <p>ETA: <b>{incident.eta_minutes}</b> minutes</p>
      </div>
    </div>
  );
};

// Simple body map component
const BodyMapClickable = ({ onPartSelected }) => {
  const bodyParts = [
    { name: 'Head', coords: [150, 50] },
    { name: 'Chest', coords: [150, 120] },
    { name: 'Abdomen', coords: [150, 170] },
    { name: 'Left Leg', coords: [120, 230] },
    { name: 'Right Leg', coords: [180, 230] },
  ];

  return (
    <div className="body-map-clickable">
      {bodyParts.map(part => (
        <button
          key={part.name}
          className="body-part-btn"
          style={{ left: `${part.coords[0]}px`, top: `${part.coords[1]}px` }}
          onClick={() => onPartSelected(part.name)}
        >
          {part.name}
        </button>
      ))}
    </div>
  );
};
```

### 8.3 Responder Dashboard: Trauma Center Information

**File:** `artifacts/roadsos/src/pages/ResponderDashboardPage.tsx`

**Add Trauma Center Details:**

```typescript
// Modify incident detail panel to show trauma center info

const IncidentDetailPanel = ({ incident }) => {
  return (
    <div className="incident-detail-panel">
      <h2>🚨 Incident #{incident.id}</h2>
      
      {/* Existing fields... */}
      
      {/* NEW: Trauma Center Recommendation */}
      <div className="trauma-center-section">
        <h3>🏥 Recommended Trauma Center</h3>
        
        {incident.traumaCenterSelected && (
          <div className="trauma-center-details">
            <p><b>Hospital:</b> {incident.traumaCenterSelected.name}</p>
            <p><b>Level:</b> {incident.traumaCenterSelected.traumaLevel}</p>
            <p><b>Distance:</b> {incident.traumaCenterSelected.distance} km</p>
            <p><b>ETA:</b> {incident.traumaCenterSelected.eta} min</p>
            
            <div className="specializations">
              <b>Specializations:</b>
              <ul>
                {incident.traumaCenterSelected.specializations.map(spec => (
                  <li key={spec}>{spec}</li>
                ))}
              </ul>
            </div>
            
            {incident.injuryAssessment && (
              <div className="injury-info">
                <b>Child-Reported Injuries:</b>
                <p>Location: {incident.injuryAssessment.body_part}</p>
                <p>Pain Level: {incident.injuryAssessment.pain_level}/10</p>
              </div>
            )}
            
            <button onClick={() => callTraumaCenter(incident.traumaCenterSelected)}>
              📞 Call Trauma Center
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
```

---

## SECTION 9: DESIGN SYSTEM UPDATES

### 9.1 Icons & Visual Indicators

**Create New Icon Files in:** `artifacts/roadsos/public/icons/`

```
bus-icon.svg           // School bus map marker
trauma-center.svg      // Trauma center with "Level 1" indicator
ambulance-desert.svg   // Red zone indicating coverage gap
coverage-zone.svg      // Green zone indicating good coverage
pain-report.svg        // Medical cross for injury reporting
```

### 9.2 Colors & Styling

**Add to:** `artifacts/roadsos/src/styles/theme.css`

```css
/* Route Safety Analytics Colors */
:root {
  --coverage-excellent: #22c55e;  /* Green */
  --coverage-adequate: #eab308;   /* Yellow */
  --coverage-poor: #ef4444;       /* Red */
  
  --trauma-level-1: #991b1b;      /* Dark red - highest level */
  --trauma-level-2: #dc2626;      /* Medium red */
  --trauma-level-3: #fca5a5;      /* Light red */
  
  --bus-active: #3b82f6;          /* Blue */
  --ambulance-en-route: #f59e0b;  /* Amber */
  --incident-critical: #dc2626;   /* Red */
}

.coverage-gap-indicator {
  animation: pulse-red 2s infinite;
}

@keyframes pulse-red {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

.ambulance-desert-zone {
  fill: rgba(239, 68, 68, 0.2);
  stroke: #ef4444;
  stroke-width: 2;
  stroke-dasharray: 4;
}

.good-coverage-zone {
  fill: rgba(34, 197, 94, 0.1);
  stroke: #22c55e;
  stroke-width: 2;
}
```

---

## SECTION 10: OFFLINE FUNCTIONALITY ENHANCEMENTS

### 10.1 Service Worker for Offline Maps

**File:** `artifacts/roadsos/public/service-worker.js`

```javascript
// Cache critical map tiles and assets for offline access

const CACHE_NAME = 'roadsos-v1-offline';
const CRITICAL_ASSETS = [
  '/index.html',
  '/styles/main.css',
  '/js/map.js',
  '/offline-map-data.json'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(CRITICAL_ASSETS);
    })
  );
});

self.addEventListener('fetch', event => {
  if (event.request.method === 'GET') {
    event.respondWith(
      caches.match(event.request).then(response => {
        return response || fetch(event.request).catch(() => {
          return caches.match('/offline-fallback.html');
        });
      })
    );
  }
});
```

---

## SECTION 11: TESTING & VALIDATION CHECKLIST

### 11.1 Functional Testing

**Test Cases for Hackathon Evaluation:**

| Feature | Test Case | Expected Result |
|---------|-----------|-----------------|
| Offline Buffer | Lose connectivity, trigger impact | Incident saved locally |
| Offline Sync | Regain connectivity | Buffered incidents sync automatically |
| Route Coverage | Calculate coverage for known route | Score 0-100 returned correctly |
| Ambulance Desert Detection | Gaps > 10 km identified | Marked as "critical" |
| Trauma Center Selection | Critical severity + head injury | Level 1 hospital selected |
| Bus Tracking | Bus sends GPS update | Appears on parent dashboard map within 5s |
| Pain Reporting | Child reports "head pain 8/10" | Severity upgraded to "critical" |
| Coverage Request | School submits request | Email sent to authority |
| Multi-language | Chatbot in Hindi | Child understands assistant |
| Global: India | Route in Mumbai | Correct trauma centers found |
| Global: US | Route in NYC | Correct trauma centers found |

### 11.2 Performance Testing

- API response time: < 200ms
- Map rendering: < 500ms with 50 markers
- Offline sync: Complete within 30s of connectivity return
- WebSocket message delivery: < 100ms

### 11.3 Reliability Testing

- System continues operating after 1 ambulance offline
- Incorrect child age in database doesn't crash app
- Missing GPS data defaults gracefully
- Network loss doesn't lose incident data

---

**(CONTINUED IN PART 4 - Remaining Code Modifications & Deployment)**
