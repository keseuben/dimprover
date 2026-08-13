"use client";

import Image from "next/image";
import type { ConsoleAuthor } from "./types";
import styles from "./DeveloperConsole.module.css";
import { openBenjadminPersonProfile } from "../BenjadminPersonProfileHost";

const memberData: Record<Exclude<ConsoleAuthor, "SYSTEM">, { name: string; image: string }> = {
  BENJADMIN: { name: "BenjAdmin", image: "/benjadmin/team/01_BenjAdmin_mod1.png" },
  BENAI: { name: "Ben-AI", image: "/benjadmin/team/02_BenAI.webp" },
  ARMINAI: { name: "Ármin-AI", image: "/benjadmin/team/03_ArminAI.webp" },
  JAZMINAI: { name: "Jázmin-AI", image: "/benjadmin/team/04_JazminAI.webp" },
  OUTMINAI: { name: "Outmin-AI", image: "/benjadmin/team/05_OutminAI.webp" },
  MFORGE: { name: "M.Forge-AI · Márk", image: "/benjadmin/team/06_M_ForgeAI.webp" },
  VGUARD: { name: "V.Guard-AI · Viktória", image: "/benjadmin/team/07_V_GuardAI.webp" },
};

export function memberName(member: ConsoleAuthor) {
  return member === "SYSTEM" ? "Rendszer" : memberData[member].name;
}

export default function BenjadminAvatar({ member, size = "chat", status = "idle", eager = false }: { member: ConsoleAuthor; size?: "chat" | "task" | "head"; status?: "working" | "waiting" | "decision" | "blocked" | "idle"; eager?: boolean }) {
  if (member === "SYSTEM") return <span className={`${styles.systemAvatar} ${styles[`avatar_${size}`]}`} aria-label="Rendszer">D</span>;
  const item = memberData[member];
  return (
    <span className={`${styles.avatarOuter} ${styles[`avatar_${size}`]} ${styles[`status_${status}`]}`} title={`${item.name} · ${status} · profil megnyitása`} role="button" tabIndex={0} onClick={() => openBenjadminPersonProfile(member)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); openBenjadminPersonProfile(member); } }}>
      <span className={styles.avatarInner}>
        <Image src={item.image} alt={`${item.name} avatar`} fill sizes={size === "head" ? "280px" : size === "task" ? "52px" : "58px"} priority={eager || member === "BENJADMIN" || member === "BENAI"} />
      </span>
    </span>
  );
}
