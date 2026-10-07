import "server-only";
import { getDatabaseClient } from "./databaseRepository";
import { DriveCoreRepositoryError } from "./errors";

export type DriveDeleteDependency = {
  id: string;
  documentId: string;
  kind: "PROJECT_ISSUE" | "FORMAL_ISSUE" | "BOX" | "COMPARE_FINDING" | "ENTITY_LINK";
  reference: string;
  title: string;
  status: string;
  relationType: string;
  issueId: string | null;
  documentName: string;
};

type AttachmentRow = {
  id: string;
  issue_id: string;
  drive_document_id: string;
  relation_type: string;
  attachment_kind: string;
};

type IssueRow = {
  id: string;
  serial: string;
  title: string;
  status: string;
  deleted_at: string | null;
};

type FormalIssueRow = {
  id: string;
  document_id: string;
  issue_number: string;
  status: string;
  purpose: string;
};

type BoxItemRow = { id: string; box_id: string; document_id: string; version_id: string | null };
type BoxRow = { id: string; name: string; purpose: string; status: string; lifecycle_status?: string | null };
type CompareFindingRow = { id: string; left_document_id: string; right_document_id: string; zone_label: string; status: string; priority: string };
type EntityLinkRow = { id: string; source_type: string; source_id: string; target_type: string; target_id: string; relation_type: string };

type FolderRow = { id: string; parent_id: string | null; status: string };
type DocumentRow = { id: string; folder_id: string; status: string };

function dbError(message: string, error: unknown): never {
  const candidate = error as { code?: string; message?: string; details?: string; hint?: string } | null;
  throw new DriveCoreRepositoryError(
    message,
    candidate?.code || "DRIVE_DOCUMENT_DEPENDENCY_DATABASE_ERROR",
    500,
    candidate ? { message: candidate.message, details: candidate.details, hint: candidate.hint } : undefined,
  );
}

