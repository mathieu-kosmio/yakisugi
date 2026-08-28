export type ExportRequestInput = {
  incidentSlug: string;
  contactName: string;
  organization: string;
  contactEmail: string;
  intendedUse: string;
  message: string | null;
  consentAt: string;
};

export type CreatedExportRequest = {
  id: string;
  incidentSlug: string;
};

export interface ExportRequestRepository {
  create(input: ExportRequestInput): Promise<CreatedExportRequest | null>;
}
