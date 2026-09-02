export function getIndustryMarkerName(
  properties: Record<string, unknown> | undefined,
) {
  const companyName = properties?.companyName;
  if (typeof companyName !== "string") return null;

  const normalizedName = companyName.trim();
  return normalizedName || null;
}

export function getIndustrySireneUrl(
  properties: Record<string, unknown> | undefined,
) {
  const siret = properties?.siret;
  if (typeof siret !== "string" || !/^\d{14}$/.test(siret)) return null;

  return `https://annuaire-entreprises.data.gouv.fr/etablissement/${siret}`;
}
