const url = process.env.NEXT_PUBLIC_API_URL;
if (!url && typeof window !== "undefined" && window.location.hostname !== "localhost") {
  console.warn("NEXT_PUBLIC_API_URL not set — API calls will fail in production");
}
export const API = url || "http://localhost:8888";
