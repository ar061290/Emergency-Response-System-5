# ROADSOS KIDS V1 - IMPLEMENTATION GUIDE PART 2
## Tech Stack Modifications & Route Safety Analytics

---

## SECTION 3: TECH STACK MODIFICATIONS REQUIRED

### 3.1 NEW DEPENDENCIES TO ADD

#### For Route Safety Analytics & Geospatial Analysis

**File:** `requirements.txt` or `pyproject.toml`

**Add These Packages (EXACT versions to ensure compatibility):**

```
# Existing (keep all current)
fastapi==0.104.1
uvicorn==0.24.0
pydantic==2.5.0
sqlalchemy==2.0.23
psycopg2-binary==2.9.9

# NEW: Add these lines
geopy==2.4.0                    # Distance calculations, geocoding
shapely==2.0.2                  # Geometric operations for route analysis
geopandas==0.14.1               # Spatial dataframe operations
scipy==1.11.4                   # Statistical functions for coverage analysis
numpy==1.26.3                   # Numerical operations
folium==0.14.0                  # Map visualization for coverage reports
redis==5.0.1                    # Caching for frequently calculated routes
firebase-admin==6.2.0           # Push notifications (FCM - Firebase Cloud Messaging)
twilio==8.10.0                  # SMS fallback for parent notifications
```

**Why These Packages:**
- `geopy` + `shapely` + `geopandas`: Required for calculating ambulance coverage zones, identifying deserts, computing coverage scores
- `scipy` + `numpy`: Statistical analysis of response times across routes
- `folium`: Visualization of coverage gaps in parent dashboard
- `redis`: Cache coverage calculations (expensive geospatial operations)
- `firebase-admin`: Multi-channel push notifications (in-app, FCM for Android/iOS)
- `twilio`: SMS notifications to parents when app unavailable

**Installation Command:**
```bash
pip install -r requirements.txt
# OR if using poetry
poetry add geopy shapely geopandas scipy numpy folium redis firebase-admin twilio
```

#### For Frontend: Map Rendering & Real-time Updates

**File:** `artifacts/roadsos/package.json`

**Add These Dependencies (EXACT versions):**

```json
{
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "vite": "^5.0.0",
    
    // NEW: Add these
    "leaflet": "^1.9.4",
    "react-leaflet": "^4.2.1",
    "@react-leaflet/core": "^2.1.0",
    "leaflet-markercluster": "^1.5.1",
    "@visx/visx": "^3.0.0",
    "recharts": "^2.10.3",
    "socket.io-client": "^4.7.2",
    "zustand": "^4.4.1"
  }
}
```

**Why These Packages:**
- `leaflet` + `react-leaflet`: Professional map rendering with layers (ambulances, hospitals, trauma centers, routes)
- `@react-leaflet/core`: Advanced map interactions
- `leaflet-markercluster`: Cluster markers when zoomed out (prevents UI clutter)
- `@visx/visx` + `recharts`: Complex data visualization for coverage analytics
- `socket.io-client`: Real-time tracking updates from backend
- `zustand`: State management for live tracking data

**Installation:**
```bash
cd artifacts/roadsos
npm install
# Or
yarn add [packages]
```

### 3.2 DATABASE SCHEMA ADDITIONS

#### NEW TABLE: RouteAnalytics

**File:** `lib/db/src/schema/route_analytics.ts`

**Create New File With:**

```typescript
import { pgTable, serial, text, numeric, integer, timestamp, jsonb, index } from "drizzle-orm/pg-core";

export const routeAnalytics = pgTable(
  "route_analytics",
  {
    id: serial("id").primaryKey(),
    
    // Route identification
    routeName: text("route_name").notNull(),
    startLocation: jsonb("start_location").notNull(),  // {lat, lon, name}
    endLocation: jsonb("end_location").notNull(),      // {lat, lon, name}
    routeGeoJson: jsonb("route_geojson").notNull(),   // Full GeoJSON linestring
    
    // Coverage metrics
    coverageScore: numeric("coverage_score", { precision: 5, scale: 2 }).notNull(),  // 0-100%
    averageAmbulanceDistance: numeric("avg_ambulance_distance_km", { precision: 6, scale: 2 }).notNull(),
    averageResponseTime: integer("avg_response_time_minutes").notNull(),
    
    // Analysis data
    incidentCount: integer("incident_count").default(0),
    totalChildrenOnRoute: integer("total_children_on_route").default(0),
    ambulancesNearby: jsonb("ambulances_nearby"),  // [{id, name, distance}]
    
    // Recommendations
    recommendedPostLocation: jsonb("recommended_post_location"),  // {lat, lon, name}
    predictedImprovement: jsonb("predicted_improvement"),  // {currentETA, projectedETA}
    
    // Metadata
    lastAnalyzed: timestamp("last_analyzed", { mode: "date" }).defaultNow(),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow(),
  },
  (table) => ({
    routeNameIdx: index("route_analytics_name_idx").on(table.routeName),
    coverageIdx: index("route_analytics_coverage_idx").on(table.coverageScore),
  })
);

export type RouteAnalytic = typeof routeAnalytics.$inferSelect;
export type NewRouteAnalytic = typeof routeAnalytics.$inferInsert;
```

