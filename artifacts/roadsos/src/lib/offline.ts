type BufferEntry = {
  id: string;
  type: "sensor" | "vitals" | "pain" | "impact";
  payload: unknown;
  timestamp: string;
};

const BUFFER_KEY = "roadsos_offline_buffer";

export function isOnline(): boolean {
  return typeof navigator !== "undefined" ? navigator.onLine : true;
}

export function getOfflineBuffer(): BufferEntry[] {
  try {
    const raw = localStorage.getItem(BUFFER_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function pushOfflineBuffer(entry: BufferEntry) {
  const buffer = getOfflineBuffer();
  buffer.push(entry);
  localStorage.setItem(BUFFER_KEY, JSON.stringify(buffer));
}

export function clearOfflineBuffer() {
  localStorage.removeItem(BUFFER_KEY);
}

export function removeOfflineEntry(id: string) {
  const buffer = getOfflineBuffer().filter((e) => e.id !== id);
  localStorage.setItem(BUFFER_KEY, JSON.stringify(buffer));
}

export function flushSensorBuffer(): BufferEntry[] {
  const buffer = getOfflineBuffer();
  const sensor = buffer.filter((e) => e.type === "sensor");
  const rest = buffer.filter((e) => e.type !== "sensor");
  localStorage.setItem(BUFFER_KEY, JSON.stringify(rest));
  return sensor;
}

export function flushAllBuffer(): BufferEntry[] {
  const all = getOfflineBuffer();
  clearOfflineBuffer();
  return all;
}