export async function listDriveDocumentDeleteDependencies(projectId: string, documentIds: string[]) {
  const ids = [...new Set(documentIds.map((value) => String(value || "").trim()).filter(Boolean))];
  if (!ids.length) return [] satisfies DriveDeleteDependency[];
  if (ids.length > 5000) throw new DriveCoreRepositoryError("Túl sok dokumentum függőségvizsgálata lett kérve.", "DRIVE_DOCUMENT_DEPENDENCY_LIMIT", 400);

  const client = getDatabaseClient();
  const [attachmentResult, formalIssueResult, documentResult, boxItemResult, compareResult, entityLinkResult] = await Promise.all([
    client.from("project_issue_attachments")
      .select("id,issue_id,drive_document_id,relation_type,attachment_kind")
      .eq("project_id", projectId)
      .in("drive_document_id", ids)
      .is("deleted_at", null)
      .limit(5000),
    client.from("drive_core_document_issues")
      .select("id,document_id,issue_number,status,purpose")
      .eq("project_id", projectId)
      .in("document_id", ids)
      .eq("status", "ISSUED")
      .limit(5000),
    client.from("drive_core_documents")
      .select("id,name")
      .eq("project_id", projectId)
      .in("id", ids)
      .limit(5000),
    client.from("drive_core_box_items")
      .select("id,box_id,document_id,version_id")
      .eq("project_id", projectId)
      .in("document_id", ids)
      .limit(5000),
    client.from("drive_core_compare_findings")
      .select("id,left_document_id,right_document_id,zone_label,status,priority")
      .eq("project_id", projectId)
      .is("deleted_at", null)
      .or(`left_document_id.in.(${ids.join(",")}),right_document_id.in.(${ids.join(",")})`)
      .limit(5000),
    client.from("project_core_entity_links")
      .select("id,source_type,source_id,target_type,target_id,relation_type")
      .eq("project_id", projectId)
      .or(`and(source_type.in.(document,drive_document),source_id.in.(${ids.join(",")})),and(target_type.in.(document,drive_document),target_id.in.(${ids.join(",")}))`)
      .limit(5000),
  ]);

  if (attachmentResult.error) dbError("A dokumentum hibajegy-kapcsolatai nem tölthetők be.", attachmentResult.error);
  if (formalIssueResult.error) dbError("A dokumentum formális kiadási kapcsolatai nem tölthetők be.", formalIssueResult.error);
  if (documentResult.error) dbError("A kapcsolt dokumentumok neve nem tölthető be.", documentResult.error);
  if (boxItemResult.error) dbError("A CsomagBOX kapcsolatok nem tölthetők be.", boxItemResult.error);
  if (compareResult.error) dbError("A Compare kapcsolatok nem tölthetők be.", compareResult.error);
  if (entityLinkResult.error) dbError("A projektkapcsolatok nem tölthetők be.", entityLinkResult.error);
  const documentNameById = new Map((documentResult.data || []).map((row) => [String(row.id), String(row.name || "Dokumentum")]));

  const attachments = (attachmentResult.data || []) as AttachmentRow[];
  const issueIds = [...new Set(attachments.map((row) => row.issue_id).filter(Boolean))];
  let issues: IssueRow[] = [];
  if (issueIds.length) {
    const issueResult = await client.from("project_core_issues")
      .select("id,serial,title,status,deleted_at")
      .eq("project_id", projectId)
      .in("id", issueIds)
      .limit(5000);
    if (issueResult.error) dbError("A kapcsolódó hibajegyek adatai nem tölthetők be.", issueResult.error);
    issues = (issueResult.data || []) as IssueRow[];
  }
  const issueById = new Map(issues.map((issue) => [issue.id, issue]));
  const boxItems = (boxItemResult.data || []) as BoxItemRow[];
  const boxIds = [...new Set(boxItems.map((item) => item.box_id).filter(Boolean))];
  let boxes: BoxRow[] = [];
  if (boxIds.length) {
    const boxResult = await client.from("drive_core_boxes")
      .select("id,name,purpose,status,lifecycle_status")
      .eq("project_id", projectId)
      .in("id", boxIds)
      .eq("status", "ACTIVE")
      .limit(5000);
    if (boxResult.error) dbError("A kapcsolódó CsomagBOX-ok adatai nem tölthetők be.", boxResult.error);
    boxes = (boxResult.data || []) as BoxRow[];
  }
  const boxById = new Map(boxes.map((box) => [box.id, box]));
  const dependencies: DriveDeleteDependency[] = [];

  for (const attachment of attachments) {
    const issue = issueById.get(attachment.issue_id);
    dependencies.push({
      id: `project-issue:${attachment.id}`,
      documentId: attachment.drive_document_id,
      kind: "PROJECT_ISSUE",
      reference: issue?.serial || attachment.issue_id,
      title: issue?.title || "Kapcsolódó hibajegy / projektügy",
      status: issue?.deleted_at ? "ARCHIVED" : issue?.status || "UNKNOWN",
      relationType: attachment.relation_type || attachment.attachment_kind || "ATTACHMENT",
      issueId: attachment.issue_id,
      documentName: documentNameById.get(attachment.drive_document_id) || "Dokumentum",
    });
  }

  for (const issue of (formalIssueResult.data || []) as FormalIssueRow[]) {
    dependencies.push({
      id: `formal-issue:${issue.id}`,
      documentId: issue.document_id,
      kind: "FORMAL_ISSUE",
      reference: issue.issue_number || issue.id,
      title: issue.purpose || "Formális dokumentumkiadás",
      status: issue.status || "ISSUED",
      relationType: "FORMAL_ISSUE",
      issueId: issue.id,
      documentName: documentNameById.get(issue.document_id) || "Dokumentum",
    });
  }

  for (const item of boxItems) {
    const box = boxById.get(item.box_id);
    if (!box) continue;
    dependencies.push({
      id: `box:${item.id}`,
      documentId: item.document_id,
      kind: "BOX",
      reference: box.name || box.id,
      title: `CsomagBOX · ${box.purpose || "GENERAL"}`,
      status: box.lifecycle_status || box.status || "ACTIVE",
      relationType: "BOX_ITEM",
      issueId: box.id,
      documentName: documentNameById.get(item.document_id) || "Dokumentum",
    });
  }

  for (const finding of (compareResult.data || []) as CompareFindingRow[]) {
    for (const documentId of [finding.left_document_id, finding.right_document_id]) {
      if (!ids.includes(documentId)) continue;
      const peerId = documentId === finding.left_document_id ? finding.right_document_id : finding.left_document_id;
      dependencies.push({
        id: `compare:${finding.id}:${documentId}`,
        documentId,
        kind: "COMPARE_FINDING",
        reference: finding.zone_label || finding.id,
        title: `Compare Finding · kapcsolt dokumentum: ${documentNameById.get(peerId) || peerId}`,
        status: `${finding.status || "REVIEW"} · ${finding.priority || "MEDIUM"}`,
        relationType: "COMPARE_FINDING",
        issueId: finding.id,
        documentName: documentNameById.get(documentId) || "Dokumentum",
      });
    }
  }

  for (const link of (entityLinkResult.data || []) as EntityLinkRow[]) {
    const sourceIsDocument = ["document", "drive_document"].includes(link.source_type);
    const documentId = sourceIsDocument ? link.source_id : link.target_id;
    if (!ids.includes(documentId)) continue;
    const otherType = sourceIsDocument ? link.target_type : link.source_type;
    const otherId = sourceIsDocument ? link.target_id : link.source_id;
    dependencies.push({
      id: `entity-link:${link.id}`,
      documentId,
      kind: "ENTITY_LINK",
      reference: `${otherType}:${otherId}`,
      title: "Projektkapcsolat",
      status: "ACTIVE",
      relationType: link.relation_type || "RELATES_TO",
      issueId: link.id,
      documentName: documentNameById.get(documentId) || "Dokumentum",
    });
  }

  return dependencies.sort((a, b) => a.documentId.localeCompare(b.documentId) || a.kind.localeCompare(b.kind) || a.reference.localeCompare(b.reference));
}

export async function listDriveFolderDocumentIds(projectId: string, rootFolderId: string) {
  const client = getDatabaseClient();
  const [folderResult, documentResult] = await Promise.all([
    client.from("drive_core_folders").select("id,parent_id,status").eq("project_id", projectId).limit(10000),
    client.from("drive_core_documents").select("id,folder_id,status").eq("project_id", projectId).neq("status", "DELETED").limit(20000),
  ]);
  if (folderResult.error) dbError("A mappafa nem tölthető be a függőségvizsgálathoz.", folderResult.error);
  if (documentResult.error) dbError("A dokumentumlista nem tölthető be a függőségvizsgálathoz.", documentResult.error);

  const folders = (folderResult.data || []) as FolderRow[];
  const documents = (documentResult.data || []) as DocumentRow[];
  const childMap = new Map<string, string[]>();
  for (const folder of folders) {
    if (folder.status !== "ACTIVE" || !folder.parent_id) continue;
    const list = childMap.get(folder.parent_id) || [];
    list.push(folder.id);
    childMap.set(folder.parent_id, list);
  }
  const folderIds = new Set<string>();
  const stack = [rootFolderId];
  while (stack.length) {
    const id = stack.pop()!;
    if (folderIds.has(id)) continue;
    folderIds.add(id);
    for (const childId of childMap.get(id) || []) stack.push(childId);
  }
  return documents.filter((document) => folderIds.has(document.folder_id)).map((document) => document.id);
}
