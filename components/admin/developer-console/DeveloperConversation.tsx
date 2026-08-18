"use client";

import { Archive, ArrowDown, ArrowRightLeft, CalendarDays, ChevronDown, ChevronRight, LoaderCircle, MessagesSquare } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import DeveloperMessage from "./DeveloperMessage";
import WeeklyDevelopmentSummary from "./WeeklyDevelopmentSummary";
import type { ConsoleMessage, LiveWorkerTransition, WeeklyDevelopmentSummary as WeeklySummary } from "./types";
import styles from "./DeveloperConsole.module.css";

function dayKey(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "invalid";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function mondayKey(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "invalid";
  date.setHours(0, 0, 0, 0);
  const shift = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - shift);
  return dayKey(date.toISOString());
}

function humanDay(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return new Intl.DateTimeFormat("hu-HU", { year: "numeric", month: "2-digit", day: "2-digit", weekday: "short" }).format(date);
}

function weekLabel(key: string) {
  const start = new Date(`${key}T12:00:00`);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  const short = (date: Date) => new Intl.DateTimeFormat("hu-HU", { month: "2-digit", day: "2-digit" }).format(date);
  return `${start.getFullYear()}. ${short(start)}–${short(end)}`;
}

function collapseRepeatedMessages(items: ConsoleMessage[]) {
  const result: ConsoleMessage[] = [];
  const collapsible = new Set<ConsoleMessage["kind"]>(["TASK_UPDATE", "SYSTEM", "CODE_ACTIVITY", "TERMINAL_ACTIVITY"]);
  for (const message of items) {
    const previous = result.at(-1);
    const previousAt = previous ? new Date(previous.createdAt).getTime() : 0;
    const currentAt = new Date(message.createdAt).getTime();
    const same = previous
      && collapsible.has(message.kind)
      && previous.author === message.author
      && previous.kind === message.kind
      && previous.summary.trim() === message.summary.trim()
      && previous.detail.trim() === message.detail.trim()
      && previous.taskId === message.taskId
      && String(previous.metadata?.mainModule || "") === String(message.metadata?.mainModule || "")
      && String(previous.metadata?.moduleName || "") === String(message.metadata?.moduleName || "")
      && String(previous.metadata?.submoduleName || "") === String(message.metadata?.submoduleName || "")
      && String(previous.metadata?.workItem || "") === String(message.metadata?.workItem || "")
      && String(previous.metadata?.presenceKey || "") === String(message.metadata?.presenceKey || "")
      && Number.isFinite(previousAt)
      && Number.isFinite(currentAt)
      && currentAt - previousAt <= 30 * 60_000;
    if (!same || !previous) {
      result.push(message);
      continue;
    }
    const repeatCount = Math.max(1, Number(previous.metadata?.repeatCount || 1)) + 1;
    result[result.length - 1] = {
      ...previous,
      id: `${previous.id}:repeat:${repeatCount}`,
      createdAt: message.createdAt,
      metadata: { ...previous.metadata, repeatCount, repeatedUntil: message.createdAt },
    };
  }
  return result;
}

type ArchiveGroup = { key: string; label: string; type: "day" | "week"; messages: ConsoleMessage[] };

