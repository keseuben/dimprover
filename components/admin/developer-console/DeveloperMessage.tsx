"use client";

import { AlertTriangle, BadgeCheck, Check, CheckCircle2, ClipboardCopy, GitCommitHorizontal, Hammer, ListChecks, MessageSquareText, ShieldAlert, Sparkles } from "lucide-react";
import { useState } from "react";
import BenjadminAvatar, { memberName } from "./BenjadminAvatar";
import type { ConsoleMessage } from "./types";
import styles from "./DeveloperConsole.module.css";

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--:--:--";
  return new Intl.DateTimeFormat("hu-HU", { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(date);
}

function kindLabel(kind: ConsoleMessage["kind"]) {
  const labels: Record<ConsoleMessage["kind"], string> = {
    MESSAGE: "ÜZENET",
    INSTRUCTION: "UTASÍTÁS",
    TASK_ASSIGNMENT: "FELADATKIOSZTÁS",
    TASK_UPDATE: "FELADATÁLLAPOT",
    DECISION: "VEZETŐI DÖNTÉS",
    APPROVAL_REQUEST: "JÓVÁHAGYÁS SZÜKSÉGES",
    BUILD_EVENT: "BUILD",
    TEST_RESULT: "TESZT",
    ERROR: "HIBA",
    WARNING: "FIGYELMEZTETÉS",
    COMMIT: "COMMIT",
    RELEASE: "KIADÁS / ÁTADÁS",
    SYSTEM: "RENDSZER",
  };
  return labels[kind];
}

function KindIcon({ kind }: { kind: ConsoleMessage["kind"] }) {
  if (kind === "ERROR") return <ShieldAlert size={13} />;
  if (kind === "WARNING" || kind === "APPROVAL_REQUEST") return <AlertTriangle size={13} />;
  if (kind === "BUILD_EVENT") return <Hammer size={13} />;
  if (kind === "TEST_RESULT") return <ListChecks size={13} />;
  if (kind === "COMMIT") return <GitCommitHorizontal size={13} />;
  if (kind === "RELEASE") return <BadgeCheck size={13} />;
  if (kind === "TASK_ASSIGNMENT" || kind === "TASK_UPDATE") return <CheckCircle2 size={13} />;
  if (kind === "INSTRUCTION" || kind === "DECISION") return <Sparkles size={13} />;
  return <MessageSquareText size={13} />;
}

function statusFor(message: ConsoleMessage): "working" | "waiting" | "decision" | "blocked" | "idle" {
  if (message.level === "error" || message.kind === "ERROR") return "blocked";
  if (message.kind === "APPROVAL_REQUEST" || message.level === "warning") return "decision";
  if (["TASK_UPDATE", "BUILD_EVENT", "TEST_RESULT"].includes(message.kind)) return "working";
  if (message.author === "BENAI") return "waiting";
  return "idle";
}

export default function DeveloperMessage({ message }: { message: ConsoleMessage }) {
  const [copied, setCopied] = useState(false);
  const handoffPrompt = typeof message.metadata?.handoffPrompt === "string" ? message.metadata.handoffPrompt : "";
  async function copyHandoff() {
    if (!handoffPrompt) return;
    await navigator.clipboard.writeText(handoffPrompt);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }
  const side = message.author === "ARMINAI" ? "left" : message.author === "JAZMINAI" ? "right" : "center";
  const isOwner = message.author === "BENJADMIN";
  const isSystem = message.author === "SYSTEM";
  return (
    <article
      className={`${styles.messageRow} ${styles[`message_${side}`]} ${isOwner ? styles.messageOwner : ""} ${isSystem ? styles.messageSystem : ""} ${styles[`level_${message.level}`]}`}
      data-message-id={message.id}
    >
      <div className={styles.messageCard}>
        <header className={styles.messageHeader}>
          <div className={styles.messageIdentity}>
            {side !== "right" ? <BenjadminAvatar member={message.author} size={isOwner ? "task" : "chat"} status={statusFor(message)} /> : null}
            <div>
              <strong>{memberName(message.author)}{isOwner ? " · VEZETŐ" : ""}</strong>
              <span><KindIcon kind={message.kind} /> {kindLabel(message.kind)}</span>
            </div>
            {side === "right" ? <BenjadminAvatar member={message.author} size="chat" status={statusFor(message)} /> : null}
          </div>
          <time dateTime={message.createdAt}>{formatTime(message.createdAt)}</time>
        </header>
        <div className={styles.messageBody}>{message.summary || "—"}</div>
        {message.detail ? <p className={styles.messageDetail}>{message.detail}</p> : null}
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
