const parseBooleanFlag = (value: string | undefined, fallback: boolean) => {
  if (value === undefined) return fallback;
  return value.toLowerCase() === "true";
};

export const apiBaseUrl =
  import.meta.env.VITE_ADMIN_API_URL || import.meta.env.VITE_API_URL || "";

export const websocketBaseUrl = import.meta.env.VITE_WS_URL || "";

export const featureFlags = {
  metrics: parseBooleanFlag(import.meta.env.VITE_ENABLE_METRICS, true),
  logs: parseBooleanFlag(import.meta.env.VITE_ENABLE_LOGS, true),
};