#### NEW TABLE: AmbulanceCoverageRequests

**File:** `lib/db/src/schema/ambulance_coverage_requests.ts`

**Create New File With:**

```typescript
import { pgTable, serial, text, varchar, timestamp, jsonb, index, boolean } from "drizzle-orm/pg-core";

export const ambulanceCoverageRequests = pgTable(
  "ambulance_coverage_requests",
  {
    id: serial("id").primaryKey(),
    
    // Request details
    routeAnalyticsId: serial("route_analytics_id").notNull(),  // Foreign key
    requestingSchoolId: text("requesting_school_id").notNull(),
    requestingSchoolName: text("requesting_school_name").notNull(),
    requestingSchoolEmail: text("requesting_school_email").notNull(),
    
    // Issue description
    description: text("description").notNull(),
    currentCoverageGap: jsonb("current_coverage_gap").notNull(),  // {distance, time}
    proposedAmbulanceLocation: jsonb("proposed_ambulance_location").notNull(),  // {lat, lon, name}
    
    // Authority routing
    targetAuthority: varchar("target_authority", { length: 100 }).notNull(),  // "Municipal", "State EMS", "Regional"
    authorityContactEmail: text("authority_contact_email"),
    authorityContactPhone: text("authority_contact_phone"),
    authorityName: text("authority_name"),
    
    // Status tracking
    status: varchar("status", { length: 20 }).default("submitted").notNull(),  // submitted, under_review, approved, rejected, implemented
    submissionDate: timestamp("submission_date", { mode: "date" }).defaultNow(),
    reviewDate: timestamp("review_date", { mode: "date" }),
    resolutionDate: timestamp("resolution_date", { mode: "date" }),
    
    // Response from authority
    authorityResponse: text("authority_response"),
    authorityNotes: jsonb("authority_notes"),
    
    // Impact metrics
    estimatedChildrenBenefited: serial("estimated_children_benefited"),
    estimatedResponseTimeReduction: serial("estimated_response_time_reduction_minutes"),
    
    // Metadata
    isPublic: boolean("is_public").default(true),  // Can be shared in transparency reports
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow(),
  },
  (table) => ({
    schoolIdx: index("coverage_req_school_idx").on(table.requestingSchoolId),
    statusIdx: index("coverage_req_status_idx").on(table.status),
    routeIdx: index("coverage_req_route_idx").on(table.routeAnalyticsId),
  })
);

export type AmbulanceCoverageRequest = typeof ambulanceCoverageRequests.$inferSelect;
export type NewAmbulanceCoverageRequest = typeof ambulanceCoverageRequests.$inferInsert;
```

#### MODIFY EXISTING TABLE: incidents

**File:** `lib/db/src/schema/incidents.ts`

**Add These Fields to Existing Table:**

```typescript
// Add these new fields to the existing incidents table definition

busId: text("bus_id"),                              // School bus identifier
busLocation: jsonb("bus_location"),                 // {lat, lon} at time of incident
busRoute: text("bus_route"),                        // School route identifier
schoolId: text("school_id"),                        // School identifier
traumaCenterSelected: text("trauma_center_selected"), // ID of selected trauma center
traumaCenterReason: jsonb("trauma_center_reason"),    // {reason, matchScore, capabilities}
offlineBuffer: jsonb("offline_buffer"),              // {buffered: true, bufferedAt, syncedAt}
```

**Why These Changes:**
- Route analytics: Track ambulance coverage across frequently-used school routes
- Coverage requests: Enable schools to request ambulance posts in underserved areas
- Enhanced incidents: Track which trauma center was selected and why (for audit/learning)
- Bus integration: Link incidents to specific buses and routes

---

## SECTION 4: ROUTE SAFETY ANALYTICS IMPLEMENTATION

### 4.1 Coverage Score Calculation Algorithm

**File:** `main.py` (ADD NEW FUNCTION after line 286)

