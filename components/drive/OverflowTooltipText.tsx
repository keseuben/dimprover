"use client";

import { useRef, type FocusEvent, type MouseEvent } from "react";
import styles from "./DriveWorkspace.module.css";

type Props = {
  text: string;
  className?: string;
};

export default function OverflowTooltipText({ text, className = "" }: Props) {
  const ref = useRef<HTMLSpanElement>(null);

  function syncTitle(element: HTMLSpanElement | null) {
    if (!element) return;
    const overflowed = element.scrollWidth > element.clientWidth || element.scrollHeight > element.clientHeight;
    if (overflowed) element.setAttribute("title", text);
    else element.removeAttribute("title");
  }

  return (
    <span
      ref={ref}
      className={`${styles.overflowTooltipText} ${className}`.trim()}
      onMouseEnter={(event: MouseEvent<HTMLSpanElement>) => syncTitle(event.currentTarget)}
      onFocus={(event: FocusEvent<HTMLSpanElement>) => syncTitle(event.currentTarget)}
    >
      {text}
    </span>
  );
}
