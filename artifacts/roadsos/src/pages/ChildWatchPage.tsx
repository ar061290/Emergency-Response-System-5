import { useState, useEffect, useCallback, useRef } from "react";
import { Link } from "wouter";
import { ArrowLeft, Phone, MapPin, AlertTriangle, CheckCircle, Heart, Thermometer, Clock, Shield, Mic, MicOff, MessageCircle, X, Zap, WifiOff, RefreshCw } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import {
  useGetActiveIncidents,
  getGetActiveIncidentsQueryKey,
  useGetIncidentVitals,
  getGetIncidentVitalsQueryKey,
  useListMessages,
  getListMessagesQueryKey,
  useAiVoiceChat,
} from "@workspace/api-client-react";
import {
  isOnline,
  pushOfflineBuffer,
  getOfflineBuffer,
  removeOfflineEntry,
} from "@/lib/offline";

type WatchState = "normal" | "impact" | "confirmed" | "pain_report" | "help_coming";

const BODY_PARTS = [
  { id: "head",    label: "Head",    emoji: "🧠" },
  { id: "chest",   label: "Chest",   emoji: "❤️" },
  { id: "stomach", label: "Stomach", emoji: "🫁" },
  { id: "arm",     label: "Arm",     emoji: "💪" },
  { id: "leg",     label: "Leg",     emoji: "🦵" },
  { id: "back",    label: "Back",    emoji: "🔙" },
];

type SpeechRecognitionType = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: { results: { [k: number]: { [k: number]: { transcript: string } } } }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

