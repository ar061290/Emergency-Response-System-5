import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  ArrowLeft, AlertTriangle, Activity, Heart, Thermometer, Building2,
  Clock, MapPin, CheckCircle, ChevronRight, User, Zap, Shield
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import {
  LineChart, Line, ResponsiveContainer, Tooltip as RechartTooltip, YAxis
} from "recharts";
import {
  useGetActiveIncidents, getGetActiveIncidentsQueryKey,
  useGetIncident, getGetIncidentQueryKey,
  useGetIncidentVitals, getGetIncidentVitalsQueryKey,
  useListHospitals, getListHospitalsQueryKey,
  useGetChild, getGetChildQueryKey,
  useUpdateIncidentStatus,
  useGetAiHospitalRecommendation,
} from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";

const INCIDENT_STATUSES = [
  { key: "active",       label: "Idle",          short: "IDLE" },
  { key: "en_route",     label: "En Route",       short: "EN ROUTE" },
  { key: "on_scene",     label: "On Scene",       short: "ON SCENE" },
  { key: "transporting", label: "Transporting",   short: "TRANSPORT" },
  { key: "at_hospital",  label: "At Hospital",    short: "AT HOSP" },
];

function SeverityBadge({ severity }: { severity: string }) {
  const cfg: Record<string, string> = {
    critical: "bg-red-900/60 text-red-300 border-red-700 animate-pulse",
    moderate: "bg-yellow-900/60 text-yellow-300 border-yellow-700",
    minor:    "bg-green-900/60 text-green-300 border-green-700",
  };
  return (
    <span className={`px-3 py-1 rounded-full text-sm font-bold uppercase border tracking-wide ${cfg[severity] ?? cfg.minor}`}>
      {severity}
    </span>
  );
}

function AllergyBadge({ allergy }: { allergy: string }) {
  return (
    <span
      className="px-2 py-0.5 rounded-full text-xs font-bold uppercase border bg-red-950 text-red-300 border-red-600"
      data-testid={`badge-allergy-${allergy.replace(/\s/g, "-").toLowerCase()}`}
    >
      {allergy}
    </span>
  );
}

