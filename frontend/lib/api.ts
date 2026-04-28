import axios from "axios";

const FALLBACK_API_URL = "http://localhost:8000";

export const API_URL = process.env.NEXT_PUBLIC_API_URL || FALLBACK_API_URL;

export function getWebSocketUrl() {
  try {
    const url = new URL(API_URL);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    url.pathname = "/ws";
    const userId = getUserId();
    url.searchParams.set("x-user-id", userId);
    return url.toString();
  } catch {
    const userId = getUserId();
    return `ws://localhost:8000/ws?x-user-id=${userId}`;
  }
}

export const WS_URL = getWebSocketUrl();

// ── Multi-Tenancy: Auto-generate unique user_id per browser ──
function getUserId(): string {
  if (typeof window === "undefined") return "server";
  let uid = localStorage.getItem("dap_user_id");
  if (!uid) {
    uid = crypto.randomUUID();
    localStorage.setItem("dap_user_id", uid);
  }
  return uid;
}

export function getCurrentUserId(): string {
  return getUserId();
}

// ── Axios interceptor: attach X-User-Id to every request ──
axios.interceptors.request.use((config) => {
  if (typeof window !== "undefined") {
    config.headers["X-User-Id"] = getUserId();
  }
  return config;
});

// ── Handle 401/403 errors ──
axios.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 || error.response?.status === 403) {
      console.error("Authorization error:", error.response?.data?.detail);
    }
    return Promise.reject(error);
  }
);