export default function ChildWatchPage() {
  const [watchState, setWatchState] = useState<WatchState>("normal");
  const [etaSeconds, setEtaSeconds] = useState<number>(240);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [painPart, setPainPart] = useState<string | null>(null);
  const [painLevel, setPainLevel] = useState<number | null>(null);
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [voiceInput, setVoiceInput] = useState("");
  const [aiReply, setAiReply] = useState<string | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [sensorSimLoading, setSensorSimLoading] = useState(false);
  const [online, setOnline] = useState(isOnline());
  const [bufferCount, setBufferCount] = useState(getOfflineBuffer().length);
  const [syncing, setSyncing] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionType | null>(null);
  const voiceChat = useAiVoiceChat();

  const startListening = useCallback(() => {
    const SR =
      (window as unknown as { SpeechRecognition?: new () => SpeechRecognitionType }).SpeechRecognition ??
      (window as unknown as { webkitSpeechRecognition?: new () => SpeechRecognitionType }).webkitSpeechRecognition;
    if (!SR) return;
    const rec = new SR();
    rec.lang = "en-US";
    rec.continuous = false;
    rec.interimResults = false;
    rec.onresult = (e) => {
      setVoiceInput(e.results[0][0].transcript);
      setIsListening(false);
    };
    rec.onerror = () => setIsListening(false);
    rec.onend = () => setIsListening(false);
    recognitionRef.current = rec;
    rec.start();
    setIsListening(true);
  }, []);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    setIsListening(false);
  }, []);

  const simulateSensorImpact = useCallback(async () => {
    setSensorSimLoading(true);
    const payload = {
      deviceId: "innerwear_dev_001",
      accelerometerX: 52.4,
      accelerometerY: 38.6,
      accelerometerZ: 12.1,
      heartRate: 118,
      temperature: 37.4,
      latitude: 33.749,
      longitude: -84.388,
      timestamp: new Date().toISOString(),
    };
    try {
      if (!isOnline()) {
        pushOfflineBuffer({
          id: crypto.randomUUID(),
          type: "sensor",
          payload,
          timestamp: new Date().toISOString(),
        });
        setBufferCount(getOfflineBuffer().length);
        setWatchState("impact");
        return;
      }
      await fetch("/api/innerwear/sensor-data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      setWatchState("impact");
    } catch {
      setWatchState("impact");
    } finally {
      setSensorSimLoading(false);
    }
  }, []);

  const syncBuffer = useCallback(async () => {
    const buffer = getOfflineBuffer();
    if (buffer.length === 0 || !isOnline()) return;
    setSyncing(true);
    for (const entry of buffer) {
      try {
        if (entry.type === "sensor") {
          await fetch("/api/innerwear/sensor-data", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...(entry.payload as Record<string, unknown>), offlineBuffered: true }),
          });
        }
        removeOfflineEntry(entry.id);
      } catch {
        break;
      }
    }
    setBufferCount(getOfflineBuffer().length);
    setSyncing(false);
  }, []);

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  useEffect(() => {
    if (online && bufferCount > 0) {
      syncBuffer();
    }
  }, [online]);

  const { data: incidents } = useGetActiveIncidents({
    query: { refetchInterval: 3000, queryKey: getGetActiveIncidentsQueryKey() },
  });

  const activeIncident = incidents?.[0] ?? null;
  const incidentId = activeIncident?.incidentId ?? "";

  const { data: vitals } = useGetIncidentVitals(incidentId, {
    query: { enabled: !!incidentId, refetchInterval: 4000, queryKey: getGetIncidentVitalsQueryKey(incidentId) },
  });

  const { data: messages } = useListMessages(incidentId, {
    query: { enabled: !!incidentId, refetchInterval: 5000, queryKey: getListMessagesQueryKey(incidentId) },
  });

  const latestVitals = vitals?.[0];
  const reassuranceMsg = messages?.filter((m) => m.recipientType === "child" || m.senderType === "responder").slice(-1)[0];

  useEffect(() => {
    if (activeIncident?.ambulanceEtaMinutes) setEtaSeconds(activeIncident.ambulanceEtaMinutes * 60);
  }, [activeIncident?.ambulanceEtaMinutes]);

  useEffect(() => {
    if (watchState !== "help_coming") return;
    const interval = setInterval(() => setEtaSeconds((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(interval);
  }, [watchState]);

  useEffect(() => {
    const t = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (activeIncident && watchState === "normal") {
      setWatchState("impact");
    }
  }, [activeIncident?.incidentId]);

  const handleYes = useCallback(() => {
    setWatchState("confirmed");
    setTimeout(() => setWatchState("pain_report"), 700);
  }, []);

  const handleNo = useCallback(() => {
    setWatchState("normal");
    setPainPart(null);
    setPainLevel(null);
  }, []);

  const handlePainSubmit = useCallback(() => {
    setWatchState("help_coming");
  }, []);

  const etaMinutes = Math.floor(etaSeconds / 60);
  const etaSecsRemainder = etaSeconds % 60;

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-start pt-6 pb-8 px-4">
      <div className="w-full max-w-sm mb-4 flex items-center gap-2">
        <Link href="/" className="flex items-center gap-1 text-slate-400 hover:text-white transition-colors text-sm" data-testid="link-back-home">
          <ArrowLeft size={16} /> Back
        </Link>
        <span className="ml-auto text-slate-500 text-xs uppercase tracking-widest">Child Watch</span>
      </div>

      {/* Watch frame */}
      <div
        className={`relative w-60 rounded-[44px] border-4 overflow-hidden shadow-2xl transition-all duration-500 ${
          watchState === "impact" || watchState === "confirmed" || watchState === "pain_report"
            ? "border-red-600 pulsing-red"
            : watchState === "help_coming"
            ? "border-blue-500"
            : "border-slate-700"
        }`}
        style={{ background: "#0a0f1a", minHeight: 440 }}
        data-testid="watch-frame"
      >
        <div className="absolute -right-3 top-20 w-3 h-8 bg-slate-700 rounded-r-md" />
        <div className="absolute -right-3 top-32 w-3 h-5 bg-slate-700 rounded-r-md" />

        <div className="px-4 pt-5 pb-6 flex flex-col items-center h-full min-h-[436px]">
          {/* Status bar */}
          <div className="w-full flex items-center justify-between mb-3">
            <span className="text-slate-400 text-xs font-mono">
              {currentTime.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
            </span>
            <div className="flex items-center gap-1">
              {watchState === "help_coming" && <span className="text-blue-400 text-xs font-mono animate-pulse">SOS</span>}
              {!online && (
                <span className="flex items-center gap-0.5 text-red-400 text-[10px] font-semibold animate-pulse">
                  <WifiOff size={10} /> OFFLINE
                </span>
              )}
              {bufferCount > 0 && online && (
                <span className="text-yellow-400 text-[10px] font-semibold">
                  {bufferCount} buffered
                </span>
              )}
              {syncing && (
                <span className="flex items-center gap-0.5 text-green-400 text-[10px] font-semibold animate-pulse">
                  <RefreshCw size={10} className="animate-spin" /> sync
                </span>
              )}
              <Shield size={12} className="text-slate-400" />
            </div>
          </div>

          <AnimatePresence mode="wait">

            {/* ── NORMAL ── */}
            {watchState === "normal" && (
              <motion.div key="normal" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="flex flex-col items-center w-full flex-1">
                <div className="text-slate-400 text-xs uppercase tracking-widest mb-2">Emma Chen</div>
                <div className="text-white text-6xl font-bold font-mono mb-1">
                  {currentTime.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false })}
                </div>
                <div className="text-slate-500 text-xs mb-6">
                  {currentTime.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                </div>
                <div className="w-full grid grid-cols-2 gap-3 mt-2">
                  <div className="bg-slate-800/80 rounded-2xl p-3 flex flex-col items-center" data-testid="stat-heart-rate">
                    <Heart size={16} className="text-red-400 mb-1" />
                    <span className="text-white font-bold text-lg">{latestVitals?.heartRate ?? "—"}</span>
                    <span className="text-slate-500 text-xs">BPM</span>
                  </div>
                  <div className="bg-slate-800/80 rounded-2xl p-3 flex flex-col items-center" data-testid="stat-temperature">
                    <Thermometer size={16} className="text-orange-400 mb-1" />
                    <span className="text-white font-bold text-lg">{latestVitals?.temperature?.toFixed(1) ?? "—"}</span>
                    <span className="text-slate-500 text-xs">°C</span>
                  </div>
                </div>
                <div className="mt-4 text-slate-500 text-xs text-center">All sensors active</div>
                <div className="mt-1 flex items-center gap-1">
                  <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                  <span className="text-green-400 text-xs">Protected</span>
                </div>
              </motion.div>
            )}

            {/* ── IMPACT ── */}
            {watchState === "impact" && (
              <motion.div key="impact" initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ opacity: 0 }}
                className="flex flex-col items-center w-full flex-1">
                <div className="mb-3 flex items-center justify-center w-16 h-16 rounded-full bg-red-900/50 border-2 border-red-500">
                  <AlertTriangle size={32} className="text-red-400" />
                </div>
                <div className="text-red-400 font-bold text-lg text-center leading-tight mb-1">Are you okay?</div>
                <div className="text-slate-400 text-xs text-center mb-4">Impact detected. Do you need help?</div>
                <div className="w-full flex flex-col gap-3">
                  <motion.button whileTap={{ scale: 0.97 }} onClick={handleYes}
                    className="w-full h-16 rounded-2xl bg-red-600 text-white font-bold text-xl border-2 border-red-500 active:bg-red-700"
                    data-testid="button-need-help-yes">
                    YES — HELP ME
                  </motion.button>
                  <motion.button whileTap={{ scale: 0.97 }} onClick={handleNo}
                    className="w-full h-12 rounded-2xl bg-slate-700 text-slate-200 font-semibold text-base border border-slate-600 active:bg-slate-600"
                    data-testid="button-need-help-no">
                    No, I'm fine
                  </motion.button>
                </div>
                <div className="mt-4 text-slate-500 text-xs text-center">Auto-alerting in 30s if no response</div>
              </motion.div>
            )}

            {/* ── CONFIRMED ── */}
            {watchState === "confirmed" && (
              <motion.div key="confirmed" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="flex flex-col items-center w-full flex-1 justify-center">
                <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }}
                  className="w-16 h-16 rounded-full bg-blue-600 flex items-center justify-center mb-4">
                  <CheckCircle size={32} className="text-white" />
                </motion.div>
                <div className="text-white font-bold text-lg">Alert Sent</div>
                <div className="text-blue-400 text-sm mt-1">Contacting emergency services…</div>
              </motion.div>
            )}

            {/* ── PAIN REPORT ── */}
            {watchState === "pain_report" && (
              <motion.div key="pain" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                className="flex flex-col items-center w-full flex-1">
                <div className="text-red-400 font-bold text-base text-center mb-1">Where does it hurt?</div>
                <div className="text-slate-400 text-xs text-center mb-3">Tap your injury location</div>

                {/* Body part grid */}
                <div className="w-full grid grid-cols-3 gap-1.5 mb-3">
                  {BODY_PARTS.map((part) => (
                    <motion.button
                      key={part.id}
                      whileTap={{ scale: 0.92 }}
                      onClick={() => setPainPart(part.id)}
                      className={`rounded-xl py-2.5 flex flex-col items-center gap-0.5 border transition-colors ${
                        painPart === part.id
                          ? "bg-red-600/40 border-red-500 text-white"
                          : "bg-slate-800/60 border-slate-700 text-slate-300"
                      }`}
                      data-testid={`body-part-${part.id}`}
                    >
                      <span style={{ fontSize: 18 }}>{part.emoji}</span>
                      <span className="text-xs font-medium">{part.label}</span>
                    </motion.button>
                  ))}
                </div>

                {/* Pain scale */}
                <div className="w-full mb-3">
                  <div className="text-slate-400 text-xs text-center mb-2">How bad? (1 = mild, 5 = worst)</div>
                  <div className="flex gap-1.5 justify-center">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <motion.button
                        key={n}
                        whileTap={{ scale: 0.9 }}
                        onClick={() => setPainLevel(n)}
                        className={`w-9 h-9 rounded-xl font-bold text-sm border transition-colors ${
                          painLevel === n
                            ? n >= 4 ? "bg-red-600 border-red-500 text-white" : n >= 3 ? "bg-yellow-600 border-yellow-500 text-white" : "bg-green-700 border-green-600 text-white"
                            : "bg-slate-800 border-slate-700 text-slate-300"
                        }`}
                        data-testid={`pain-level-${n}`}
                      >
                        {n}
                      </motion.button>
                    ))}
                  </div>
                </div>

                <div className="w-full flex gap-2">
                  <button
                    onClick={handlePainSubmit}
                    className="flex-1 text-xs py-1.5 rounded-xl bg-slate-700 border border-slate-600 text-slate-300"
                    data-testid="button-pain-skip"
                  >
                    Skip
                  </button>
                  <motion.button
                    whileTap={{ scale: 0.97 }}
                    onClick={handlePainSubmit}
                    disabled={!painPart || !painLevel}
                    className="flex-[2] py-2.5 rounded-xl bg-red-600 text-white font-bold text-sm border-2 border-red-500 disabled:opacity-40"
                    data-testid="button-pain-send"
                  >
                    Send to Responders
                  </motion.button>
                </div>
              </motion.div>
            )}

            {/* ── HELP COMING ── */}
            {watchState === "help_coming" && (
              <motion.div key="help" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                className="flex flex-col items-center w-full flex-1">
                <div className="text-slate-400 text-xs uppercase tracking-widest mb-1">Ambulance ETA</div>
                <motion.div key={etaMinutes} initial={{ opacity: 0.5, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
                  className="text-white font-bold text-7xl font-mono leading-none mb-0.5" data-testid="text-eta-minutes">
                  {etaMinutes < 10 ? `0${etaMinutes}` : etaMinutes}
                </motion.div>
                <div className="text-slate-400 text-sm font-mono mb-1">:{etaSecsRemainder < 10 ? `0${etaSecsRemainder}` : etaSecsRemainder}</div>
                <div className="text-slate-500 text-xs mb-3">minutes away</div>

                {/* Pain summary badge */}
                {painPart && painLevel && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                    className="w-full mb-2 bg-red-900/20 border border-red-700/30 rounded-xl px-3 py-1.5 flex items-center gap-2"
                    data-testid="pain-summary">
                    <span style={{ fontSize: 14 }}>{BODY_PARTS.find((p) => p.id === painPart)?.emoji}</span>
                    <span className="text-xs text-red-300 font-medium capitalize">{painPart} pain</span>
                    <span className="ml-auto text-xs text-slate-400">Level {painLevel}/5</span>
                  </motion.div>
                )}

                <div className="w-full space-y-2">
                  <div className="flex items-center gap-2 bg-blue-900/30 rounded-xl px-3 py-2" data-testid="status-ambulance">
                    <div className="w-2 h-2 rounded-full bg-blue-400 animate-pulse flex-shrink-0" />
                    <span className="text-blue-300 text-xs">
                      {activeIncident?.ambulanceEtaMinutes != null ? `AMB en route — ${activeIncident.ambulanceEtaMinutes} min` : "Ambulance dispatched"}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 bg-green-900/30 rounded-xl px-3 py-2" data-testid="status-parent">
                    <div className="w-2 h-2 rounded-full bg-green-400 flex-shrink-0" />
                    <span className="text-green-300 text-xs">Parent notified & on the way</span>
                  </div>
                  {activeIncident?.hospitalName && (
                    <div className="flex items-center gap-2 bg-slate-800/60 rounded-xl px-3 py-2" data-testid="status-hospital">
                      <MapPin size={12} className="text-slate-400 flex-shrink-0" />
                      <span className="text-slate-300 text-xs truncate">{activeIncident.hospitalName}</span>
                    </div>
                  )}
                </div>

                <div className="w-full mt-3 grid grid-cols-2 gap-2">
                  <div className="bg-slate-800/70 rounded-xl p-2 flex flex-col items-center" data-testid="stat-hr-watch">
                    <Heart size={12} className="text-red-400 mb-0.5" />
                    <span className="text-white text-sm font-bold">{latestVitals?.heartRate ?? "—"}</span>
                    <span className="text-slate-500 text-xs">BPM</span>
                  </div>
                  <div className="bg-slate-800/70 rounded-xl p-2 flex flex-col items-center" data-testid="stat-temp-watch">
                    <Thermometer size={12} className="text-orange-400 mb-0.5" />
                    <span className="text-white text-sm font-bold">{latestVitals?.temperature?.toFixed(1) ?? "—"}</span>
                    <span className="text-slate-500 text-xs">°C</span>
                  </div>
                </div>

                {reassuranceMsg && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                    className="mt-3 w-full bg-blue-900/20 border border-blue-500/30 rounded-xl px-3 py-2"
                    data-testid="text-reassurance">
                    <div className="text-blue-300 text-xs leading-relaxed">{reassuranceMsg.content}</div>
                  </motion.div>
                )}

                {/* AI Voice Assistant button */}
                <motion.button
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setVoiceOpen(true)}
                  className="mt-3 w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-purple-900/40 border border-purple-600/50 text-purple-300 text-xs font-medium hover:bg-purple-900/60 transition-colors"
                  data-testid="button-voice-assistant"
                >
                  <MessageCircle size={13} />
                  Talk to AI Assistant
                </motion.button>

                {/* Voice assistant panel */}
                <AnimatePresence>
                  {voiceOpen && (
                    <motion.div
                      key="voicePanel"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 10 }}
                      className="mt-2 w-full bg-slate-900 border border-purple-600/40 rounded-xl p-3"
                      data-testid="voice-assistant-panel"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-purple-300 text-xs font-semibold">AI Assistant</span>
                        <button onClick={() => setVoiceOpen(false)} className="text-slate-500 hover:text-white">
                          <X size={12} />
                        </button>
                      </div>
                      {aiReply && (
                        <motion.div
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          className="mb-2 bg-blue-900/30 border border-blue-700/30 rounded-lg px-2.5 py-2"
                          data-testid="ai-reply"
                        >
                          <div className="text-blue-200 text-xs leading-relaxed">{aiReply}</div>
                        </motion.div>
                      )}
                      <div className="flex gap-1.5">
                        <motion.button
                          whileTap={{ scale: 0.9 }}
                          onClick={isListening ? stopListening : startListening}
                          className={`rounded-lg p-1.5 border text-xs transition-colors ${
                            isListening
                              ? "bg-red-700 border-red-500 text-white animate-pulse"
                              : "bg-slate-700 border-slate-600 text-slate-300 hover:bg-slate-600"
                          }`}
                          title={isListening ? "Stop recording" : "Speak (Chrome)"}
                          data-testid="button-mic"
                        >
                          {isListening ? <MicOff size={13} /> : <Mic size={13} />}
                        </motion.button>
                        <input
                          type="text"
                          value={voiceInput}
                          onChange={(e) => setVoiceInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && voiceInput.trim()) {
                              const msg = voiceInput.trim();
                              setVoiceInput("");
                              voiceChat.mutate(
                                { data: { message: msg, childName: activeIncident?.childName ?? undefined } },
                                { onSuccess: (d) => setAiReply(d.reply) }
                              );
                            }
                          }}
                          placeholder={isListening ? "Listening…" : "Tell me where it hurts…"}
                          className="flex-1 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white px-2 py-1.5 outline-none focus:border-purple-500"
                          data-testid="input-voice-chat"
                        />
                        <motion.button
                          whileTap={{ scale: 0.9 }}
                          onClick={() => {
                            if (!voiceInput.trim()) return;
                            const msg = voiceInput.trim();
                            setVoiceInput("");
                            voiceChat.mutate(
                              { data: { message: msg, childName: activeIncident?.childName ?? undefined } },
                              { onSuccess: (d) => setAiReply(d.reply) }
                            );
                          }}
                          disabled={voiceChat.isPending || !voiceInput.trim()}
                          className="bg-purple-700 hover:bg-purple-600 disabled:opacity-40 text-white rounded-lg px-2.5 py-1.5 text-xs font-bold"
                          data-testid="button-send-voice"
                        >
                          {voiceChat.isPending ? "…" : "Send"}
                        </motion.button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            )}

          </AnimatePresence>
        </div>

        {/* Watch bottom bar */}
        <div className="bg-slate-900/80 border-t border-slate-800 px-4 py-2 flex items-center justify-between">
          <Phone size={14} className="text-slate-500" />
          <div className="flex gap-1">
            {[0, 1, 2].map((i) => <div key={i} className="w-1.5 h-1.5 rounded-full bg-slate-600" />)}
          </div>
          <Clock size={14} className="text-slate-500" />
        </div>
      </div>

      {/* Demo controls */}
      <div className="mt-6 w-full max-w-sm">
        <div className="text-slate-600 text-xs uppercase tracking-widest text-center mb-3">Simulate</div>
        <div className="flex gap-2 mb-2">
          <button onClick={() => { setWatchState("impact"); setPainPart(null); setPainLevel(null); }}
            className="flex-1 py-2 rounded-xl bg-red-900/30 border border-red-800/50 text-red-400 text-sm hover:bg-red-900/50 transition-colors"
            data-testid="button-sim-impact">
            Impact
          </button>
          <button onClick={() => { setWatchState("pain_report"); }}
            className="flex-1 py-2 rounded-xl bg-orange-900/30 border border-orange-800/50 text-orange-400 text-sm hover:bg-orange-900/50 transition-colors"
            data-testid="button-sim-pain">
            Pain Report
          </button>
          <button onClick={() => { setWatchState("help_coming"); setEtaSeconds(240); }}
            className="flex-1 py-2 rounded-xl bg-blue-900/30 border border-blue-800/50 text-blue-400 text-sm hover:bg-blue-900/50 transition-colors"
            data-testid="button-sim-help">
            Help Coming
          </button>
          <button onClick={() => setWatchState("normal")}
            className="flex-1 py-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-400 text-sm hover:bg-slate-700 transition-colors"
            data-testid="button-sim-normal">
            Normal
          </button>
        </div>
        <button
          onClick={simulateSensorImpact}
          disabled={sensorSimLoading}
          className="w-full py-2.5 rounded-xl bg-yellow-900/30 border border-yellow-700/50 text-yellow-400 text-sm font-medium hover:bg-yellow-900/50 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
          data-testid="button-sim-sensor-api"
        >
          <Zap size={13} />
          {sensorSimLoading ? "Sending to sensor API…" : "Fire Sensor Pipeline (9.2g → API → Incident)"}
        </button>
        {bufferCount > 0 && (
          <button
            onClick={syncBuffer}
            disabled={syncing || !online}
            className="w-full mt-2 py-2 rounded-xl bg-green-900/30 border border-green-700/50 text-green-400 text-sm font-medium hover:bg-green-900/50 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
            data-testid="button-sync-buffer"
          >
            <RefreshCw size={13} className={syncing ? "animate-spin" : ""} />
            {syncing ? "Syncing…" : `Sync ${bufferCount} buffered reading${bufferCount === 1 ? "" : "s"}`}
          </button>
        )}
      </div>
    </div>
  );
}