**Function Name:** `calculate_route_coverage_score`

```python
def calculate_route_coverage_score(
    route_geojson: dict,
    ambulances_list: list,
    target_response_time_minutes: int = 8
) -> dict:
    """
    Calculate ambulance coverage score for a specific route.
    
    REQUIRED for Route Safety Analytics feature.
    
    Ideal product specifies:
    "Platform identifies routes frequently used by children where ambulance 
    availability is consistently poor."
    
    Args:
        route_geojson: GeoJSON LineString representing route
        ambulances_list: List of ambulances with {id, lat, lon, status}
        target_response_time_minutes: Target ETA in minutes (default 8)
    
    Returns:
        {
            "coverage_score": float (0-100),
            "description": str,
            "average_response_time": int,
            "gaps": [
                {
                    "lat": float,
                    "lon": float,
                    "gap_severity": str,
                    "nearest_ambulance_distance": float
                }
            ],
            "summary": str
        }
    """
    from shapely.geometry import LineString, Point
    import numpy as np
    
    try:
        # Parse route as GeoJSON LineString
        coordinates = route_geojson.get("coordinates", [])
        if not coordinates or len(coordinates) < 2:
            return {
                "error": "Invalid route GeoJSON",
                "coverage_score": 0
            }
        
        route_line = LineString(coordinates)
        route_length_m = route_line.length  # In degrees, ~111km per degree at equator
        route_length_km = route_length_m * 111  # Approximate conversion
        
        # Sample points along route (every 100m)
        sample_points = []
        num_samples = max(10, int(route_length_km * 10))  # 10 points per km
        
        for i in range(num_samples):
            fraction = i / num_samples
            point = route_line.interpolate(fraction, normalized=True)
            sample_points.append({
                "lat": point.y,
                "lon": point.x,
                "index": i
            })
        
        # For each sample point, find nearest ambulance
        response_times = []
        gaps = []
        gap_threshold_km = target_response_time_minutes * 0.5  # Assume 30 km/h
        
        for sample in sample_points:
            sample_point = Point(sample["lon"], sample["lat"])
            
            if not ambulances_list:
                # No ambulances available
                response_times.append(999)
                gaps.append({
                    "lat": sample["lat"],
                    "lon": sample["lon"],
                    "gap_severity": "critical",
                    "nearest_ambulance_distance": None
                })
                continue
            
            # Find nearest ambulance
            min_distance_km = float('inf')
            nearest_ambulance = None
            
            for ambulance in ambulances_list:
                if ambulance.get("status") != "available":
                    continue
                
                amb_point = Point(ambulance["lon"], ambulance["lat"])
                distance_degrees = sample_point.distance(amb_point)
                distance_km = distance_degrees * 111  # Rough conversion
                
                if distance_km < min_distance_km:
                    min_distance_km = distance_km
                    nearest_ambulance = ambulance
            
            if nearest_ambulance:
                # Estimate response time (distance / avg speed)
                # Assuming average urban speed: 30 km/h in traffic
                estimated_eta_minutes = int((min_distance_km / 30) * 60)
                response_times.append(estimated_eta_minutes)
                
                if estimated_eta_minutes > target_response_time_minutes:
                    gaps.append({
                        "lat": sample["lat"],
                        "lon": sample["lon"],
                        "gap_severity": "high" if estimated_eta_minutes > 15 else "medium",
                        "nearest_ambulance_distance": round(min_distance_km, 1),
                        "estimated_eta_minutes": estimated_eta_minutes
                    })
        
        # Calculate coverage score
        if not response_times or all(t == 999 for t in response_times):
            coverage_score = 0.0
            avg_response = 999
        else:
            # Points within target response time / total points
            points_within_target = sum(1 for t in response_times if t <= target_response_time_minutes and t != 999)
            coverage_percentage = (points_within_target / len(response_times)) * 100 if response_times else 0
            coverage_score = round(coverage_percentage, 1)
            avg_response = int(np.mean([t for t in response_times if t != 999])) if any(t != 999 for t in response_times) else 999
        
        # Determine severity description
        if coverage_score >= 85:
            description = "✅ Excellent coverage"
        elif coverage_score >= 70:
            description = "⚠️ Adequate coverage with some gaps"
        elif coverage_score >= 50:
            description = "🔴 Poor coverage - multiple gaps"
        else:
            description = "❌ Critical - ambulance desert"
        
        return {
            "coverage_score": coverage_score,
            "description": description,
            "average_response_time": avg_response,
            "route_length_km": round(route_length_km, 1),
            "gaps": gaps[:10],  # Top 10 worst gaps
            "gap_count": len(gaps),
            "summary": f"Route has {coverage_score}% coverage with {len(gaps)} critical gaps. Avg ETA: {avg_response} min."
        }
    
    except Exception as e:
        return {
            "error": str(e),
            "coverage_score": 0
        }
```

