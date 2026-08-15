export type FieldIssueSyncState = "LOCAL" | "DIRTY" | "SYNCING" | "SYNCED" | "ERROR"

export type FieldIssue = {
  id: string
  serial: string
  localSerial?: string
  title: string
  location: string
  description: string
  severity: string
  responsible: string
  contractorRepresentative: string
  deadline: string
  status: string
  note: string
  sourceId?: string
  coreIssueId?: string
  coreSerial?: string
  coreVersion?: number
  syncState?: FieldIssueSyncState
  syncError?: string
  syncedAt?: string
}