function StatusStepper({ currentStatus }: { currentStatus: string }) {
  const currentIdx = INCIDENT_STATUSES.findIndex((s) => s.key === currentStatus);
  return (
    <div className="flex items-center gap-0" data-testid="status-stepper">
      {INCIDENT_STATUSES.map((step, i) => {
        const done = i < currentIdx;
        const active = i === currentIdx;
        return (
          <div key={step.key} className="flex items-center">
            <div
              className={`flex flex-col items-center ${active ? "opacity-100" : done ? "opacity-70" : "opacity-30"}`}
              data-testid={`step-${step.key}`}
            >
              <div
                className={`w-6 h-6 rounded-full border-2 flex items-center justify-center text-xs font-bold transition-all ${
                  active
                    ? "bg-blue-600 border-blue-400 text-white scale-110"
                    : done
                    ? "bg-green-700 border-green-500 text-white"
                    : "bg-slate-800 border-slate-600 text-slate-500"
                }`}
              >
                {done ? <CheckCircle size={12} /> : i + 1}
              </div>
              <span className={`text-xs mt-1 font-mono tracking-tighter ${active ? "text-blue-300" : done ? "text-green-400" : "text-slate-600"}`}>
                {step.short}
              </span>
            </div>
            {i < INCIDENT_STATUSES.length - 1 && (
              <div className={`w-6 h-px mx-1 mb-4 ${i < currentIdx ? "bg-green-600" : "bg-slate-700"}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function ResponderDashboardPage() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [aiRankings, setAiRankings] = useState<Record<string, number>>({});
  const [aiAssessment, setAiAssessment] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  useEffect(() => {
    const source = new EventSource("/api/events");
    source.addEventListener("incident:created", (e) => {
      try {
        const data = JSON.parse(e.data);
        queryClient.invalidateQueries({ queryKey: getGetActiveIncidentsQueryKey() });
        toast({ title: "🚨 New Incident", description: `${data.childName ?? "Child"} — ${data.severity ?? ""} severity`, duration: 8000 });
      } catch { /* ignore */ }
    });
    source.addEventListener("incident:updated", () => {
      queryClient.invalidateQueries({ queryKey: getGetActiveIncidentsQueryKey() });
    });
    source.addEventListener("vitals:new", (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.incidentId) queryClient.invalidateQueries({ queryKey: getGetIncidentVitalsQueryKey(data.incidentId) });
      } catch { /* ignore */ }
    });
    source.onerror = () => source.close();
    return () => source.close();
  }, [queryClient, toast]);

  const { data: activeIncidents, isLoading } = useGetActiveIncidents({
    query: { refetchInterval: 3000, queryKey: getGetActiveIncidentsQueryKey() },
  });

  const incidentId = selectedId ?? activeIncidents?.[0]?.incidentId ?? "";

  const { data: incident, refetch: refetchIncident } = useGetIncident(incidentId, {
    query: { enabled: !!incidentId, refetchInterval: 4000, queryKey: getGetIncidentQueryKey(incidentId) },
  });

  const { data: vitals } = useGetIncidentVitals(incidentId, {
    query: { enabled: !!incidentId, refetchInterval: 3000, queryKey: getGetIncidentVitalsQueryKey(incidentId) },
  });

  const { data: hospitals } = useListHospitals(
    incident ? { lat: incident.latitude, lng: incident.longitude } : undefined,
    { query: { enabled: !!incident, refetchInterval: 30000, queryKey: getListHospitalsQueryKey(incident ? { lat: incident.latitude, lng: incident.longitude } : undefined) } }
  );

  const { data: child } = useGetChild(incident?.childId ?? "", {
    query: { enabled: !!incident?.childId, queryKey: getGetChildQueryKey(incident?.childId ?? "") },
  });

  const aiRecommendation = useGetAiHospitalRecommendation();

  const updateStatus = useUpdateIncidentStatus();

  const latestVitals = vitals?.[0];
  const vitalsHistory = [...(vitals ?? [])].reverse();
  const heartRateData = vitalsHistory.map((v) => ({ bpm: v.heartRate }));
  const summary = activeIncidents?.find((i) => i.incidentId === incidentId);

  const topHospital = hospitals?.map((h) => ({
    ...h,
    confidenceScore: aiRankings[h.id] ?? null,
  }))[0] ?? null;

  useEffect(() => {
    if (!incident || !hospitals?.length || aiLoading || Object.keys(aiRankings).length > 0) return;
    setAiLoading(true);
    aiRecommendation.mutate(
      {
        data: {
          incident: {
            severity: incident.severity,
            heartRate: incident.heartRate ?? undefined,
            temperature: incident.temperature ?? undefined,
            impactMagnitude: incident.impactMagnitude ?? undefined,
            childAge: incident.childAge,
            medicalConditions: child?.medicalConditions ?? [],
            allergies: child?.allergies ?? [],
          },
          hospitals: hospitals.map((h) => ({
            id: h.id,
            name: h.name,
            type: h.type,
            traumaBeds: h.traumaBeds,
            icuBeds: h.icuBeds,
            hasPediatricTeam: h.hasPediatricTeam,
            hasTraumaSurgery: h.hasTraumaSurgery,
            hasCTScan: h.hasCTScan,
            rating: h.rating ?? 4.0,
            distanceKm: (h as { distanceKm?: number }).distanceKm,
            etaMinutes: (h as { etaMinutes?: number }).etaMinutes,
          })),
        },
      },
      {
        onSuccess: (data) => {
          const rankMap: Record<string, number> = {};
          (data.rankings ?? []).forEach((r: { id: string; confidenceScore: number }) => {
            rankMap[r.id] = r.confidenceScore;
          });
          setAiRankings(rankMap);
          setAiAssessment((data as { aiAssessment?: string }).aiAssessment ?? null);
          setAiLoading(false);
        },
        onError: () => setAiLoading(false),
      }
    );
  }, [incidentId, hospitals?.length, child]);


  const handleStatusUpdate = (newStatus: string) => {
    if (!incidentId) return;
    updateStatus.mutate(
      { incidentId, data: { status: newStatus } },
      {
        onSuccess: () => {
          refetchIncident();
          toast({ title: `Status updated to ${newStatus.replace(/_/g, " ")}` });
        },
        onError: () => toast({ title: "Failed to update status", variant: "destructive" }),
      }
    );
  };

  const nextStatus = () => {
    if (!incident) return null;
    const idx = INCIDENT_STATUSES.findIndex((s) => s.key === incident.status);
    return idx >= 0 && idx < INCIDENT_STATUSES.length - 1 ? INCIDENT_STATUSES[idx + 1] : null;
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* Header */}
      <header className="border-b border-border px-4 py-3 flex items-center gap-3 bg-card/40 backdrop-blur sticky top-0 z-10">
        <Link href="/" className="text-muted-foreground hover:text-foreground transition-colors" data-testid="link-back-home">
          <ArrowLeft size={20} />
        </Link>
        <div className="flex items-center gap-2">
          <Zap size={18} className="text-red-400" />
          <span className="font-bold text-base">Emergency Response Dashboard</span>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {activeIncidents && activeIncidents.length > 0 && (
            <Badge className="bg-red-900/50 text-red-300 border-red-700 animate-pulse">
              {activeIncidents.length} active
            </Badge>
          )}
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Incident sidebar */}
        <aside className="w-56 border-r border-border bg-card/30 flex flex-col shrink-0 hidden md:flex">
          <div className="p-3 border-b border-border">
            <span className="text-xs uppercase tracking-widest text-muted-foreground">Incidents</span>
          </div>
          <ScrollArea className="flex-1">
            {isLoading && <div className="p-3 text-sm text-muted-foreground">Loading…</div>}
            {activeIncidents?.length === 0 && (
              <div className="p-4 text-center">
                <Shield size={20} className="text-green-400 mx-auto mb-2" />
                <p className="text-xs text-muted-foreground">No active incidents</p>
              </div>
            )}
            {activeIncidents?.map((inc) => (
              <button
                key={inc.incidentId}
                onClick={() => setSelectedId(inc.incidentId)}
                data-testid={`sidebar-incident-${inc.incidentId}`}
                className={`w-full text-left p-3 border-b border-border hover:bg-accent/30 transition-colors ${
                  incidentId === inc.incidentId ? "bg-primary/10 border-l-2 border-l-primary" : ""
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-semibold text-xs truncate">{inc.childName}</span>
                </div>
                <div className={`text-xs font-semibold ${inc.severity === "critical" ? "text-red-400" : "text-yellow-400"}`}>
                  {inc.severity.toUpperCase()}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">{inc.elapsedMinutes}m elapsed</div>
              </button>
            ))}
          </ScrollArea>
        </aside>

        {/* Main content */}
        <main className="flex-1 overflow-auto p-4 space-y-4">
          {!incidentId ? (
            <div className="flex flex-col items-center justify-center h-64 text-center">
              <Shield size={48} className="text-green-400 mb-4" />
              <h2 className="text-xl font-bold mb-2">Standby</h2>
              <p className="text-muted-foreground text-sm">No active incidents requiring response.</p>
            </div>
          ) : (
            <>
              {/* Incident alert card */}
              <Card className={`border-2 ${incident?.severity === "critical" ? "border-red-700 bg-red-950/20" : "border-yellow-800 bg-yellow-950/10"}`} data-testid="card-incident-alert">
                <CardContent className="p-4">
                  <div className="flex flex-wrap items-start gap-4">
                    {/* Alert icon */}
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${incident?.severity === "critical" ? "bg-red-900/60" : "bg-yellow-900/60"}`}>
                      <AlertTriangle size={24} className={incident?.severity === "critical" ? "text-red-400" : "text-yellow-400"} />
                    </div>

                    {/* Child info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <span className="font-bold text-lg" data-testid="text-child-name">{incident?.childName}</span>
                        <span className="text-muted-foreground text-sm">Age {incident?.childAge}</span>
                        {incident && <SeverityBadge severity={incident.severity} />}
                      </div>
                      <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <MapPin size={12} />{incident?.locationAddress ?? `${incident?.latitude?.toFixed(4)}, ${incident?.longitude?.toFixed(4)}`}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock size={12} />{summary?.elapsedMinutes ?? 0}m ago
                        </span>
                        {incident?.impactMagnitude && (
                          <span className="flex items-center gap-1 text-red-400">
                            <Zap size={12} />{incident.impactMagnitude.toFixed(1)}g impact
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Parent contact */}
                    <div className="text-right text-sm">
                      <div className="text-muted-foreground text-xs">Parent</div>
                      <div className="font-semibold">{incident?.parentName}</div>
                      <div className="text-blue-400 text-xs">{incident?.parentPhone}</div>
                      <div className={`text-xs mt-1 ${incident?.parentStatus === "en_route" ? "text-blue-400" : "text-muted-foreground"}`}>
                        {incident?.parentStatus?.replace(/_/g, " ")}
                      </div>
                    </div>
                  </div>

                  {/* Status stepper */}
                  <div className="mt-4 pt-4 border-t border-border">
                    <StatusStepper currentStatus={incident?.status ?? "active"} />
                  </div>

                  {/* Advance status button */}
                  {nextStatus() && (
                    <div className="mt-3">
                      <Button
                        size="sm"
                        onClick={() => handleStatusUpdate(nextStatus()!.key)}
                        disabled={updateStatus.isPending}
                        className="bg-blue-700 hover:bg-blue-600 text-white"
                        data-testid="button-advance-status"
                      >
                        Advance to {nextStatus()!.label} <ChevronRight size={14} className="ml-1" />
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Vitals + Hospital row */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Live vitals with sparkline */}
                <Card className="bg-card border-border" data-testid="card-vitals">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Activity size={14} className="text-red-400" /> Live Vitals
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {/* HR sparkline */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <Heart size={14} className="text-red-400" />
                          <span className="text-sm font-semibold">Heart Rate</span>
                          {incident?.heartRateTrend && (
                            <span className={`text-xs px-2 py-0.5 rounded-full border ${incident.heartRateTrend === "rising" ? "bg-red-900/40 border-red-700 text-red-300" : "bg-green-900/40 border-green-700 text-green-300"}`}>
                              {incident.heartRateTrend}
                            </span>
                          )}
                        </div>
                        <span className="text-2xl font-bold font-mono text-red-300" data-testid="text-heart-rate">
                          {latestVitals?.heartRate ?? "—"}
                        </span>
                      </div>
                      {heartRateData.length > 1 && (
                        <div className="h-16" data-testid="chart-heart-rate">
                          <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={heartRateData}>
                              <YAxis domain={["auto", "auto"]} hide />
                              <RechartTooltip
                                contentStyle={{ background: "#1e293b", border: "none", borderRadius: 8, fontSize: 11 }}
                                formatter={(v: number) => [`${v} bpm`, "HR"]}
                              />
                              <Line
                                type="monotone"
                                dataKey="bpm"
                                stroke="#ef4444"
                                strokeWidth={2}
                                dot={false}
                                animationDuration={300}
                              />
                            </LineChart>
                          </ResponsiveContainer>
                        </div>
                      )}
                    </div>

                    {/* Temperature */}
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <Thermometer size={14} className="text-orange-400" />
                          <span className="text-sm font-semibold">Temperature</span>
                        </div>
                        <span className="text-xl font-bold font-mono text-orange-300" data-testid="text-temperature">
                          {latestVitals?.temperature?.toFixed(1) ?? "—"}°C
                        </span>
                      </div>
                    </div>

                    {/* Confidence */}
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-muted-foreground">Sensor Confidence</span>
                        <span className="text-xs font-bold text-green-400" data-testid="text-confidence">
                          {latestVitals?.confidence != null ? `${Math.round(latestVitals.confidence * 100)}%` : "—"}
                        </span>
                      </div>
                      {latestVitals?.confidence != null && (
                        <Progress value={latestVitals.confidence * 100} className="h-2" />
                      )}
                    </div>

                    {/* Active alerts */}
                    {latestVitals?.alerts && latestVitals.alerts.length > 0 && (
                      <div className="flex flex-wrap gap-1.5" data-testid="vitals-alerts">
                        {latestVitals.alerts.map((a) => (
                          <span key={a} className="text-xs bg-red-950 border border-red-700 text-red-300 rounded-full px-2.5 py-0.5 font-semibold uppercase">
                            {a.replace(/_/g, " ")}
                          </span>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Hospital recommendation */}
                <Card className="bg-card border-border" data-testid="card-hospital">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Building2 size={14} className="text-green-400" /> Hospital Recommendation
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {topHospital ? (
                      <>
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="font-bold text-sm" data-testid="text-hospital-name">{topHospital.name}</div>
                            <div className="text-xs text-muted-foreground mt-0.5">{topHospital.type}</div>
                          </div>
                          {(topHospital as { confidenceScore?: number }).confidenceScore != null && (
                            <span className="text-green-400 font-bold text-sm whitespace-nowrap" data-testid="text-hospital-confidence">
                              {Math.round(((topHospital as { confidenceScore?: number }).confidenceScore ?? 0) * 100)}% match
                            </span>
                          )}
                        </div>

                        {/* Confidence bar */}
                        {(topHospital as { confidenceScore?: number }).confidenceScore != null && (
                          <Progress value={((topHospital as { confidenceScore?: number }).confidenceScore ?? 0) * 100} className="h-2" />
                        )}

                        {/* Stats */}
                        <div className="grid grid-cols-3 gap-2 text-center">
                          <div className="bg-slate-800/60 rounded-lg p-2">
                            <div className="text-lg font-bold text-blue-300" data-testid="stat-trauma-beds">{topHospital.traumaBeds}</div>
                            <div className="text-xs text-muted-foreground">Trauma</div>
                          </div>
                          <div className="bg-slate-800/60 rounded-lg p-2">
                            <div className="text-lg font-bold text-blue-300" data-testid="stat-icu-beds">{topHospital.icuBeds}</div>
                            <div className="text-xs text-muted-foreground">ICU</div>
                          </div>
                          <div className="bg-slate-800/60 rounded-lg p-2">
                            <div className="text-lg font-bold text-green-300">{topHospital.rating?.toFixed(1)}</div>
                            <div className="text-xs text-muted-foreground">Rating</div>
                          </div>
                        </div>

                        {/* Capability badges */}
                        <div className="flex flex-wrap gap-1.5">
                          {topHospital.hasPediatricTeam && (
                            <span className="text-xs bg-green-950 border border-green-700 text-green-300 rounded-full px-2 py-0.5" data-testid="badge-pediatric">Pediatric Team</span>
                          )}
                          {topHospital.hasTraumaSurgery && (
                            <span className="text-xs bg-blue-950 border border-blue-700 text-blue-300 rounded-full px-2 py-0.5" data-testid="badge-trauma-surgery">Trauma Surgery</span>
                          )}
                          {topHospital.hasCTScan && (
                            <span className="text-xs bg-slate-800 border border-slate-600 text-slate-300 rounded-full px-2 py-0.5" data-testid="badge-ct-scan">CT Scan</span>
                          )}
                        </div>

                        {/* ETA */}
                        {(topHospital as { etaMinutes?: number }).etaMinutes != null && (
                          <div className="flex items-center gap-2 text-sm">
                            <Clock size={12} className="text-muted-foreground" />
                            <span className="text-muted-foreground">ETA:</span>
                            <span className="font-bold text-blue-300" data-testid="text-hospital-eta">
                              {(topHospital as { etaMinutes?: number }).etaMinutes} min
                            </span>
                            {(topHospital as { distanceKm?: number }).distanceKm != null && (
                              <span className="text-muted-foreground text-xs">
                                ({(topHospital as { distanceKm?: number }).distanceKm} km)
                              </span>
                            )}
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="text-sm text-muted-foreground">Calculating nearest hospital…</div>
                    )}

                    {/* Alternate hospitals */}
                    {hospitals && hospitals.length > 1 && (
                      <div className="pt-2 border-t border-border">
                        <div className="text-xs text-muted-foreground mb-1.5 uppercase tracking-wide">Alternatives</div>
                        <div className="space-y-1.5">
                          {hospitals.slice(1, 3).map((h) => (
                            <div key={h.id} className="flex items-center justify-between text-xs" data-testid={`alt-hospital-${h.id}`}>
                              <span className="text-muted-foreground truncate">{h.name}</span>
                              <span className="text-slate-400 ml-2 shrink-0">{(h as { etaMinutes?: number }).etaMinutes ?? "—"} min</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Medical history card */}
              {child && (
                <Card className="bg-card border-border" data-testid="card-medical-history">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <User size={14} className="text-blue-400" /> Medical History — {child.name}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {/* Allergies */}
                      <div>
                        <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Allergies</div>
                        {child.allergies && child.allergies.length > 0 ? (
                          <div className="flex flex-wrap gap-1.5" data-testid="allergy-list">
                            {child.allergies.map((a) => (
                              <AllergyBadge key={a} allergy={a} />
                            ))}
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">None on record</span>
                        )}
                      </div>

                      {/* Medications */}
                      <div>
                        <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Medications</div>
                        {child.medications && child.medications.length > 0 ? (
                          <div className="space-y-1">
                            {child.medications.map((m) => (
                              <div key={m} className="text-xs text-slate-300 flex items-center gap-1" data-testid={`medication-${m}`}>
                                <div className="w-1 h-1 rounded-full bg-blue-400" />
                                {m}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">None on record</span>
                        )}
                      </div>

                      {/* Medical conditions + blood type */}
                      <div>
                        <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Conditions</div>
                        <div className="space-y-1">
                          {child.medicalConditions && child.medicalConditions.map((c) => (
                            <div key={c} className="text-xs text-slate-300 flex items-center gap-1" data-testid={`condition-${c}`}>
                              <div className="w-1 h-1 rounded-full bg-yellow-400" />
                              {c}
                            </div>
                          ))}
                          {(!child.medicalConditions || child.medicalConditions.length === 0) && (
                            <span className="text-xs text-muted-foreground">None on record</span>
                          )}
                          <div className="mt-2 flex items-center gap-2">
                            <span className="text-xs text-muted-foreground">Blood type:</span>
                            <span className="text-sm font-bold text-red-300" data-testid="text-blood-type">{child.bloodType ?? "Unknown"}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