export default function DeveloperConversation({ messages, selectedProjectId, workerTransitions = [], hasOlder = false, loadingOlder = false, onLoadOlder, onOpenWeeklyContext }: {
  messages: ConsoleMessage[];
  selectedProjectId: string;
  workerTransitions?: LiveWorkerTransition[];
  hasOlder?: boolean;
  loadingOlder?: boolean;
  onLoadOlder?: () => Promise<void>;
  onOpenWeeklyContext?: (context: WeeklySummary["contexts"][number], weekKey: string) => void;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const nearBottom = useRef(true);
  const previousCount = useRef(0);
  const [unseen, setUnseen] = useState(0);
  const [expandedArchives, setExpandedArchives] = useState<Set<string>>(() => new Set());
  const [showEarlierArchive, setShowEarlierArchive] = useState(false);

  const visible = useMemo(() => messages.filter((message) => {
    if (!selectedProjectId) return true;
    return !message.projectId || message.projectId === selectedProjectId;
  }), [messages, selectedProjectId]);

  const visibleTransitions = useMemo(() => workerTransitions
    .filter((transition) => !selectedProjectId || !transition.projectId || transition.projectId === selectedProjectId)
    .sort((a, b) => b.changedAt.localeCompare(a.changedAt))
    .slice(0, 4), [selectedProjectId, workerTransitions]);

  const archive = useMemo(() => {
    const now = new Date();
    const today = dayKey(now.toISOString());
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const chronological = [...visible].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const current: ConsoleMessage[] = [];
    const recent: ConsoleMessage[] = [];
    const earlier: ConsoleMessage[] = [];
    for (const message of chronological) {
      if (dayKey(message.createdAt) === today) {
        current.push(message);
        continue;
      }
      const created = new Date(message.createdAt);
      const ageDays = Math.max(1, Math.floor((todayStart - new Date(created.getFullYear(), created.getMonth(), created.getDate()).getTime()) / 86400000));
      if (ageDays <= 7) recent.push(message); else earlier.push(message);
    }

    const makeGroups = (items: ConsoleMessage[], mode: "day" | "week") => {
      const groups = new Map<string, ArchiveGroup>();
      for (const message of items) {
        const created = new Date(message.createdAt);
        const ageDays = Math.max(1, Math.floor((todayStart - new Date(created.getFullYear(), created.getMonth(), created.getDate()).getTime()) / 86400000));
        const key = mode === "week" ? `week:${mondayKey(message.createdAt)}` : `day:${dayKey(message.createdAt)}`;
        const label = mode === "week" ? `Hét · ${weekLabel(mondayKey(message.createdAt))}` : `${ageDays === 1 ? "Tegnap · " : ""}${humanDay(message.createdAt)}`;
        const existing = groups.get(key) || { key, label, type: mode, messages: [] };
        existing.messages.push(message);
        groups.set(key, existing);
      }
      return [...groups.values()]
        .map((group) => ({ ...group, messages: collapseRepeatedMessages(group.messages.sort((a, b) => a.createdAt.localeCompare(b.createdAt))) }))
        .sort((a, b) => (a.messages[0]?.createdAt || "").localeCompare(b.messages[0]?.createdAt || ""));
    };

    const recentGroups = makeGroups(recent, "day");
    const earlierGroups = makeGroups(earlier, "week");
    return {
      today: collapseRepeatedMessages(current),
      groups: showEarlierArchive ? [...earlierGroups, ...recentGroups] : recentGroups,
      recentCount: recent.length,
      earlierCount: earlier.length,
      rawOlderCount: recent.length + earlier.length,
    };
  }, [showEarlierArchive, visible]);

  useEffect(() => {
    const delta = Math.max(0, visible.length - previousCount.current);
    previousCount.current = visible.length;
    if (!delta) return;
    const element = scroller.current;
    if (!element) return;
    if (nearBottom.current) {
      window.requestAnimationFrame(() => element.scrollTo({ top: element.scrollHeight, behavior: previousCount.current > delta ? "smooth" : "auto" }));
      setUnseen(0);
    } else {
      setUnseen((value) => value + delta);
    }
  }, [visible.length]);

  function onScroll() {
    const element = scroller.current;
    if (!element) return;
    nearBottom.current = element.scrollHeight - element.scrollTop - element.clientHeight < 120;
    if (nearBottom.current) setUnseen(0);
  }

  function jumpToLatest() {
    const element = scroller.current;
    if (!element) return;
    nearBottom.current = true;
    setUnseen(0);
    element.scrollTo({ top: element.scrollHeight, behavior: "smooth" });
  }

  async function revealEarlierArchive() {
    setShowEarlierArchive(true);
    if (hasOlder) await onLoadOlder?.();
  }

  function toggleArchive(key: string) {
    setExpandedArchives((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  return (
    <section className={styles.conversation} aria-label="BENJADMIN közös fejlesztői beszélgetés">
      <div className={styles.conversationTitle}>
        <div><MessagesSquare size={17} /><span>KÖZÖS FEJLESZTŐI CSEVEGÉS</span></div>
        <small>Ma {archive.today.length} · elmúlt 7 nap {archive.recentCount} · korábbi {archive.earlierCount}{hasOlder ? "+" : ""}</small>
      </div>
      <WeeklyDevelopmentSummary selectedProjectId={selectedProjectId} onOpenContext={onOpenWeeklyContext} />
      <div className={styles.conversationScroller} ref={scroller} onScroll={onScroll}>
        {visibleTransitions.length ? <section className={styles.conversationTransitions} data-testid="benjadmin-worker-transition-strip">
          <header><ArrowRightLeft size={12} /><strong>LEGUTÓBBI WORKER-ÁTADÁSOK</strong><span>{visibleTransitions.length}</span></header>
          <div>{visibleTransitions.map((transition) => <article key={transition.id} data-transition-reason={transition.reason}>
            <strong>{transition.fromWorkerCode} <ArrowRightLeft size={10} /> {transition.toWorkerCode}</strong>
            <span>{transition.mainModule} › {transition.moduleName} › {transition.submoduleName}</span>
            <small>{transition.workItem}</small>
          </article>)}</div>
        </section> : null}
        {(archive.groups.length || archive.earlierCount || hasOlder) ? (
          <section className={styles.conversationArchive} aria-label="Korábbi fejlesztői csevegések" data-testid="benjadmin-conversation-archive" data-show-earlier={showEarlierArchive ? "true" : "false"}>
            <header><Archive size={14} /><strong>{showEarlierArchive ? "ARCHÍVUM" : "ELMÚLT 7 NAP"}</strong><span>Időrendi sorrend · a legfrissebb esemény legalul.</span></header>
            {archive.groups.map((group) => {
              const expanded = expandedArchives.has(group.key);
              return <section key={group.key} className={styles.archiveGroup} data-archive-key={group.key} data-expanded={expanded ? "true" : "false"}>
                <button type="button" className={styles.archiveGroupButton} data-archive-toggle={group.key} onClick={() => toggleArchive(group.key)}>
                  {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  <CalendarDays size={13} />
                  <strong>{group.label}</strong>
                  <span>{group.messages.length} kártya</span>
                </button>
                {expanded ? <div className={styles.archiveGroupMessages}>{group.messages.map((message) => <DeveloperMessage key={message.id} message={message} />)}</div> : null}
              </section>;
            })}
            {!showEarlierArchive && (archive.earlierCount > 0 || hasOlder) ? <button type="button" className={styles.archiveLoadMore} data-testid="benjadmin-archive-show-earlier" disabled={loadingOlder} onClick={() => void revealEarlierArchive()}>{loadingOlder ? <LoaderCircle size={14} className={styles.spin} /> : <Archive size={14} />} {loadingOlder ? "Korábbi archívum megnyitása…" : "Korábbi archívum megjelenítése"}</button> : null}
            {showEarlierArchive && hasOlder ? <button type="button" className={styles.archiveLoadMore} data-testid="benjadmin-archive-load-more" disabled={loadingOlder} onClick={() => void onLoadOlder?.()}>{loadingOlder ? <LoaderCircle size={14} className={styles.spin} /> : <Archive size={14} />} {loadingOlder ? "Korábbi archívum betöltése…" : "További korábbi archívum betöltése"}</button> : null}
          </section>
        ) : null}
        {archive.today.length ? archive.today.map((message) => <DeveloperMessage key={message.id} message={message} />) : (!archive.groups.length ? (
          <div className={styles.emptyConversation}><MessagesSquare size={28} /><strong>Még nincs megjeleníthető fejlesztési esemény.</strong><span>Az új BENJADMIN utasítások és a worker kódolási események itt jelennek meg.</span></div>
        ) : <div className={styles.todayEmpty}>Ma még nincs új fejlesztési kártya.</div>)}
      </div>
      {unseen > 0 ? <button type="button" className={styles.unseenButton} onClick={jumpToLatest}><ArrowDown size={15} /> {unseen} új esemény</button> : null}
    </section>
  );
}
