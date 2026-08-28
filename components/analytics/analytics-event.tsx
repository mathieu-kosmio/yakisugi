"use client";

import Link from "next/link";
import { useEffect } from "react";
import { trackEvent } from "@/lib/analytics/client";
import type { AnalyticsEventName } from "@/lib/analytics/events";

type EventProps = {
  event: AnalyticsEventName;
  incidentSlug?: string;
};

export function AnalyticsView({ event, incidentSlug }: EventProps) {
  useEffect(() => trackEvent(event, incidentSlug), [event, incidentSlug]);
  return null;
}

export function TrackedLink({
  event,
  incidentSlug,
  href,
  className,
  children,
}: EventProps & {
  href: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      className={className}
      href={href}
      onClick={() => trackEvent(event, incidentSlug)}
    >
      {children}
    </Link>
  );
}

export function TrackedSubmitButton({
  event,
  incidentSlug,
  children,
}: EventProps & { children: React.ReactNode }) {
  return (
    <button
      className="button-primary"
      type="submit"
      onClick={() => trackEvent(event, incidentSlug)}
    >
      {children}
    </button>
  );
}
