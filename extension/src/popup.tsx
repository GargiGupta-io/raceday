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
  predictions?: { driver: string; prediction: string; confidence: string }[];
  whatIf?: { driver: string; pitNow: string; stayOut: string; recommendation: "pit" | "stay" | "neutral" }[];
  alerts?: { text: string; type: "warning" | "info" | "opportunity" }[];
}

interface ExtensionSettings {
  backendUrl: string;
  overlayEnabled: boolean;
  overlayMode: "compact" | "full";
  demoMode: boolean;
}

type ConnectionStatus = "connected" | "checking" | "offline" | "demo" | "no-session" | "stopped" | "disconnected";

const DEFAULT_SETTINGS: ExtensionSettings = {
  backendUrl: "https://web-production-b8406.up.railway.app",
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
  if (status === "connected") return "Live strategy on";
  if (status === "checking") return "Checking race data";
  if (status === "demo") return "Demo preview";
  if (status === "no-session") return "No live race";
  if (status === "stopped") return "Overlay Off";
  return "RaceDay unavailable";
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
  const [advancedOpen, setAdvancedOpen] = useState(false);

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
        <div style={{ display: "grid", gap: 8 }}>
          <Toggle
            label="Show RaceDay overlay"
            checked={settings.overlayEnabled}
            onChange={(checked) => saveSettings({ overlayEnabled: checked })}
          />
          <Toggle
            label="Preview with demo data"
            checked={settings.demoMode}
            onChange={(checked) => saveSettings({ demoMode: checked })}
          />
          <div style={{ fontSize: 9, color: "#71717a", textTransform: "uppercase", letterSpacing: 0.8 }}>
            Overlay size
          </div>
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
          <div style={{ fontSize: 9, color: "#71717a", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 7 }}>
            RaceDay signal
          </div>
          <div style={{ fontSize: 13, fontWeight: 750, color: "#fafafa", lineHeight: 1.35 }}>
            {liveData.alerts?.[0]?.text || liveData.predictions?.[0]?.prediction || "Strategy insight will appear as race data changes."}
          </div>
          <div style={{ marginTop: 8, fontSize: 10, color: settings.demoMode ? "#dc2626" : "#71717a" }}>
            {settings.demoMode ? "Demo preview" : liveData.session.replace(" Grand Prix", "")} · Lap {liveData.lap}/{liveData.totalLaps}
          </div>
          <div style={{ marginTop: 12, display: "grid", gap: 6 }}>
            {(liveData.predictions || []).slice(0, 2).map((prediction) => (
              <div key={`${prediction.driver}-${prediction.prediction}`} style={{ display: "grid", gridTemplateColumns: "34px 1fr", gap: 8, fontSize: 10 }}>
                <span style={{ color: "#fca5a5", fontWeight: 800 }}>{prediction.driver}</span>
                <span style={{ color: "#d4d4d8" }}>{prediction.prediction}</span>
              </div>
            ))}
          </div>
        </Card>
      ) : (
        <Card>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#f4f4f5" }}>No live race right now</div>
          <div style={{ fontSize: 10, color: "#71717a", lineHeight: 1.5, marginTop: 5 }}>
            Use demo preview to see RaceDay strategy signals before the next race weekend.
          </div>
        </Card>
      )}

      <button
        type="button"
        onClick={() => setAdvancedOpen((value) => !value)}
        style={{
          width: "100%",
          border: "none",
          background: "transparent",
          color: "#71717a",
          fontSize: 10,
          textAlign: "left",
          cursor: "pointer",
          marginBottom: advancedOpen ? 8 : 0,
        }}
      >
        Advanced connection {advancedOpen ? "↑" : "↓"}
      </button>

      {advancedOpen && (
        <Card>
          <div style={{ fontSize: 9, color: "#71717a", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 6 }}>
            RaceDay data service
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <input
              value={backendDraft}
              onChange={(event) => setBackendDraft(event.target.value)}
              placeholder={DEFAULT_SETTINGS.backendUrl}
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