**Why This Change:**
- Hackathon requirement: "Route Safety Analytics"
- Ideal product: "Identifies routes frequently used by children where ambulance availability is consistently poor"
- Evaluation criteria includes: "Innovation & additional features"
- This algorithm identifies ambulance deserts, enabling data-driven infrastructure improvements

### 4.2 Recommended Ambulance Post Location Algorithm

**File:** `main.py` (ADD NEW FUNCTION after coverage score function)

**Function Name:** `suggest_ambulance_post_location`

```python
def suggest_ambulance_post_location(
    route_geojson: dict,
    gaps: list,
    existing_ambulances: list
) -> dict:
    """
    Suggest optimal location for a new ambulance post on a route.
    
    REQUIRED for: "Suggested Ambulance Post" feature in ideal product.
    
    Uses cluster analysis of gaps to find worst-served location.
    
    Args:
        route_geojson: GeoJSON LineString
        gaps: List of coverage gaps from calculate_route_coverage_score
        existing_ambulances: List of current ambulance locations
    
    Returns:
        {
            "recommended_location": {lat, lon, description},
            "rationale": str,
            "predicted_improvement": {currentETA, projectedETA},
            "coverage_improvement": float,
            "estimated_lives_impacted": int
        }
    """
    from shapely.geometry import LineString, Point
    from scipy.cluster.hierarchy import fclusterdata
    import numpy as np
    
    if not gaps or len(gaps) < 3:
        return {
            "recommendation": "No significant gaps identified",
            "recommended_location": None
        }
    
    # Cluster gaps geographically
    gap_coordinates = np.array([[g["lat"], g["lon"]] for g in gaps])
    
    try:
        # Use hierarchical clustering to find clusters of gaps
        # Distance threshold ~ 2 km (0.018 degrees)
        clusters = fclusterdata(gap_coordinates, t=0.018, criterion='distance', method='complete')
        
        # Find the largest/worst cluster
        unique_clusters, cluster_sizes = np.unique(clusters, return_counts=True)
        worst_cluster_id = unique_clusters[np.argmax(cluster_sizes)]
        worst_cluster_points = gap_coordinates[clusters == worst_cluster_id]
        
        # Recommended location = center of worst cluster
        recommended_lat = float(np.mean(worst_cluster_points[:, 0]))
        recommended_lon = float(np.mean(worst_cluster_points[:, 1]))
        
        # Find closest named location or intersection
        location_description = f"Sector near coordinates ({recommended_lat:.4f}, {recommended_lon:.4f})"
        
        # Calculate current average response time in this cluster
        current_times = [g.get("estimated_eta_minutes", 15) for g in gaps if clusters[gaps.index(g)] == worst_cluster_id]
        current_avg = np.mean(current_times) if current_times else 15
        
        # Simulate adding ambulance at recommended location
        # New ambulance would be at center of cluster
        new_amb_point = Point(recommended_lon, recommended_lat)
        
        # Estimate new average response time from this location
        # Assuming ambulance at this location can cover the cluster in ~5 min
        projected_avg = (current_avg + 5) / 2  # Average improvement
        time_reduction = int(current_avg - projected_avg)
        
        # Estimate children benefited (assume ~200 children per route)
        estimated_children = 200
        
        return {
            "recommended_location": {
                "lat": round(recommended_lat, 6),
                "lon": round(recommended_lon, 6),
                "description": location_description
            },
            "rationale": f"This location serves the {len(worst_cluster_points)} most critical gap points on the route",
            "predicted_improvement": {
                "current_eta_minutes": int(current_avg),
                "projected_eta_minutes": int(projected_avg),
                "time_reduction_minutes": time_reduction
            },
            "coverage_improvement_percent": round((time_reduction / current_avg) * 100, 1),
            "estimated_children_benefited": estimated_children,
            "data_points_in_cluster": len(worst_cluster_points),
            "next_step": "Submit coverage request to local EMS authority via Platform"
        }
    
    except Exception as e:
        return {
            "error": str(e),
            "recommended_location": None
        }
```

**Why This Change:**
- Ideal product shows: "Suggested Ambulance Post: Sector 5 Junction"
- This is an innovation beyond basic incident response
- Enables systematic infrastructure improvement
- Addresses hackathon evaluation: "Innovation & additional features"

