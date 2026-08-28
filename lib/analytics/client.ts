"use client";

import type { AnalyticsEventName } from "@/lib/analytics/events";

const VISITOR_KEY = "yakisugi_visit_id";

function visitorId(): string | null {
  try {
    const existing = sessionStorage.getItem(VISITOR_KEY);
    if (existing) return existing;
    const created = crypto.randomUUID();
    sessionStorage.setItem(VISITOR_KEY, created);
    return created;
  } catch {
    return null;
  }
}

export function trackEvent(
  event: AnalyticsEventName,
  incidentSlug?: string,
): void {
  const visitor = visitorId();
  if (!visitor) return;
  void fetch("/api/analytics", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ event, visitorId: visitor, incidentSlug }),
    keepalive: true,
  }).catch(() => undefined);
}
