export function getIndustryMarkerName(
  properties: Record<string, unknown> | undefined,
) {
  const companyName = properties?.companyName;
  if (typeof companyName !== "string") return null;

  const normalizedName = companyName.trim();
  return normalizedName || null;
}
