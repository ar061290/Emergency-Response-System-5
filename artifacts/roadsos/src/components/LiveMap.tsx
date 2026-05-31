import { useEffect, useMemo } from "react";
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from "react-leaflet";
import L from "leaflet";
import { Bus, Heart, Ambulance, Building2, Shield } from "lucide-react";
import { renderToString } from "react-dom/server";
import type { SchoolBus, PoliceStation } from "@workspace/api-client-react";

/* ── Custom icon helpers ── */
function makeIcon(color: string, content: React.ReactNode, size = 28) {
  const svgString = renderToString(
    <div style={{ width: size, height: size, borderRadius: 999, background: color, border: "2px solid #fff", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 2px 6px rgba(0,0,0,0.4)" }}>
      {content}
    </div>
  );
  return L.divIcon({
    html: svgString,
    className: "",
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

function makeTraumaIcon() {
  const svgString = renderToString(
    <div style={{ width: 30, height: 30, borderRadius: 4, background: "#dc2626", border: "2px solid #fff", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 2px 6px rgba(0,0,0,0.5)", fontWeight: "bold", color: "#fff", fontSize: 14 }}>
      🏥
    </div>
  );
  return L.divIcon({ html: svgString, className: "", iconSize: [30, 30], iconAnchor: [15, 15] });
}

function AutoFitBounds({ points }: { points: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length === 0) return;
    const valid = points.filter((p) => p[0] != null && p[1] != null);
    if (valid.length === 0) return;
    const bounds = L.latLngBounds(valid.map((p) => L.latLng(p[0], p[1])));
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 16 });
  }, [map, points]);
  return null;
}

/* ── Props ── */
export interface LiveMapProps {
  childLat?: number | null;
  childLon?: number | null;
  childName?: string | null;
  ambulanceLat?: number | null;
  ambulanceLon?: number | null;
  ambulanceUnit?: string | null;
  hospitalLat?: number | null;
  hospitalLon?: number | null;
  hospitalName?: string | null;
  hospitalIsTrauma?: boolean;
  bus?: SchoolBus | null;
  incidentStatus?: string | null;
  policeStations?: PoliceStation[];
  traumaCenters?: Array<{ id: string; name: string; latitude: number; longitude: number; type: string }>;
  routeHistory?: Array<[number, number]>;
  showRoutePlayback?: boolean;
}

export default function LiveMap({
  childLat, childLon, childName,
  ambulanceLat, ambulanceLon, ambulanceUnit,
  hospitalLat, hospitalLon, hospitalName, hospitalIsTrauma,
  bus, incidentStatus,
  policeStations = [],
  traumaCenters = [],
  routeHistory = [],
  showRoutePlayback = false,
}: LiveMapProps) {
  const childIcon = useMemo(() => makeIcon("#ef4444", <Heart size={14} color="#fff" />), []);
  const ambulanceIcon = useMemo(() => makeIcon("#3b82f6", <Ambulance size={14} color="#fff" />), []);
  const hospitalIcon = useMemo(() => makeIcon("#22c55e", <Building2 size={14} color="#fff" />), []);
  const traumaIcon = useMemo(() => makeTraumaIcon(), []);
  const busIcon = useMemo(() => makeIcon("#facc15", <Bus size={14} color="#000" />), []);
  const policeIcon = useMemo(() => makeIcon("#6366f1", <Shield size={13} color="#fff" />, 26), []);

  const points: [number, number][] = [];
  if (childLat != null && childLon != null) points.push([childLat, childLon]);
  if (ambulanceLat != null && ambulanceLon != null) points.push([ambulanceLat, ambulanceLon]);
  if (hospitalLat != null && hospitalLon != null) points.push([hospitalLat, hospitalLon]);
  if (bus?.currentLat != null && bus?.currentLon != null) points.push([bus.currentLat, bus.currentLon]);

  const center =
    childLat != null && childLon != null
      ? [childLat, childLon]
      : points[0] ?? [33.749, -84.388];

  return (
    <div className="relative rounded-b-lg overflow-hidden" style={{ height: 380 }}>
      <MapContainer
        center={center as [number, number]}
        zoom={14}
        scrollWheelZoom={false}
        style={{ height: "100%", width: "100%", zIndex: 1 }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <AutoFitBounds points={points} />

        {/* Child */}
        {childLat != null && childLon != null && (
          <Marker position={[childLat, childLon]} icon={childIcon}>
            <Popup className="!text-foreground">
              <div className="space-y-1">
                <div className="font-bold text-sm">{childName ?? "Child"}</div>
                <div className="text-xs text-muted-foreground">{childLat.toFixed(4)}, {childLon.toFixed(4)}</div>
                <div className="text-xs text-red-400 font-medium">Status: {incidentStatus ?? "active"}</div>
              </div>
            </Popup>
          </Marker>
        )}

        {/* Ambulance */}
        {ambulanceLat != null && ambulanceLon != null && (
          <Marker position={[ambulanceLat, ambulanceLon]} icon={ambulanceIcon}>
            <Popup className="!text-foreground">
              <div className="space-y-1">
                <div className="font-bold text-sm">{ambulanceUnit ?? "Ambulance"}</div>
                <div className="text-xs text-muted-foreground">{ambulanceLat.toFixed(4)}, {ambulanceLon.toFixed(4)}</div>
              </div>
            </Popup>
          </Marker>
        )}

        {/* Primary Hospital / Trauma Center */}
        {hospitalLat != null && hospitalLon != null && (
          <Marker position={[hospitalLat, hospitalLon]} icon={hospitalIsTrauma ? traumaIcon : hospitalIcon}>
            <Popup className="!text-foreground">
              <div className="space-y-1">
                <div className="font-bold text-sm">{hospitalName ?? "Hospital"}</div>
                {hospitalIsTrauma && <div className="text-xs text-red-400 font-bold">⚕ Trauma Center</div>}
                <div className="text-xs text-muted-foreground">{hospitalLat.toFixed(4)}, {hospitalLon.toFixed(4)}</div>
              </div>
            </Popup>
          </Marker>
        )}

        {/* Additional Trauma Centers */}
        {traumaCenters.map((tc) => (
          <Marker key={tc.id} position={[tc.latitude, tc.longitude]} icon={traumaIcon}>
            <Popup className="!text-foreground">
              <div className="space-y-1">
                <div className="font-bold text-sm">{tc.name}</div>
                <div className="text-xs text-red-400 font-bold">⚕ Trauma Center</div>
                <div className="text-xs text-muted-foreground">{tc.type}</div>
              </div>
            </Popup>
          </Marker>
        ))}

        {/* Police Stations */}
        {policeStations.map((ps) => (
          <Marker key={ps.id} position={[ps.latitude, ps.longitude]} icon={policeIcon}>
            <Popup className="!text-foreground">
              <div className="space-y-1">
                <div className="font-bold text-sm">{ps.name}</div>
                <div className="text-xs text-indigo-400">{ps.district}</div>
                <div className="text-xs text-muted-foreground">{ps.phone}</div>
              </div>
            </Popup>
          </Marker>
        ))}

        {/* Bus */}
        {bus?.currentLat != null && bus?.currentLon != null && (
          <Marker position={[bus.currentLat, bus.currentLon]} icon={busIcon}>
            <Popup className="!text-foreground">
              <div className="space-y-1">
                <div className="font-bold text-sm">{bus.busNumber ?? bus.busId}</div>
                <div className="text-xs text-muted-foreground">{bus.schoolName} — {bus.routeName}</div>
                {bus.currentLocationName && <div className="text-xs text-muted-foreground">{bus.currentLocationName}</div>}
                <div className="text-xs text-muted-foreground">{bus.currentLat.toFixed(4)}, {bus.currentLon.toFixed(4)}</div>
              </div>
            </Popup>
          </Marker>
        )}

        {/* Route line: ambulance → child */}
        {ambulanceLat != null && ambulanceLon != null && childLat != null && childLon != null && (
          <Polyline positions={[[ambulanceLat, ambulanceLon], [childLat, childLon]]} color="#3b82f6" weight={3} dashArray="6 4" opacity={0.7} />
        )}

        {/* Route line: child → hospital */}
        {childLat != null && childLon != null && hospitalLat != null && hospitalLon != null && (
          <Polyline positions={[[childLat, childLon], [hospitalLat, hospitalLon]]} color="#22c55e" weight={3} dashArray="6 4" opacity={0.7} />
        )}

        {/* Historical route playback */}
        {showRoutePlayback && routeHistory.length > 1 && (
          <Polyline positions={routeHistory} color="#f59e0b" weight={3} opacity={0.85} />
        )}
      </MapContainer>

      {/* Legend overlay */}
      <div className="absolute bottom-3 left-3 z-[500] bg-card/90 border border-border rounded-lg px-3 py-2 space-y-1 shadow-lg backdrop-blur">
        <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-red-500" /><span className="text-xs text-slate-300">Child</span></div>
        <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-blue-500" /><span className="text-xs text-slate-300">Ambulance</span></div>
        <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-green-500" /><span className="text-xs text-slate-300">Hospital</span></div>
        <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-sm bg-red-600 border border-white" /><span className="text-xs text-slate-300">Trauma Center</span></div>
        {policeStations.length > 0 && (
          <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-indigo-500" /><span className="text-xs text-slate-300">Police</span></div>
        )}
        {bus && (
          <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-sm bg-yellow-400" /><span className="text-xs text-slate-300">Bus</span></div>
        )}
        {showRoutePlayback && routeHistory.length > 1 && (
          <div className="flex items-center gap-1.5"><div className="w-5 h-0.5 bg-yellow-500" /><span className="text-xs text-slate-300">Route history</span></div>
        )}
      </div>
    </div>
  );
}
