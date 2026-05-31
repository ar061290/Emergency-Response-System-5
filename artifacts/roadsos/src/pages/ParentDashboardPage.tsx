import { useState } from "react";
import { Link } from "wouter";
import {
  ArrowLeft, AlertTriangle, CheckCircle, Clock, MapPin, Ambulance, Heart,
  Thermometer, Building2, Phone, Send, Activity, ChevronRight, User, Bus,
  Play, Pause, Shield, Stethoscope
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import {
  useGetActiveIncidents, getGetActiveIncidentsQueryKey,
  useGetIncident, getGetIncidentQueryKey,
  useGetIncidentVitals, getGetIncidentVitalsQueryKey,
  useGetIncidentTimeline, getGetIncidentTimelineQueryKey,
  useListMessages, getListMessagesQueryKey,
  useSendMessage,
  useListBuses, getListBusesQueryKey,
  useListAmbulances, getListAmbulancesQueryKey,
  useListHospitals, getListHospitalsQueryKey,
  useListPoliceStations, getListPoliceStationsQueryKey,
  useGetIncidentGpsHistory, getGetIncidentGpsHistoryQueryKey,
} from "@workspace/api-client-react";
import LiveMap from "@/components/LiveMap";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";

function SeverityBadge({ severity }: { severity: string }) {
  const cfg: Record<string, string> = {
    critical: "bg-red-900/60 text-red-300 border-red-700",
    moderate: "bg-yellow-900/60 text-yellow-300 border-yellow-700",
    minor: "bg-green-900/60 text-green-300 border-green-700",
  };
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold uppercase border ${cfg[severity] ?? cfg.minor}`}>
      {severity}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const labels: Record<string, string> = {
    active: "Active", en_route: "En Route", on_scene: "On Scene",
    transporting: "Transporting", at_hospital: "At Hospital", resolved: "Resolved",
  };
  return <span className="text-slate-400 text-xs uppercase tracking-wide">{labels[status] ?? status}</span>;
}

export default function ParentDashboardPage() {
  const [selectedIncidentId, setSelectedIncidentId] = useState<string | null>(null);
  const [msgInput, setMsgInput] = useState("");
  const [showPolice, setShowPolice] = useState(true);
  const [showRoutePlayback, setShowRoutePlayback] = useState(false);
  const { toast } = useToast();

  const { data: activeIncidents, isLoading: loadingIncidents } = useGetActiveIncidents({
    query: { refetchInterval: 3000, queryKey: getGetActiveIncidentsQueryKey() },
  });

  const incidentId = selectedIncidentId ?? activeIncidents?.[0]?.incidentId ?? "";

  const { data: incident } = useGetIncident(incidentId, {
    query: { enabled: !!incidentId, refetchInterval: 4000, queryKey: getGetIncidentQueryKey(incidentId) },
  });

  const { data: vitals } = useGetIncidentVitals(incidentId, {
    query: { enabled: !!incidentId, refetchInterval: 4000, queryKey: getGetIncidentVitalsQueryKey(incidentId) },
  });

  const { data: timeline } = useGetIncidentTimeline(incidentId, {
    query: { enabled: !!incidentId, refetchInterval: 5000, queryKey: getGetIncidentTimelineQueryKey(incidentId) },
  });

  const { data: messages, refetch: refetchMessages } = useListMessages(incidentId, {
    query: { enabled: !!incidentId, refetchInterval: 5000, queryKey: getListMessagesQueryKey(incidentId) },
  });

  const sendMessage = useSendMessage();

  const { data: buses } = useListBuses(undefined, {
    query: { refetchInterval: 10000, queryKey: getListBusesQueryKey() },
  });
  const activeBus = buses?.find((b) => b.isActive && b.currentStatus === "in_transit") ?? null;

  const { data: ambulances } = useListAmbulances({
    query: { refetchInterval: 10000, queryKey: getListAmbulancesQueryKey() },
  });
  const activeAmbulance = ambulances?.find((a) => a.status === "en_route" || a.status === "on_scene") ?? null;

  const { data: hospitals } = useListHospitals(undefined, {
    query: { enabled: !!incident?.latitude, queryKey: getListHospitalsQueryKey() },
  });
  const matchedHospital = hospitals?.find((h) => incident?.hospitalId === h.id) ?? hospitals?.[0];

  const traumaCenters = hospitals?.filter((h) => h.hasTraumaSurgery) ?? [];

  const { data: policeStations } = useListPoliceStations({
    query: { queryKey: getListPoliceStationsQueryKey(), staleTime: 60000 },
  });

  const { data: gpsHistory } = useGetIncidentGpsHistory(incidentId, {
    query: { enabled: !!incidentId, queryKey: getGetIncidentGpsHistoryQueryKey(incidentId), refetchInterval: 10000 },
  });

  const routeHistory: [number, number][] = gpsHistory?.map((p) => [p.latitude, p.longitude]) ?? [];

  const latestVitals = vitals?.[0];
  const elapsedMin = activeIncidents?.find((i) => i.incidentId === incidentId)?.elapsedMinutes;

  const handleSend = () => {
    if (!msgInput.trim() || !incidentId) return;
    sendMessage.mutate(
      {
        data: {
          incidentId,
          senderType: "parent",
          senderName: incident?.parentName ?? "Parent",
          recipientType: "responder",
          messageType: "text",
          content: msgInput.trim(),
        },
      },
      {
        onSuccess: () => {
          setMsgInput("");
          refetchMessages();
        },
        onError: () => toast({ title: "Failed to send message", variant: "destructive" }),
      }
    );
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* Header */}
      <header className="border-b border-border px-4 py-3 flex items-center gap-3 bg-card/40 backdrop-blur sticky top-0 z-10">
        <Link href="/" className="text-muted-foreground hover:text-foreground transition-colors" data-testid="link-back-home">
          <ArrowLeft size={20} />
        </Link>
        <div className="flex items-center gap-2">
          <Heart size={18} className="text-green-400" />
          <span className="font-bold text-base">Parent Command Center</span>
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
        {/* Sidebar: incident list */}
        <aside className="w-64 border-r border-border bg-card/30 flex flex-col shrink-0 hidden md:flex">
          <div className="p-3 border-b border-border">
            <span className="text-xs uppercase tracking-widest text-muted-foreground">Active Incidents</span>
          </div>
          <ScrollArea className="flex-1">
            {loadingIncidents ? (
              <div className="p-4 text-muted-foreground text-sm">Loading…</div>
            ) : activeIncidents?.length === 0 ? (
              <div className="p-4 text-center">
                <CheckCircle size={24} className="text-green-400 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">No active incidents</p>
              </div>
            ) : (
              activeIncidents?.map((inc) => (
                <button
                  key={inc.incidentId}
                  onClick={() => setSelectedIncidentId(inc.incidentId)}
                  data-testid={`card-incident-${inc.incidentId}`}
                  className={`w-full text-left p-3 border-b border-border hover:bg-accent/30 transition-colors ${incidentId === inc.incidentId ? "bg-primary/10 border-l-2 border-l-primary" : ""}`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-semibold text-sm">{inc.childName}</span>
                    <SeverityBadge severity={inc.severity} />
                  </div>
                  <div className="text-xs text-muted-foreground">{inc.elapsedMinutes}m ago</div>
                  {inc.heartRate && (
                    <div className="flex items-center gap-1 mt-1">
                      <Heart size={10} className="text-red-400" />
                      <span className="text-xs text-red-300">{inc.heartRate} bpm</span>
                    </div>
                  )}
                </button>
              ))
            )}
          </ScrollArea>
        </aside>

        {/* Main content */}
        <main className="flex-1 overflow-auto p-4 space-y-4">
          {!incidentId ? (
            <div className="flex flex-col items-center justify-center h-64 text-center">
              <CheckCircle size={48} className="text-green-400 mb-4" />
              <h2 className="text-xl font-bold mb-2">All Clear</h2>
              <p className="text-muted-foreground">No active incidents. Your child is safe.</p>
            </div>
          ) : (
            <>
              {/* Top summary cards */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {/* Child status */}
                <Card className="bg-card border-border" data-testid="card-child-status">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <User size={14} className="text-blue-400" />
                      <span className="text-xs uppercase tracking-wide text-muted-foreground">Child</span>
                    </div>
                    <div className="font-bold text-sm">{incident?.childName ?? "—"}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">Age {incident?.childAge}</div>
                    <div className="mt-2">
                      {incident && <SeverityBadge severity={incident.severity} />}
                    </div>
                  </CardContent>
                </Card>

                {/* Ambulance */}
                <Card className="bg-card border-border" data-testid="card-ambulance">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Ambulance size={14} className="text-blue-400" />
                      <span className="text-xs uppercase tracking-wide text-muted-foreground">Ambulance</span>
                    </div>
                    <div className="font-bold text-sm">{incident?.ambulanceUnit ?? "Dispatched"}</div>
                    {incident?.ambulanceEtaMinutes != null && (
                      <div className="text-xs text-blue-400 mt-0.5">{incident.ambulanceEtaMinutes} min ETA</div>
                    )}
                    {incident?.ambulanceDistanceKm != null && (
                      <div className="text-xs text-muted-foreground">{incident.ambulanceDistanceKm} km away</div>
                    )}
                  </CardContent>
                </Card>

                {/* Hospital */}
                <Card className="bg-card border-border" data-testid="card-hospital">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Building2 size={14} className="text-green-400" />
                      <span className="text-xs uppercase tracking-wide text-muted-foreground">Hospital</span>
                    </div>
                    <div className="font-bold text-xs leading-tight">{incident?.hospitalName ?? "Identifying…"}</div>
                  </CardContent>
                </Card>

                {/* Elapsed timer */}
                <Card className="bg-card border-border" data-testid="card-elapsed">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Clock size={14} className="text-yellow-400" />
                      <span className="text-xs uppercase tracking-wide text-muted-foreground">Elapsed</span>
                    </div>
                    <div className="font-bold text-2xl font-mono text-yellow-400">{elapsedMin ?? 0}</div>
                    <div className="text-xs text-muted-foreground">minutes</div>
                  </CardContent>
                </Card>
              </div>

              {/* Live Map + Vitals row */}
              <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
                {/* Real Leaflet map */}
                <Card className="lg:col-span-3 bg-card border-border" data-testid="card-map">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <MapPin size={14} className="text-blue-400" /> Live Location
                      <div className="ml-auto flex items-center gap-2">
                        <button
                          onClick={() => setShowPolice((v) => !v)}
                          className={`flex items-center gap-1 text-xs px-2 py-1 rounded-lg border transition-colors ${showPolice ? "bg-indigo-900/40 border-indigo-600/50 text-indigo-300" : "bg-slate-800 border-slate-700 text-slate-500"}`}
                          title="Toggle police stations"
                        >
                          <Shield size={11} /> Police
                        </button>
                        {routeHistory.length > 1 && (
                          <button
                            onClick={() => setShowRoutePlayback((v) => !v)}
                            className={`flex items-center gap-1 text-xs px-2 py-1 rounded-lg border transition-colors ${showRoutePlayback ? "bg-yellow-900/40 border-yellow-600/50 text-yellow-300" : "bg-slate-800 border-slate-700 text-slate-500"}`}
                            title="Toggle route history"
                          >
                            {showRoutePlayback ? <Pause size={11} /> : <Play size={11} />} Route
                          </button>
                        )}
                      </div>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    <LiveMap
                      childLat={incident?.latitude ?? null}
                      childLon={incident?.longitude ?? null}
                      childName={incident?.childName}
                      ambulanceLat={activeAmbulance?.latitude ?? null}
                      ambulanceLon={activeAmbulance?.longitude ?? null}
                      ambulanceUnit={activeAmbulance?.unitNumber ?? incident?.ambulanceUnit}
                      hospitalLat={matchedHospital?.latitude ?? null}
                      hospitalLon={matchedHospital?.longitude ?? null}
                      hospitalName={matchedHospital?.name ?? incident?.hospitalName}
                      hospitalIsTrauma={matchedHospital?.hasTraumaSurgery ?? false}
                      bus={activeBus}
                      incidentStatus={incident?.status}
                      policeStations={showPolice ? policeStations ?? [] : []}
                      traumaCenters={traumaCenters.map((tc) => ({
                        id: tc.id,
                        name: tc.name,
                        latitude: tc.latitude,
                        longitude: tc.longitude,
                        type: tc.type,
                      }))}
                      routeHistory={routeHistory}
                      showRoutePlayback={showRoutePlayback}
                    />
                  </CardContent>
                </Card>

                {/* Vitals card */}
                <Card className="lg:col-span-2 bg-card border-border" data-testid="card-vitals">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Activity size={14} className="text-red-400" /> Live Vitals
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-1">
                          <Heart size={12} className="text-red-400" />
                          <span className="text-xs text-muted-foreground">Heart Rate</span>
                        </div>
                        <span className="font-bold text-sm text-red-300">{latestVitals?.heartRate ?? "—"} bpm</span>
                      </div>
                      {latestVitals?.heartRate && (
                        <Progress value={Math.min(100, (latestVitals.heartRate / 200) * 100)} className="h-1.5" />
                      )}
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-1">
                          <Thermometer size={12} className="text-orange-400" />
                          <span className="text-xs text-muted-foreground">Temperature</span>
                        </div>
                        <span className="font-bold text-sm text-orange-300">{latestVitals?.temperature?.toFixed(1) ?? "—"}°C</span>
                      </div>
                      {latestVitals?.temperature && (
                        <Progress value={Math.min(100, ((latestVitals.temperature - 35) / 7) * 100)} className="h-1.5" />
                      )}
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-muted-foreground">Confidence</span>
                        <span className="text-xs font-semibold text-green-400">
                          {latestVitals?.confidence != null ? `${Math.round(latestVitals.confidence * 100)}%` : "—"}
                        </span>
                      </div>
                      {latestVitals?.confidence != null && (
                        <Progress value={latestVitals.confidence * 100} className="h-1.5" />
                      )}
                    </div>
                    {incident?.heartRateTrend && (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>Trend:</span>
                        <span className={`font-semibold ${incident.heartRateTrend === "rising" ? "text-red-400" : "text-green-400"}`}>
                          {incident.heartRateTrend}
                        </span>
                      </div>
                    )}
                    {latestVitals?.alerts && latestVitals.alerts.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {latestVitals.alerts.map((a) => (
                          <span key={a} className="text-xs bg-red-900/40 border border-red-700 text-red-300 rounded px-2 py-0.5">{a.replace(/_/g, " ")}</span>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Trauma Centers */}
              {traumaCenters.length > 0 && (
                <Card className="bg-card border-border" data-testid="card-trauma-centers">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Stethoscope size={14} className="text-red-400" /> Trauma Centers — Level I/II
                      <span className="ml-auto text-xs text-muted-foreground font-normal">{traumaCenters.length} facilities</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                      {traumaCenters.map((tc, i) => (
                        <div key={tc.id} className={`rounded-lg p-3 space-y-1 border ${i === 0 && matchedHospital?.id === tc.id ? "bg-red-900/20 border-red-700/50" : "bg-slate-800/40 border-slate-700/30"}`}>
                          <div className="flex items-start justify-between gap-2">
                            <div className="font-semibold text-xs leading-tight">{tc.name}</div>
                            {i === 0 && matchedHospital?.id === tc.id && (
                              <span className="text-xs bg-red-900/40 text-red-300 border border-red-700/50 rounded-full px-1.5 py-0.5 whitespace-nowrap">Active</span>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground">{tc.type}</div>
                          <div className="flex items-center gap-2 text-xs">
                            <span className="text-red-400 font-medium">{tc.traumaBeds} trauma beds</span>
                            {tc.hasPediatricTeam && <span className="text-green-400">· Pediatric ✓</span>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Timeline + Messages row */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Timeline */}
                <Card className="bg-card border-border" data-testid="card-timeline">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Clock size={14} className="text-blue-400" /> Incident Timeline
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ScrollArea className="h-52">
                      <div className="relative pl-6">
                        <div className="absolute left-2 top-0 bottom-0 w-px bg-border" />
                        {timeline?.map((event, i) => (
                          <div key={event.id} className="relative mb-4" data-testid={`timeline-event-${event.id}`}>
                            <div className="absolute -left-4 w-2.5 h-2.5 rounded-full bg-primary border-2 border-background top-0.5" />
                            <div className="text-xs font-semibold text-foreground">{event.title}</div>
                            <div className="text-xs text-muted-foreground mt-0.5">{event.description}</div>
                            <div className="text-xs text-muted-foreground/60 mt-0.5">
                              {formatDistanceToNow(new Date(event.timestamp), { addSuffix: true })}
                            </div>
                          </div>
                        ))}
                        {(!timeline || timeline.length === 0) && (
                          <p className="text-sm text-muted-foreground pl-2">No events yet</p>
                        )}
                      </div>
                    </ScrollArea>
                  </CardContent>
                </Card>

                {/* Messaging */}
                <Card className="bg-card border-border" data-testid="card-messages">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Send size={14} className="text-green-400" /> Secure Messaging
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-3">
                    <ScrollArea className="h-40">
                      <div className="space-y-2 pr-2">
                        {messages?.map((msg) => (
                          <div
                            key={msg.id}
                            className={`text-xs rounded-xl px-3 py-2 max-w-[90%] ${
                              msg.senderType === "parent"
                                ? "ml-auto bg-primary/20 border border-primary/30 text-primary-foreground"
                                : msg.senderType === "system"
                                ? "bg-red-900/20 border border-red-700/30 text-red-300 max-w-full"
                                : "bg-muted border border-border text-foreground"
                            }`}
                            data-testid={`message-${msg.id}`}
                          >
                            <div className="font-semibold mb-0.5">{msg.senderName}</div>
                            {msg.content}
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                    <Separator />
                    <div className="flex gap-2">
                      <Input
                        value={msgInput}
                        onChange={(e) => setMsgInput(e.target.value)}
                        placeholder="Message to responders…"
                        className="text-sm"
                        onKeyDown={(e) => e.key === "Enter" && handleSend()}
                        data-testid="input-message"
                      />
                      <Button
                        size="sm"
                        onClick={handleSend}
                        disabled={!msgInput.trim() || sendMessage.isPending}
                        data-testid="button-send-message"
                      >
                        <Send size={14} />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
