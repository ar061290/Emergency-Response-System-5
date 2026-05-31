import { useState } from "react";
import { Link } from "wouter";
import {
  ArrowLeft, Bus, MapPin, AlertTriangle, CheckCircle, TrendingUp,
  TrendingDown, Clock, Users, ShieldAlert, ChevronRight, Navigation
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  useListRouteAnalytics, getListRouteAnalyticsQueryKey,
  useListBuses, getListBusesQueryKey,
} from "@workspace/api-client-react";
import type { RouteAnalytic } from "@workspace/api-client-react";

function CoverageBar({ score }: { score: number }) {
  const color = score >= 80 ? "bg-green-500" : score >= 60 ? "bg-yellow-500" : "bg-red-500";
  const label = score >= 80 ? "Good" : score >= 60 ? "Moderate" : "Critical";
  const textColor = score >= 80 ? "text-green-400" : score >= 60 ? "text-yellow-400" : "text-red-400";
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-muted-foreground">Coverage Score</span>
        <div className="flex items-center gap-1.5">
          <span className={`text-sm font-bold ${textColor}`}>{score.toFixed(0)}%</span>
          <span className={`text-xs px-1.5 py-0.5 rounded-full border ${
            score >= 80 ? "bg-green-900/30 border-green-700 text-green-400" :
            score >= 60 ? "bg-yellow-900/30 border-yellow-700 text-yellow-400" :
            "bg-red-900/30 border-red-700 text-red-400"
          }`}>{label}</span>
        </div>
      </div>
      <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${score}%` }} />
      </div>
    </div>
  );
}

function RouteMapSketch({ route, selected }: { route: RouteAnalytic; selected: boolean }) {
  const gapCount = route.gapCount;
  const hasPost = !!route.recommendedPostName;
  return (
    <div className={`relative rounded-lg overflow-hidden transition-all ${selected ? "ring-2 ring-primary/50" : ""}`}
      style={{ height: 90, background: "#0e1a2b" }}>
      <div className="absolute inset-0 opacity-20">
        <svg width="100%" height="100%">
          <line x1="5%" y1="50%" x2="95%" y2="50%" stroke="#334155" strokeWidth="1" />
          <line x1="20%" y1="20%" x2="20%" y2="80%" stroke="#334155" strokeWidth="1" />
          <line x1="55%" y1="20%" x2="55%" y2="80%" stroke="#334155" strokeWidth="1" />
          <line x1="80%" y1="20%" x2="80%" y2="80%" stroke="#334155" strokeWidth="1" />
        </svg>
      </div>
      <svg className="absolute inset-0 w-full h-full">
        <polyline
          points="8,45 25,38 42,52 60,35 78,48 92,40"
          fill="none"
          stroke={route.coverageScore >= 80 ? "#22c55e" : route.coverageScore >= 60 ? "#eab308" : "#ef4444"}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity="0.8"
        />
        <circle cx="8" cy="45" r="3" fill="#3b82f6" />
        <circle cx="92" cy="40" r="3" fill="#8b5cf6" />
        {gapCount >= 1 && <circle cx="42" cy="52" r="4" fill="none" stroke="#ef4444" strokeWidth="1.5" opacity="0.9" />}
        {gapCount >= 2 && <circle cx="60" cy="35" r="4" fill="none" stroke="#ef4444" strokeWidth="1.5" opacity="0.9" />}
        {gapCount >= 3 && <circle cx="78" cy="48" r="4" fill="none" stroke="#f97316" strokeWidth="1.5" opacity="0.8" />}
        {hasPost && <polygon points="70,28 73,35 67,35" fill="#facc15" opacity="0.9" />}
      </svg>
      <div className="absolute bottom-1 left-1.5 flex gap-2">
        <div className="flex items-center gap-0.5"><div className="w-1.5 h-1.5 rounded-full bg-blue-500" /><span className="text-slate-400" style={{ fontSize: 9 }}>Start</span></div>
        <div className="flex items-center gap-0.5"><div className="w-1.5 h-1.5 rounded-full bg-violet-500" /><span className="text-slate-400" style={{ fontSize: 9 }}>End</span></div>
        {gapCount > 0 && <div className="flex items-center gap-0.5"><div className="w-2.5 h-2.5 rounded-full border border-red-500" /><span className="text-slate-400" style={{ fontSize: 9 }}>Gap</span></div>}
        {hasPost && <div className="flex items-center gap-0.5"><span className="text-yellow-400" style={{ fontSize: 9 }}>▲ Recommended post</span></div>}
      </div>
    </div>
  );
}

function RequestModal({ route, onClose }: { route: RouteAnalytic; onClose: () => void }) {
  const [submitted, setSubmitted] = useState(false);
  if (submitted) {
    return (
      <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
        <div className="bg-card border border-border rounded-2xl p-6 max-w-md w-full text-center space-y-4">
          <CheckCircle size={48} className="text-green-400 mx-auto" />
          <h3 className="font-bold text-lg">Coverage Request Submitted</h3>
          <p className="text-sm text-muted-foreground">
            Your request for additional ambulance coverage on <strong>{route.routeName}</strong> has been forwarded to Atlanta EMS Authority for review.
          </p>
          <p className="text-xs text-muted-foreground">Estimated review time: 3–5 business days</p>
          <Button onClick={onClose} className="w-full">Close</Button>
        </div>
      </div>
    );
  }
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-card border border-border rounded-2xl p-6 max-w-md w-full space-y-4">
        <h3 className="font-bold text-lg flex items-center gap-2">
          <ShieldAlert size={18} className="text-yellow-400" /> Request Coverage Improvement
        </h3>
        <div className="bg-slate-800/50 rounded-lg p-3 text-sm space-y-1">
          <div><span className="text-muted-foreground">Route:</span> <span className="font-medium">{route.routeName}</span></div>
          <div><span className="text-muted-foreground">School:</span> <span className="font-medium">{route.schoolName}</span></div>
          <div><span className="text-muted-foreground">Current coverage:</span> <span className={`font-bold ${route.coverageScore < 60 ? "text-red-400" : "text-yellow-400"}`}>{route.coverageScore.toFixed(0)}%</span></div>
          <div><span className="text-muted-foreground">Ambulance gaps:</span> <span className="font-medium text-orange-400">{route.gapCount} identified</span></div>
          {route.recommendedPostName && (
            <div><span className="text-muted-foreground">Proposed post:</span> <span className="font-medium text-blue-400">{route.recommendedPostName}</span></div>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          This request will be sent to <strong>Atlanta Regional EMS Authority</strong>. They will review the coverage gap data and respond within 3–5 business days.
        </p>
        {route.projectedResponseTimeMin != null && (
          <div className="flex items-center gap-2 bg-green-900/20 border border-green-700/30 rounded-lg px-3 py-2">
            <TrendingDown size={14} className="text-green-400" />
            <span className="text-xs text-green-300">Adding a post here could reduce avg response time from {route.avgResponseTimeMin} → {route.projectedResponseTimeMin} min</span>
          </div>
        )}
        <div className="flex gap-2 pt-1">
          <Button variant="outline" onClick={onClose} className="flex-1">Cancel</Button>
          <Button onClick={() => setSubmitted(true)} className="flex-1 bg-yellow-600 hover:bg-yellow-700 text-black font-bold">
            Submit Request
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function RouteSafetyPage() {
  const [selectedRoute, setSelectedRoute] = useState<RouteAnalytic | null>(null);
  const [requestRoute, setRequestRoute] = useState<RouteAnalytic | null>(null);

  const { data: routes, isLoading: loadingRoutes } = useListRouteAnalytics({
    query: { queryKey: getListRouteAnalyticsQueryKey(), refetchInterval: 30000 },
  });

  const { data: buses } = useListBuses(undefined, {
    query: { queryKey: getListBusesQueryKey() },
  });

  const criticalCount = routes?.filter((r) => r.coverageScore < 60).length ?? 0;
  const avgCoverage = routes?.length
    ? Math.round(routes.reduce((s, r) => s + r.coverageScore, 0) / routes.length)
    : 0;
  const totalChildren = routes?.reduce((s, r) => s + r.totalChildrenOnRoute, 0) ?? 0;

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <header className="border-b border-border px-4 py-3 flex items-center gap-3 bg-card/40 backdrop-blur sticky top-0 z-10">
        <Link href="/" className="text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft size={20} />
        </Link>
        <div className="flex items-center gap-2">
          <Navigation size={18} className="text-yellow-400" />
          <span className="font-bold text-base">Route Safety Analytics</span>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {criticalCount > 0 && (
            <Badge className="bg-red-900/50 text-red-300 border-red-700 animate-pulse">
              {criticalCount} critical routes
            </Badge>
          )}
        </div>
      </header>

      <div className="max-w-6xl mx-auto w-full p-4 space-y-4">
        {/* Summary stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card className="bg-card border-border">
            <CardContent className="p-4">
              <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Routes Monitored</div>
              <div className="text-2xl font-bold">{routes?.length ?? 0}</div>
              <div className="text-xs text-muted-foreground mt-0.5">school routes</div>
            </CardContent>
          </Card>
          <Card className="bg-card border-border">
            <CardContent className="p-4">
              <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Avg Coverage</div>
              <div className={`text-2xl font-bold ${avgCoverage >= 80 ? "text-green-400" : avgCoverage >= 60 ? "text-yellow-400" : "text-red-400"}`}>
                {avgCoverage}%
              </div>
              <Progress value={avgCoverage} className="h-1 mt-1.5" />
            </CardContent>
          </Card>
          <Card className="bg-card border-border">
            <CardContent className="p-4">
              <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Children at Risk</div>
              <div className="text-2xl font-bold text-orange-400">
                {routes?.filter((r) => r.coverageScore < 70).reduce((s, r) => s + r.totalChildrenOnRoute, 0) ?? 0}
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">on underserved routes</div>
            </CardContent>
          </Card>
          <Card className="bg-card border-border">
            <CardContent className="p-4">
              <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Active Buses</div>
              <div className="flex items-center gap-2">
                <Bus size={16} className="text-yellow-400" />
                <div className="text-2xl font-bold text-yellow-400">{buses?.filter((b) => b.isActive).length ?? 0}</div>
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">in service now</div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Route list */}
          <div className="lg:col-span-1 space-y-3">
            <div className="text-xs uppercase tracking-widest text-muted-foreground px-1">Routes by Coverage</div>
            {loadingRoutes ? (
              <div className="text-sm text-muted-foreground p-4">Analysing routes…</div>
            ) : routes?.length === 0 ? (
              <div className="text-sm text-muted-foreground p-4">No routes analysed yet.</div>
            ) : (
              <ScrollArea className="h-[520px]">
                <div className="space-y-2 pr-1">
                  {routes?.map((route) => (
                    <button
                      key={route.id}
                      onClick={() => setSelectedRoute(route)}
                      className={`w-full text-left rounded-xl border p-3 transition-colors hover:bg-accent/20 ${
                        selectedRoute?.id === route.id
                          ? "border-primary/50 bg-primary/10"
                          : route.coverageScore < 60
                          ? "border-red-700/50 bg-red-900/10"
                          : route.coverageScore < 80
                          ? "border-yellow-700/30 bg-yellow-900/5"
                          : "border-border bg-card"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-semibold text-sm truncate">{route.routeName}</span>
                        <div className="flex items-center gap-1 shrink-0">
                          {route.isHighRisk && <AlertTriangle size={12} className="text-red-400" />}
                          <span className={`text-xs font-bold ${
                            route.coverageScore >= 80 ? "text-green-400" : route.coverageScore >= 60 ? "text-yellow-400" : "text-red-400"
                          }`}>{route.coverageScore.toFixed(0)}%</span>
                        </div>
                      </div>
                      <div className="text-xs text-muted-foreground">{route.schoolName}</div>
                      <div className="flex items-center gap-3 mt-1.5">
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Clock size={10} />
                          <span>{route.avgResponseTimeMin} min avg</span>
                        </div>
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Users size={10} />
                          <span>{route.totalChildrenOnRoute} children</span>
                        </div>
                        {route.gapCount > 0 && (
                          <div className="flex items-center gap-1 text-xs text-red-400">
                            <AlertTriangle size={10} />
                            <span>{route.gapCount} gap{route.gapCount !== 1 ? "s" : ""}</span>
                          </div>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              </ScrollArea>
            )}
          </div>

          {/* Route detail */}
          <div className="lg:col-span-2">
            {!selectedRoute ? (
              <Card className="bg-card border-border h-full flex items-center justify-center">
                <div className="text-center text-muted-foreground p-8">
                  <Navigation size={40} className="mx-auto mb-3 opacity-30" />
                  <p className="text-sm">Select a route to view coverage details</p>
                </div>
              </Card>
            ) : (
              <Card className="bg-card border-border">
                <CardHeader className="pb-2 flex flex-row items-start justify-between">
                  <div>
                    <CardTitle className="text-base">{selectedRoute.routeName}</CardTitle>
                    <p className="text-sm text-muted-foreground mt-0.5">{selectedRoute.schoolName}</p>
                  </div>
                  {selectedRoute.coverageScore < 80 && (
                    <Button
                      size="sm"
                      className="bg-yellow-600 hover:bg-yellow-700 text-black font-bold text-xs shrink-0"
                      onClick={() => setRequestRoute(selectedRoute)}
                    >
                      <ShieldAlert size={12} className="mr-1" /> Request Coverage
                    </Button>
                  )}
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Route map sketch */}
                  <RouteMapSketch route={selectedRoute} selected={false} />

                  {/* Route details */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-slate-800/40 rounded-lg p-3">
                      <div className="text-xs text-muted-foreground mb-0.5">Route</div>
                      <div className="text-xs font-medium">{selectedRoute.startLocationName}</div>
                      <div className="text-xs text-muted-foreground my-0.5">→</div>
                      <div className="text-xs font-medium">{selectedRoute.endLocationName}</div>
                    </div>
                    <div className="bg-slate-800/40 rounded-lg p-3 space-y-2">
                      <div>
                        <div className="text-xs text-muted-foreground">Avg response time</div>
                        <div className={`text-sm font-bold ${selectedRoute.avgResponseTimeMin > 10 ? "text-red-400" : selectedRoute.avgResponseTimeMin > 7 ? "text-yellow-400" : "text-green-400"}`}>
                          {selectedRoute.avgResponseTimeMin} min
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground">Avg distance to AMB</div>
                        <div className="text-sm font-bold">{selectedRoute.avgAmbulanceDistanceKm.toFixed(1)} km</div>
                      </div>
                    </div>
                  </div>

                  <CoverageBar score={selectedRoute.coverageScore} />

                  {/* Gaps */}
                  {selectedRoute.gapCount > 0 && (
                    <div className="space-y-2">
                      <div className="text-xs uppercase tracking-wide text-muted-foreground">Coverage Gaps Identified</div>
                      {selectedRoute.gaps?.map((gap, i) => (
                        <div key={i} className={`flex items-center gap-2 rounded-lg px-3 py-2 ${
                          gap.severity === "critical" ? "bg-red-900/20 border border-red-700/30" : "bg-yellow-900/20 border border-yellow-700/30"
                        }`}>
                          <AlertTriangle size={12} className={gap.severity === "critical" ? "text-red-400" : "text-yellow-400"} />
                          <div className="flex-1 text-xs">
                            <span className="font-medium capitalize">{gap.severity} gap</span>
                            <span className="text-muted-foreground ml-1">— {gap.distanceKm.toFixed(1)} km to nearest ambulance</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Recommended post */}
                  {selectedRoute.recommendedPostName && (
                    <div className="bg-blue-900/20 border border-blue-700/30 rounded-lg px-3 py-3 space-y-1">
                      <div className="text-xs uppercase tracking-wide text-blue-400 mb-1">Recommended Ambulance Post</div>
                      <div className="flex items-center gap-2">
                        <MapPin size={13} className="text-yellow-400 shrink-0" />
                        <span className="text-sm font-medium">{selectedRoute.recommendedPostName}</span>
                      </div>
                      {selectedRoute.projectedResponseTimeMin != null && (
                        <div className="flex items-center gap-2 text-xs text-green-400">
                          <TrendingDown size={11} />
                          Projected response time: {selectedRoute.avgResponseTimeMin} → {selectedRoute.projectedResponseTimeMin} min
                        </div>
                      )}
                    </div>
                  )}

                  {/* Stats row */}
                  <div className="grid grid-cols-3 gap-2">
                    <div className="text-center bg-slate-800/40 rounded-lg p-2">
                      <div className="text-lg font-bold">{selectedRoute.incidentCount}</div>
                      <div className="text-xs text-muted-foreground">Incidents</div>
                    </div>
                    <div className="text-center bg-slate-800/40 rounded-lg p-2">
                      <div className="text-lg font-bold text-blue-400">{selectedRoute.totalChildrenOnRoute}</div>
                      <div className="text-xs text-muted-foreground">Children</div>
                    </div>
                    <div className="text-center bg-slate-800/40 rounded-lg p-2">
                      <div className={`text-lg font-bold ${selectedRoute.isHighRisk ? "text-red-400" : "text-green-400"}`}>
                        {selectedRoute.isHighRisk ? "High" : "Low"}
                      </div>
                      <div className="text-xs text-muted-foreground">Risk Level</div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>

        {/* Live bus positions */}
        {buses && buses.length > 0 && (
          <Card className="bg-card border-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Bus size={14} className="text-yellow-400" /> Live Bus Positions
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {buses.map((bus) => (
                  <div key={bus.id} className="bg-slate-800/40 rounded-lg p-3 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Bus size={14} className="text-yellow-400" />
                        <span className="font-semibold text-sm">{bus.busNumber ?? bus.busId}</span>
                      </div>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        bus.currentStatus === "in_transit"
                          ? "bg-green-900/40 text-green-400 border border-green-700/30"
                          : "bg-slate-700 text-slate-400"
                      }`}>
                        {bus.currentStatus === "in_transit" ? "In Transit" : bus.currentStatus}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground">{bus.schoolName}</div>
                    <div className="text-xs text-muted-foreground">{bus.routeName}</div>
                    {bus.currentLocationName && (
                      <div className="flex items-center gap-1 text-xs text-blue-300">
                        <MapPin size={10} />
                        <span className="truncate">{bus.currentLocationName}</span>
                      </div>
                    )}
                    {bus.driverName && (
                      <div className="text-xs text-muted-foreground">Driver: {bus.driverName}</div>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {requestRoute && <RequestModal route={requestRoute} onClose={() => setRequestRoute(null)} />}
    </div>
  );
}
