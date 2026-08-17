"use client";

import { AlertTriangle, BadgeCheck, Boxes, Check, CheckCircle2, ClipboardCopy, FileCode2, FileDiff, GitCommitHorizontal, Hammer, Layers3, ListChecks, MessageSquareText, ShieldAlert, Sparkles, TerminalSquare, Wrench } from "lucide-react";
import { useState } from "react";
import BenjadminAvatar, { memberName } from "./BenjadminAvatar";
import type { ConsoleMessage } from "./types";
import styles from "./DeveloperConsole.module.css";

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "----.--.--. --:--:--";
  return new Intl.DateTimeFormat("hu-HU", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(date);
}

function kindLabel(kind: ConsoleMessage["kind"]) {
  const labels: Record<ConsoleMessage["kind"], string> = {
    MESSAGE: "ÜZENET",
    INSTRUCTION: "UTASÍTÁS",
    TASK_ASSIGNMENT: "FELADATKIOSZTÁS",
    TASK_UPDATE: "FELADATÁLLAPOT",
    DECISION: "VEZETŐI DÖNTÉS",
    APPROVAL_REQUEST: "JÓVÁHAGYÁS SZÜKSÉGES",
    CODE_ACTIVITY: "KÓDOLÁS / ELEMZÉS",
    FILE_CHANGE: "FÁJLMÓDOSÍTÁS",
    DIFF: "KÓDDIFF",
    TERMINAL_ACTIVITY: "TERMINÁL AKTIVITÁS",
    BUILD_EVENT: "BUILD",
    TEST_RESULT: "TESZT",
    ERROR: "HIBA",
    WARNING: "FIGYELMEZTETÉS",
    COMMIT: "COMMIT",
    RELEASE: "KIADÁS / ÁTADÁS",
    ARCHIVE_SUMMARY: "ARCHÍV ÖSSZEGZÉS",
    SYSTEM: "RENDSZER",
  };
  return labels[kind];
}

function KindIcon({ kind }: { kind: ConsoleMessage["kind"] }) {
  if (kind === "ERROR") return <ShieldAlert size={13} />;
  if (kind === "WARNING" || kind === "APPROVAL_REQUEST") return <AlertTriangle size={13} />;
  if (kind === "CODE_ACTIVITY" || kind === "FILE_CHANGE") return <FileCode2 size={13} />;
  if (kind === "DIFF") return <FileDiff size={13} />;
  if (kind === "TERMINAL_ACTIVITY") return <TerminalSquare size={13} />;
  if (kind === "BUILD_EVENT") return <Hammer size={13} />;
  if (kind === "TEST_RESULT") return <ListChecks size={13} />;
  if (kind === "COMMIT") return <GitCommitHorizontal size={13} />;
  if (kind === "RELEASE") return <BadgeCheck size={13} />;
  if (kind === "TASK_ASSIGNMENT" || kind === "TASK_UPDATE") return <CheckCircle2 size={13} />;
  if (kind === "INSTRUCTION" || kind === "DECISION" || kind === "ARCHIVE_SUMMARY") return <Sparkles size={13} />;
  return <MessageSquareText size={13} />;
}

function statusFor(message: ConsoleMessage): "working" | "waiting" | "decision" | "blocked" | "idle" {
  if (message.level === "error" || message.kind === "ERROR") return "blocked";
  if (message.kind === "APPROVAL_REQUEST" || message.level === "warning") return "decision";
  if (["TASK_UPDATE", "CODE_ACTIVITY", "FILE_CHANGE", "DIFF", "TERMINAL_ACTIVITY", "BUILD_EVENT", "TEST_RESULT"].includes(message.kind)) return "working";
  if (message.author === "BENAI") return "waiting";
  return "idle";
}

