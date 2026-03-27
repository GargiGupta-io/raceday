const url = process.env.NEXT_PUBLIC_API_URL;

if (!url) {
  if (typeof window !== "undefined" && window.location.hostname !== "localhost") {
    throw new Error(
      "NEXT_PUBLIC_API_URL is not set. Add it to your Vercel environment variables."
    );
  }
}

export const API = url || "http://localhost:8888";
