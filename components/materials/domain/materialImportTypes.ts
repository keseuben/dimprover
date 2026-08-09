export type MaterialImporterId = "csv-v1" | "xlsx-v1" | "json-v1" | "winwatt-v1" | "manufacturer-pack-v1";

export type MaterialImportBatch = {
  id: string;
  sourcePackageId: string;
  importerId: MaterialImporterId;
  status: "uploaded" | "parsed" | "mappingRequired" | "validationFailed" | "reviewRequired" | "approved" | "published" | "rejected";
  totalRows: number;
  validRows: number;
  warningRows: number;
  errorRows: number;
  createdBy: string;
  createdAt: string;
  completedAt?: string;
};

export type MaterialImportRow = {
  id: string;
  batchId: string;
  rowNumber: number;
  rawData: Record<string, unknown>;
  normalizedData?: Record<string, unknown>;
  mappingStatus: "unmapped" | "mapped" | "ambiguous" | "invalid";
  duplicateCandidateIds: string[];
  validationMessages: string[];
  reviewDecision: "pending" | "approve" | "reject" | "merge" | "createNew";
};

export type ImportFieldMapping = {
  sourceField: string;
  targetField?: string;
  conversion?: string;
  sourceUnit?: string;
  targetUnit?: string;
  confidence: "exact" | "probable" | "manual";
  approvedBy?: string;
};
