import { createRoot } from "react-dom/client";
import { useEffect, useState } from "react";

interface DriverLive {
  code: string;
  name: string;
  team: string;
  teamColour: string;
  position: number;
  gap: string;
  compound: string;
  stintAge: number;
  pitWindow: string | null;
  tyreLife: number;
}

interface LiveData {
  lap: number;
  totalLaps: number;
  session: string;
  drivers: DriverLive[];
}

interface ExtensionSettings {
  backendUrl: string;
  overlayEnabled: boolean;
  overlayMode: "compact" | "full";
  demoMode: boolean;
}

type ConnectionStatus = "connected" | "checking" | "offline" | "demo" | "no-session" | "stopped" | "disconnected";

const DEFAULT_SETTINGS: ExtensionSettings = {
  backendUrl: "http://localhost:8888",
  overlayEnabled: true,
  overlayMode: "compact",
  demoMode: false,
};

function sendMessage<T>(message: Record<string, unknown>): Promise<T> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (response) => resolve(response as T));
  });
}

function statusLabel(status: ConnectionStatus) {
  if (status === "connected") return "Connected";
  if (status === "checking") return "Checking";
  if (status === "demo") return "Demo Mode";
  if (status === "no-session") return "No Live Session";
  if (status === "stopped") return "Overlay Off";
  return "Offline";
}

function statusColor(status: ConnectionStatus) {
  if (status === "connected" || status === "demo") return "#dc2626";
  if (status === "checking") return "#a1a1aa";
  return "#52525b";
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      padding: "12px",
      borderRadius: 8,
      marginBottom: 10,
      background: "#111113",
      border: "1px solid #1f1f24",
    }}>
      {children}
    </div>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        width: "100%",
        border: "1px solid #27272a",
        background: checked ? "rgba(220, 38, 38, 0.12)" : "#0c0c0e",
        color: "#e4e4e7",
        borderRadius: 6,
        padding: "8px 10px",
        cursor: "pointer",
      }}
    >
      <span style={{ fontSize: 11, fontWeight: 600 }}>{label}</span>
      <span style={{
        width: 8,
        height: 8,
        borderRadius: 999,
        background: checked ? "#dc2626" : "#52525b",
      }} />
    </button>
  );
}

