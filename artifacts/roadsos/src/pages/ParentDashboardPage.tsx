import { useState } from "react";
import { Link } from "wouter";
import {
  ArrowLeft, AlertTriangle, CheckCircle, Clock, MapPin, Ambulance, Heart,
  Thermometer, Building2, Phone, Send, Activity, ChevronRight, User, Bus
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
} from "@workspace/api-client-react";
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

              {/* Map placeholder + Vitals row */}
              <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
                {/* Map placeholder */}
                <Card className="lg:col-span-3 bg-card border-border" data-testid="card-map">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <MapPin size={14} className="text-blue-400" /> Live Location
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    <div className="relative bg-slate-900 rounded-b-lg overflow-hidden" style={{ height: 180 }}>
                      {/* Grid map visual */}
                      <div className="absolute inset-0 mission-grid opacity-30" />
                      {/* Streets */}
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="absolute w-full h-px bg-slate-700/60" style={{ top: "40%" }} />
                        <div className="absolute w-full h-px bg-slate-700/60" style={{ top: "70%" }} />
                        <div className="absolute h-full w-px bg-slate-700/60" style={{ left: "30%" }} />
                        <div className="absolute h-full w-px bg-slate-700/60" style={{ left: "65%" }} />
                        {/* Child pin */}
                        <div className="absolute flex flex-col items-center" style={{ left: "44%", top: "38%" }}>
                          <div className="w-4 h-4 rounded-full bg-red-500 border-2 border-white shadow-lg animate-pulse" data-testid="map-child-pin" />
                          <div className="text-xs text-white bg-slate-900/80 rounded px-1 mt-0.5 whitespace-nowrap">
                            {incident?.childName}
                          </div>
                        </div>
                        {/* Ambulance pin */}
                        <div className="absolute flex flex-col items-center" style={{ left: "28%", top: "58%" }}>
                          <div className="w-4 h-4 rounded-full bg-blue-500 border-2 border-white shadow-lg" data-testid="map-ambulance-pin" />
                          <div className="text-xs text-white bg-slate-900/80 rounded px-1 mt-0.5 whitespace-nowrap">
                            {incident?.ambulanceUnit ?? "AMB"}
                          </div>
                        </div>
                        {/* Hospital pin */}
                        <div className="absolute flex flex-col items-center" style={{ left: "62%", top: "22%" }}>
                          <div className="w-4 h-4 rounded-full bg-green-500 border-2 border-white shadow-lg" data-testid="map-hospital-pin" />
                          <div className="text-xs text-white bg-slate-900/80 rounded px-1 mt-0.5 whitespace-nowrap">Hospital</div>
                        </div>
                        {/* School bus pin */}
                        {activeBus && (
                          <div className="absolute flex flex-col items-center" style={{ left: "75%", top: "55%" }}>
                            <div className="w-4 h-4 rounded-sm bg-yellow-400 border-2 border-white shadow-lg flex items-center justify-center" data-testid="map-bus-pin">
                              <Bus size={8} className="text-black" />
                            </div>
                            <div className="text-xs text-white bg-slate-900/80 rounded px-1 mt-0.5 whitespace-nowrap">
                              {activeBus.busNumber ?? activeBus.busId}
                            </div>
                          </div>
                        )}
                        {/* Route line */}
                        <svg className="absolute inset-0 w-full h-full" style={{ pointerEvents: "none" }}>
                          <line x1="32%" y1="62%" x2="46%" y2="42%" stroke="#3b82f6" strokeWidth="1.5" strokeDasharray="4 3" opacity="0.7" />
                          <line x1="46%" y1="42%" x2="64%" y2="26%" stroke="#22c55e" strokeWidth="1.5" strokeDasharray="4 3" opacity="0.7" />
                        </svg>
                      </div>
                      {/* Legend */}
                      <div className="absolute bottom-2 right-2 flex flex-col gap-1">
                        <div className="flex items-center gap-1 bg-slate-900/80 rounded px-1.5 py-0.5">
                          <div className="w-2 h-2 rounded-full bg-red-500" />
                          <span className="text-xs text-slate-300">Child</span>
                        </div>
                        <div className="flex items-center gap-1 bg-slate-900/80 rounded px-1.5 py-0.5">
                          <div className="w-2 h-2 rounded-full bg-blue-500" />
                          <span className="text-xs text-slate-300">AMB</span>
                        </div>
                        <div className="flex items-center gap-1 bg-slate-900/80 rounded px-1.5 py-0.5">
                          <div className="w-2 h-2 rounded-full bg-green-500" />
                          <span className="text-xs text-slate-300">Hospital</span>
                        </div>
                        {activeBus && (
                          <div className="flex items-center gap-1 bg-slate-900/80 rounded px-1.5 py-0.5">
                            <div className="w-2 h-2 rounded-sm bg-yellow-400" />
                            <span className="text-xs text-slate-300">Bus</span>
                          </div>
                        )}
                      </div>
                    </div>
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
