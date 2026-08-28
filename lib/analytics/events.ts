export const analyticsEventNames = [
  "map_opened",
  "incident_selected",
  "parcel_clicked",
  "industry_filter_used",
  "export_cta_clicked",
  "checkout_started",
  "purchase_completed",
] as const;

export type AnalyticsEventName = (typeof analyticsEventNames)[number];