---

## SECTION 5: AMBULANCE COVERAGE REQUESTS SYSTEM

### 5.1 API Endpoint: Submit Coverage Request

**File:** `main.py` (ADD NEW ENDPOINT - add after line 750)

**Endpoint Code:**

```python
@app.post("/submit-coverage-request")
async def submit_coverage_request(
    route_name: str = Query(...),
    school_id: str = Query(...),
    school_name: str = Query(...),
    school_email: str = Query(...),
    description: str = Query(...),
    proposed_location: dict = Query(...),  # {lat, lon, name}
    target_authority: str = Query(...)  # "Municipal", "State", "Regional"
):
    """
    REQUIRED for: Ambulance Coverage Requests System
    
    Schools can submit requests for ambulance posts in underserved areas.
    These requests are routed to appropriate authorities.
    
    Args:
        route_name: School route identifier
        school_id: School's unique ID
        school_name: School name
        school_email: School contact email
        description: Reason for request (describe the coverage gap)
        proposed_location: {lat, lon, name} for new ambulance post
        target_authority: Who to notify ("Municipal EMS", "State Ambulance", etc)
    
    Returns:
        Request submission confirmation with tracking ID
    """
    
    try:
        # Create database entry
        # (In real implementation, this would use ORM to insert into ambulance_coverage_requests table)
        
        request_id = f"req_{int(datetime.utcnow().timestamp() * 1000)}"
        
        request_data = {
            "request_id": request_id,
            "route_name": route_name,
            "school_id": school_id,
            "school_name": school_name,
            "school_email": school_email,
            "description": description,
            "proposed_location": proposed_location,
            "target_authority": target_authority,
            "status": "submitted",
            "submission_date": datetime.utcnow().isoformat()
        }
        
        # TODO: Save to database
        # db_request = db.execute(
        #     insert(ambulance_coverage_requests).values(request_data)
        # )
        
        # Send email to authority
        authority_email = get_authority_email_by_region(proposed_location)
        
        if authority_email:
            send_authority_notification(
                request_id=request_id,
                school_name=school_name,
                proposed_location=proposed_location,
                authority_email=authority_email
            )
        
        return {
            "status": "submitted",
            "request_id": request_id,
            "message": f"Coverage request submitted and routed to {target_authority}",
            "tracking_url": f"/coverage-requests/{request_id}",
            "expected_review_time": "7-14 days"
        }
    
    except Exception as e:
        return {
            "status": "error",
            "error": str(e)
        }


def get_authority_email_by_region(location: dict) -> str:
    """
    Look up appropriate authority email based on location.
    This would query a database of authorities by region.
    """
    # TODO: Implement database lookup
    # For now, return placeholder
    return "ems_authority@local_municipality.gov"


def send_authority_notification(
    request_id: str,
    school_name: str,
    proposed_location: dict,
    authority_email: str
):
    """
    Send email to local authority about coverage request.
    """
    try:
        # TODO: Implement email sending (using SMTP or service like SendGrid)
        # This is a placeholder
        print(f"[EMAIL] Sending coverage request {request_id} to {authority_email}")
    except Exception as e:
        print(f"Failed to send authority notification: {e}")
```

### 5.2 API Endpoint: Get Coverage Request Status

**File:** `main.py` (ADD NEW ENDPOINT - add after coverage request submission)

```python
@app.get("/coverage-requests/{request_id}")
async def get_coverage_request_status(request_id: str):
    """
    Get status and details of a coverage request.
    
    REQUIRED for: Schools and authorities to track requests.
    
    Returns:
        Full request details including:
        - Current status (submitted, under_review, approved, implemented)
        - Authority response
        - Timeline
        - Expected impact
    """
    try:
        # TODO: Query database for request details
        # request = db.query(ambulance_coverage_requests).filter_by(id=request_id).first()
        
        # Placeholder response
        return {
            "request_id": request_id,
            "status": "under_review",
            "submitted_by": "Green Valley School",
            "route": "Home → School Route 5",
            "proposed_location": {"lat": 12.9252, "lon": 77.6245, "name": "Sector 5 Junction"},
            "target_authority": "Municipal EMS",
            "submission_date": "2024-01-15",
            "review_date": "2024-01-18",
            "expected_resolution": "2024-02-15",
            "authority_response": "Request under evaluation. Site survey scheduled.",
            "estimated_children_benefited": 200,
            "estimated_improvement": "11 min → 5 min response time",
            "progress": "50%"
        }
    
    except Exception as e:
        return {"error": str(e)}
```

---

**(CONTINUED IN PART 3)**