function metadataText(message: ConsoleMessage, key: string) {
  const value = message.metadata?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

export default function DeveloperMessage({ message }: { message: ConsoleMessage }) {
  const [copied, setCopied] = useState(false);
  const handoffPrompt = metadataText(message, "handoffPrompt");
  const filePath = metadataText(message, "filePath");
  const command = metadataText(message, "command");
  const diffSummary = metadataText(message, "diffSummary");
  const repeatCount = Math.max(1, Number(message.metadata?.repeatCount || 1));
  const sanitized = message.metadata?.sanitized === true;
  const mainModule = metadataText(message, "mainModule");
  const moduleName = metadataText(message, "moduleName");
  const submoduleName = metadataText(message, "submoduleName");
  const workItem = metadataText(message, "workItem");
  const activityAction = metadataText(message, "activityAction");
  const activityNarrative = metadataText(message, "activityNarrative");
  const workStageIndex = Math.max(1, Math.min(6, Number(message.metadata?.workStageIndex || 1)));
  const workStageLabel = metadataText(message, "workStageLabel") || "ELEMZÉS / ELŐKÉSZÍTÉS";
  const showWorkContext = Boolean(message.taskId && (mainModule || moduleName || submoduleName || workItem));

  async function copyHandoff() {
    if (!handoffPrompt) return;
    await navigator.clipboard.writeText(handoffPrompt);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  const side = message.author === "ARMINAI" || message.author === "MFORGE" ? "left" : message.author === "JAZMINAI" || message.author === "VGUARD" ? "right" : "center";
  const isOwner = message.author === "BENJADMIN";
  const isSystem = message.author === "SYSTEM";
  return (
    <article
      className={`${styles.messageRow} ${styles[`message_${side}`]} ${isOwner ? styles.messageOwner : ""} ${isSystem ? styles.messageSystem : ""} ${styles[`level_${message.level}`]}`}
      data-message-id={message.id}
      data-author={message.author}
      data-kind={message.kind}
    >
      <div className={styles.messageCard}>
        <header className={styles.messageHeader}>
          <div className={styles.messageIdentity}>
            {side !== "right" ? <BenjadminAvatar member={message.author} size={isOwner ? "task" : "chat"} status={statusFor(message)} /> : null}
            <div>
              <strong>{memberName(message.author)}{isOwner ? " · VEZETŐ" : ""}</strong>
              <span><KindIcon kind={message.kind} /> {kindLabel(message.kind)}{repeatCount > 1 ? <b className={styles.messageRepeatBadge}>×{repeatCount}</b> : null}</span>
            </div>
            {side === "right" ? <BenjadminAvatar member={message.author} size="chat" status={statusFor(message)} /> : null}
          </div>
          <time dateTime={message.createdAt}>{formatDateTime(message.createdAt)}</time>
        </header>
        <div className={styles.messageBody}>{message.summary || "—"}</div>
        {showWorkContext ? (
          <section className={styles.messageWorkContext} data-work-stage={workStageIndex} data-testid="benjadmin-message-work-context">
            <div className={styles.messageContextPath}>
              {mainModule ? <span><Layers3 size={11} /><small>FŐMODUL</small><b>{mainModule}</b></span> : null}
              {moduleName ? <span><Boxes size={11} /><small>MODUL</small><b>{moduleName}</b></span> : null}
              {submoduleName ? <span><FileCode2 size={11} /><small>ALMODUL / FUNKCIÓ</small><b>{submoduleName}</b></span> : null}
            </div>
            <div className={styles.messageStageRow}>
              <strong className={styles.messageStageBadge} data-testid="benjadmin-work-stage">6/{workStageIndex} · {workStageLabel}</strong>
              {activityAction ? <span><Wrench size={12} />{activityAction}</span> : null}
            </div>
            {workItem ? <p className={styles.messageWorkItem}><b>Munkarész:</b> {workItem}</p> : null}
            {activityNarrative ? <p className={styles.messageActivityNarrative}>{activityNarrative}</p> : null}
          </section>
        ) : null}
        {message.detail && !activityNarrative ? <p className={styles.messageDetail}>{message.detail}</p> : null}
        {(filePath || diffSummary || command || sanitized) ? (
          <div className={styles.messageActivityMeta}>
            {filePath ? <span><FileCode2 size={11} /><code>{filePath}</code></span> : null}
            {diffSummary ? <span><FileDiff size={11} />{diffSummary}</span> : null}
            {command ? <span><TerminalSquare size={11} /><code>{command}</code></span> : null}
            {sanitized ? <span className={styles.messageSanitized}><ShieldAlert size={11} />SANITIZED</span> : null}
          </div>
        ) : null}
        {handoffPrompt ? <button type="button" className={styles.messageHandoffButton} onClick={() => void copyHandoff()} title="A feladat ChatGPT/MCP átadó promptjának másolása">{copied ? <Check size={14} /> : <ClipboardCopy size={14} />}<span>{copied ? "Másolva" : "ChatGPT/MCP átadó másolása"}</span></button> : null}
        {message.progressPercent != null ? (
          <div className={styles.messageProgress} aria-label={`Készültség ${message.progressPercent}%`}>
            <span style={{ width: `${Math.max(0, Math.min(100, message.progressPercent))}%` }} />
            <b>{message.progressPercent}%</b>
          </div>
        ) : null}
        {(message.taskId || message.projectId || message.target) ? (
          <footer className={styles.messageMeta}>
            {message.taskId ? <span>Task <code>{message.taskId}</code></span> : null}
            {message.projectId ? <span>Projekt <code>{message.projectId}</code></span> : null}
            {message.target ? <span>Címzett <b>@{message.target === "EVERYONE" ? "Mindenki" : memberName(message.target)}</b></span> : null}
          </footer>
        ) : null}
      </div>
    </article>
  );
}
