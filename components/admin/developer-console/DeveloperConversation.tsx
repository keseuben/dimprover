"use client";

import { ArrowDown, MessagesSquare } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import DeveloperMessage from "./DeveloperMessage";
import type { ConsoleMessage } from "./types";
import styles from "./DeveloperConsole.module.css";

export default function DeveloperConversation({ messages, selectedProjectId }: { messages: ConsoleMessage[]; selectedProjectId: string }) {
  const scroller = useRef<HTMLDivElement>(null);
  const nearBottom = useRef(true);
  const previousCount = useRef(0);
  const [unseen, setUnseen] = useState(0);

  const visible = useMemo(() => messages.filter((message) => {
    if (message.author === "OUTMINAI") return false;
    if (!selectedProjectId) return true;
    return !message.projectId || message.projectId === selectedProjectId;
  }), [messages, selectedProjectId]);

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

  return (
    <section className={styles.conversation} aria-label="BENJADMIN közös fejlesztői beszélgetés">
      <div className={styles.conversationTitle}>
        <div><MessagesSquare size={17} /><span>KÖZÖS FEJLESZTŐI CSEVEGÉS</span></div>
        <small>Ármin-AI bal · Ben-AI közép · Jázmin-AI jobb · BENJADMIN közép</small>
      </div>
      <div className={styles.conversationScroller} ref={scroller} onScroll={onScroll}>
        {visible.length ? visible.map((message) => <DeveloperMessage key={message.id} message={message} />) : (
          <div className={styles.emptyConversation}><MessagesSquare size={28} /><strong>Még nincs megjeleníthető fejlesztési esemény.</strong><span>Az új BENJADMIN utasítások és a B3/B3.1 munkanapló itt jelennek meg.</span></div>
        )}
      </div>
      {unseen > 0 ? <button type="button" className={styles.unseenButton} onClick={jumpToLatest}><ArrowDown size={15} /> {unseen} új esemény</button> : null}
    </section>
  );
}
