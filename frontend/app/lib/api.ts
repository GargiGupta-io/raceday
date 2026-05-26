const url = process.env.NEXT_PUBLIC_API_URL;

if (!url) {
  if (typeof window !== "undefined" && window.location.hostname !== "localhost") {
    throw new Error(
      "NEXT_PUBLIC_API_URL is not set. Add it to your Vercel environment variables."
    );
  }
}

export const API = url || "http://localhost:8888";

export type FetchState = "loading" | "slowLoading" | "success" | "empty" | "error" | "retrying";

interface FetchWithTimeoutOptions extends RequestInit {
  timeoutMs?: number;
  retries?: number;
  slowMs?: number;
  onState?: (state: FetchState) => void;
}

export async function fetchWithTimeout<T>(
  requestUrl: string,
  {
    timeoutMs = 8000,
    retries = 1,
    slowMs = 3000,
    onState,
    ...init
  }: FetchWithTimeoutOptions = {}
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
    const slow = window.setTimeout(() => onState?.("slowLoading"), slowMs);

    onState?.(attempt === 0 ? "loading" : "retrying");

    try {
      const response = await fetch(requestUrl, {
        ...init,
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`${response.status}`);
      }

      const data = (await response.json()) as T;
      onState?.(isEmptyResponse(data) ? "empty" : "success");
      return data;
    } catch (error) {
      lastError = error;
      if (attempt === retries) {
        onState?.("error");
        throw error;
      }
    } finally {
      window.clearTimeout(timeout);
      window.clearTimeout(slow);
    }
  }

  onState?.("error");
  throw lastError instanceof Error ? lastError : new Error("Request failed");
}

function isEmptyResponse(data: unknown) {
  if (Array.isArray(data)) return data.length === 0;
  if (data && typeof data === "object" && "active" in data) return false;
  return data == null;
}
