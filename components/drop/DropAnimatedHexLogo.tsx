"use client";

import { useId } from "react";
import styles from "./DropAnimatedHexLogo.module.css";

type Props = {
  className?: string;
  variant?: "hero" | "compact";
  tone?: "dark" | "light";
  active?: boolean;
  label?: string;
};

export default function DropAnimatedHexLogo({
  className = "",
  variant = "hero",
  tone = "dark",
  active = false,
  label = "DIMPRO Drop fájlfeltöltési embléma",
}: Props) {
  const rawId = useId();
  const id = rawId.replace(/[^a-zA-Z0-9_-]/g, "");
  const outerGradientId = `drop-outer-${id}`;
  const panelGradientId = `drop-panel-${id}`;
  const accentGradientId = `drop-accent-${id}`;
  const glowId = `drop-glow-${id}`;

  return (
    <span
      className={`${styles.root} ${styles[variant]} ${styles[tone]} ${active ? styles.active : ""} ${className}`.trim()}
      role="img"
      aria-label={label}
    >
      <svg className={styles.svg} viewBox="0 0 320 320" aria-hidden="true" focusable="false">
        <defs>
          <linearGradient id={outerGradientId} x1="50" y1="35" x2="275" y2="285" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="var(--drop-accent-soft)" />
            <stop offset="0.55" stopColor="var(--drop-accent)" />
            <stop offset="1" stopColor="var(--drop-accent-strong)" />
          </linearGradient>
          <linearGradient id={panelGradientId} x1="90" y1="55" x2="235" y2="275" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="var(--drop-panel-top)" />
            <stop offset="1" stopColor="var(--drop-panel-bottom)" />
          </linearGradient>
          <linearGradient id={accentGradientId} x1="130" y1="75" x2="190" y2="250" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="var(--drop-highlight)" />
            <stop offset="0.62" stopColor="var(--drop-accent)" />
            <stop offset="1" stopColor="var(--drop-accent-strong)" />
          </linearGradient>
          <filter id={glowId} x="-55%" y="-55%" width="210%" height="210%">
            <feGaussianBlur stdDeviation="5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <polygon
          className={styles.outerHex}
          points="85,30 235,30 310,160 235,290 85,290 10,160"
          fill={`url(#${outerGradientId})`}
        />
        <polygon
          className={styles.innerHex}
          points="89,41 231,41 298,160 231,279 89,279 22,160"
          fill={`url(#${panelGradientId})`}
        />
        <polygon
          className={styles.guideHex}
          points="96,52 224,52 286,160 224,268 96,268 34,160"
        />

        <g className={styles.fileGroup} filter={`url(#${glowId})`}>
          <path
            className={styles.fileShape}
            d="M116 67H184L211 94V132H116V67Z"
            fill="var(--drop-file-fill)"
            stroke={`url(#${accentGradientId})`}
            strokeWidth="5"
            strokeLinejoin="round"
          />
          <path
            className={styles.fileFold}
            d="M184 67V94H211"
            fill="none"
            stroke="var(--drop-highlight)"
            strokeWidth="5"
            strokeLinejoin="round"
          />
          <rect x="129" y="84" width="29" height="5" rx="2.5" fill="var(--drop-file-line)" />
          <rect x="129" y="97" width="43" height="5" rx="2.5" fill="var(--drop-file-line)" />
          <rect x="129" y="110" width="34" height="5" rx="2.5" fill="var(--drop-file-line)" />
        </g>

        <g className={styles.particleGroup} aria-hidden="true">
          <circle className={styles.particle} style={{ animationDelay: "0ms" }} cx="142" cy="139" r="3.2" />
          <circle className={styles.particle} style={{ animationDelay: "190ms" }} cx="160" cy="142" r="2.6" />
          <circle className={styles.particle} style={{ animationDelay: "360ms" }} cx="179" cy="137" r="3" />
          <rect className={styles.particle} style={{ animationDelay: "520ms" }} x="150" y="138" width="5" height="5" rx="1.5" />
          <rect className={styles.particle} style={{ animationDelay: "700ms" }} x="169" y="141" width="4" height="4" rx="1.2" />
          <path className={styles.dataStreak} style={{ animationDelay: "60ms" }} d="M136 139V169" />
          <path className={styles.dataStreak} style={{ animationDelay: "280ms" }} d="M160 141V177" />
          <path className={styles.dataStreak} style={{ animationDelay: "500ms" }} d="M184 138V168" />
        </g>

        <g className={styles.arrowGroup} filter={`url(#${glowId})`}>
          <rect x="150" y="166" width="20" height="35" rx="8" fill={`url(#${accentGradientId})`} />
          <path d="M126 197H194L160 232L126 197Z" fill={`url(#${accentGradientId})`} />
        </g>

        <g className={styles.platformGroup} filter={`url(#${glowId})`}>
          <ellipse className={styles.pulseRing} cx="160" cy="247" rx="31" ry="11" />
          <path
            className={styles.platformTop}
            d="M105 240L126 226H194L215 240L198 255H122L105 240Z"
            fill="var(--drop-platform-top)"
            stroke="var(--drop-accent)"
            strokeWidth="4"
            strokeLinejoin="round"
          />
          <path
            className={styles.platformFront}
            d="M105 240L122 255H198L215 240V258L198 272H122L105 258V240Z"
            fill="var(--drop-platform-front)"
            stroke="var(--drop-accent-strong)"
            strokeWidth="4"
            strokeLinejoin="round"
          />
          <ellipse className={styles.platformCore} cx="160" cy="242" rx="18" ry="6.5" />
        </g>
      </svg>
    </span>
  );
}