function Popup() {
  const [settings, setSettings] = useState<ExtensionSettings>(DEFAULT_SETTINGS);
  const [backendDraft, setBackendDraft] = useState(DEFAULT_SETTINGS.backendUrl);
  const [status, setStatus] = useState<ConnectionStatus>("checking");
  const [liveData, setLiveData] = useState<LiveData | null>(null);

  useEffect(() => {
    sendMessage<{ settings: ExtensionSettings; status: ConnectionStatus; data?: LiveData | null }>({ type: "GET_LIVE_DATA" })
      .then((response) => {
        if (!response) return;
        const nextSettings = { ...DEFAULT_SETTINGS, ...response.settings };
        setSettings(nextSettings);
        setBackendDraft(nextSettings.backendUrl);
        setStatus(response.status || "checking");
        setLiveData(response.data || null);
      });

    const listener = (msg: { type: string; data?: LiveData | null; status?: ConnectionStatus; settings?: ExtensionSettings }) => {
      if (msg.type === "LIVE_UPDATE") setLiveData(msg.data || null);
      if (msg.type === "WS_STATUS" && msg.status) setStatus(msg.status);
      if (msg.type === "SETTINGS_UPDATE" && msg.settings) {
        setSettings({ ...DEFAULT_SETTINGS, ...msg.settings });
        setBackendDraft(msg.settings.backendUrl);
      }
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, []);

  function saveSettings(next: Partial<ExtensionSettings>) {
    const merged = { ...settings, ...next };
    setSettings(merged);
    sendMessage<{ settings: ExtensionSettings; status: ConnectionStatus }>({
      type: "SAVE_SETTINGS",
      settings: merged,
    }).then((response) => {
      if (!response) return;
      setSettings({ ...DEFAULT_SETTINGS, ...response.settings });
      setStatus(response.status);
    });
  }

  return (
    <div style={{ padding: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
        <div style={{
          background: "#dc2626",
          color: "white",
          fontWeight: 800,
          fontSize: 13,
          padding: "3px 8px",
          borderRadius: 5,
          letterSpacing: 0.8,
        }}>
          RD
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#fafafa" }}>Raceday</div>
          <div style={{ fontSize: 9, color: "#71717a" }}>Live Strategy Companion</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 7, height: 7, borderRadius: 999, background: statusColor(status) }} />
          <span style={{ fontSize: 9, color: "#a1a1aa" }}>{statusLabel(status)}</span>
        </div>
      </div>

      <Card>
        <div style={{ fontSize: 9, color: "#71717a", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 6 }}>
          Backend URL
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <input
            value={backendDraft}
            onChange={(event) => setBackendDraft(event.target.value)}
            placeholder="https://your-backend.railway.app"
            style={{
              flex: 1,
              minWidth: 0,
              border: "1px solid #27272a",
              borderRadius: 6,
              background: "#09090b",
              color: "#e4e4e7",
              fontSize: 10,
              padding: "8px",
            }}
          />
          <button
            type="button"
            onClick={() => saveSettings({ backendUrl: backendDraft.trim() || DEFAULT_SETTINGS.backendUrl })}
            style={{
              border: "1px solid rgba(220, 38, 38, 0.35)",
              borderRadius: 6,
              background: "rgba(220, 38, 38, 0.14)",
              color: "#fff",
              fontSize: 10,
              fontWeight: 700,
              padding: "0 10px",
              cursor: "pointer",
            }}
          >
            Save
          </button>
        </div>
      </Card>

      <Card>
        <div style={{ display: "grid", gap: 8 }}>
          <Toggle
            label="Overlay"
            checked={settings.overlayEnabled}
            onChange={(checked) => saveSettings({ overlayEnabled: checked })}
          />
          <Toggle
            label="Demo mode"
            checked={settings.demoMode}
            onChange={(checked) => saveSettings({ demoMode: checked })}
          />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
            {(["compact", "full"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => saveSettings({ overlayMode: mode })}
                style={{
                  border: settings.overlayMode === mode ? "1px solid rgba(220, 38, 38, 0.45)" : "1px solid #27272a",
                  borderRadius: 6,
                  background: settings.overlayMode === mode ? "rgba(220, 38, 38, 0.12)" : "#0c0c0e",
                  color: "#e4e4e7",
                  padding: "8px",
                  fontSize: 10,
                  fontWeight: 700,
                  textTransform: "capitalize",
                  cursor: "pointer",
                }}
              >
                {mode}
              </button>
            ))}
          </div>
        </div>
      </Card>

      {liveData ? (
        <Card>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#fafafa" }}>
                {liveData.session.replace(" Grand Prix", "")}
              </div>
              <div style={{ fontSize: 9, color: settings.demoMode ? "#dc2626" : "#71717a", marginTop: 2 }}>
                {settings.demoMode ? "Demo data" : "Live data"}
              </div>
            </div>
            <div style={{ fontSize: 18, fontWeight: 800, color: "#fafafa" }}>
              {liveData.lap}<span style={{ fontSize: 11, color: "#71717a", fontWeight: 400 }}>/{liveData.totalLaps}</span>
            </div>
          </div>
          <div style={{ marginTop: 10, display: "grid", gap: 5 }}>
            {liveData.drivers.slice(0, 5).map((driver) => (
              <div key={driver.code} style={{ display: "grid", gridTemplateColumns: "26px 1fr 46px", gap: 8, fontSize: 10, color: "#d4d4d8" }}>
                <span>P{driver.position}</span>
                <span>{driver.code}</span>
                <span style={{ textAlign: "right", color: "#71717a" }}>{driver.gap}</span>
              </div>
            ))}
          </div>
        </Card>
      ) : (
        <Card>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#f4f4f5" }}>No live session active</div>
          <div style={{ fontSize: 10, color: "#71717a", lineHeight: 1.5, marginTop: 5 }}>
            The overlay will wake up automatically during race weekends. Turn on demo mode to preview the flow now.
          </div>
        </Card>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
        <span style={{ fontSize: 8, color: "#3f3f46" }}>v0.1.0</span>
        <span style={{ fontSize: 8, color: "#3f3f46" }}>{settings.overlayMode} overlay</span>
      </div>
    </div>
  );
}

const root = createRoot(document.getElementById("root")!);
root.render(<Popup />);
