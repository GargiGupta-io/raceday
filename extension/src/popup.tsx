import { createRoot } from "react-dom/client";
import { useEffect, useState } from "react";

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
  overlayMode: "full",
  demoMode: false,
};

function sendMessage<T>(message: Record<string, unknown>): Promise<T> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (response) => resolve(response as T));
  });
}

function statusLabel(status: ConnectionStatus) {
  if (status === "connected") return "Watching live race";
  if (status === "checking") return "Checking race data";
  if (status === "demo") return "Demo race";
  if (status === "no-session") return "No live race";
  if (status === "stopped") return "Notes hidden";
  return "RaceDay unavailable";
}

function statusColor(status: ConnectionStatus) {
  if (status === "connected" || status === "demo") return "#dc2626";
  if (status === "checking") return "#a1a1aa";
  return "#52525b";
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
        background: checked ? "rgba(220, 38, 38, 0.16)" : "#0c0c0e",
        color: "#f4f4f5",
        borderRadius: 8,
        padding: "12px 14px",
        cursor: "pointer",
      }}
    >
      <span style={{ fontSize: 14, fontWeight: 700 }}>{label}</span>
      <span
        style={{
          width: 10,
          height: 10,
          borderRadius: 999,
          background: checked ? "#dc2626" : "#52525b",
        }}
      />
    </button>
  );
}

function Popup() {
  const [settings, setSettings] = useState<ExtensionSettings>(DEFAULT_SETTINGS);
  const [status, setStatus] = useState<ConnectionStatus>("checking");

  useEffect(() => {
    sendMessage<{ settings: ExtensionSettings; status: ConnectionStatus }>({ type: "GET_SETTINGS" })
      .then((response) => {
        if (!response) return;
        const nextSettings = { ...DEFAULT_SETTINGS, ...response.settings, backendUrl: DEFAULT_SETTINGS.backendUrl };
        setSettings(nextSettings);
        setStatus(response.status || "checking");
      });

    const listener = (msg: { type: string; status?: ConnectionStatus; settings?: ExtensionSettings }) => {
      if (msg.type === "WS_STATUS" && msg.status) setStatus(msg.status);
      if (msg.type === "SETTINGS_UPDATE" && msg.settings) {
        setSettings({ ...DEFAULT_SETTINGS, ...msg.settings, backendUrl: DEFAULT_SETTINGS.backendUrl });
      }
    };

    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, []);

  function saveSettings(next: Partial<ExtensionSettings>) {
    const merged = {
      ...settings,
      ...next,
      backendUrl: DEFAULT_SETTINGS.backendUrl,
      overlayMode: "full" as const,
    };
    setSettings(merged);
    sendMessage<{ settings: ExtensionSettings; status: ConnectionStatus }>({
      type: "SAVE_SETTINGS",
      settings: merged,
    }).then((response) => {
      if (!response) return;
      setSettings({ ...DEFAULT_SETTINGS, ...response.settings, backendUrl: DEFAULT_SETTINGS.backendUrl });
      setStatus(response.status);
    });
  }

  return (
    <div style={{ padding: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
        <div
          style={{
            background: "#dc2626",
            color: "white",
            fontWeight: 900,
            fontSize: 15,
            padding: "6px 10px",
            borderRadius: 7,
            letterSpacing: 0.5,
          }}
        >
          RD
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: "#fafafa" }}>RaceDay</div>
          <div style={{ fontSize: 11, color: "#a1a1aa" }}>Race companion</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 8, height: 8, borderRadius: 999, background: statusColor(status) }} />
          <span style={{ fontSize: 11, color: "#d4d4d8" }}>{statusLabel(status)}</span>
        </div>
      </div>

      <div
        style={{
          padding: 16,
          borderRadius: 10,
          marginBottom: 12,
          background: "#111113",
          border: "1px solid #27272a",
        }}
      >
        <div style={{ fontSize: 18, fontWeight: 850, color: "#ffffff", lineHeight: 1.25 }}>
          RaceDay is ready.
        </div>
        <div style={{ marginTop: 8, fontSize: 13, color: "#c4c4cc", lineHeight: 1.45 }}>
          It will show simple strategy notes on the video.
        </div>
        <div style={{ marginTop: 10, fontSize: 11, color: "#71717a", lineHeight: 1.45 }}>
          Use demo race when there is no live session.
        </div>
      </div>

      <div style={{ display: "grid", gap: 10 }}>
        <Toggle
          label="Show notes on video"
          checked={settings.overlayEnabled}
          onChange={(checked) => saveSettings({ overlayEnabled: checked })}
        />
        <Toggle
          label="Try demo race"
          checked={settings.demoMode}
          onChange={(checked) => saveSettings({ demoMode: checked })}
        />
      </div>
    </div>
  );
}

const root = createRoot(document.getElementById("root")!);
root.render(<Popup />);
