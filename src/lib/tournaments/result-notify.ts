export type ResultNotifyScope = "all" | "playoffs" | "never";
export type ResultNotifyChannel = "in_app" | "email" | "whatsapp" | "sms";

export const RESULT_NOTIFY_CHANNELS: { key: ResultNotifyChannel; label: string }[] = [
  { key: "in_app", label: "In-app" },
  { key: "email", label: "Email" },
  { key: "whatsapp", label: "WhatsApp" },
  { key: "sms", label: "SMS" },
];

export function parseResultNotifyScope(v: unknown): ResultNotifyScope {
  return v === "playoffs" || v === "never" ? v : "all";
}

export function parseResultNotifyChannels(v: unknown): ResultNotifyChannel[] {
  if (!Array.isArray(v)) return ["email"];
  const ok = new Set(RESULT_NOTIFY_CHANNELS.map((c) => c.key));
  return v.filter((x): x is ResultNotifyChannel => ok.has(x));
}
