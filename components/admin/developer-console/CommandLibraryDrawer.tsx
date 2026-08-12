"use client";

import { AlertTriangle, Check, ClipboardCopy, Search, ShieldAlert, X } from "lucide-react";
import { useMemo, useState } from "react";
import { COMMAND_LIBRARY } from "./commandLibrary";
import type { DevelopmentResource, RuntimeContext } from "./types";
import styles from "./DeveloperConsole.module.css";

function currentPrompt(context: RuntimeContext | null, selectedProjectName: string, resources: DevelopmentResource[]) {
  const required = resources.filter((item) => item.requiredBeforeDevelopment && !item.archivedAt);
  const refs = required.length
    ? required.map((item) => `- ${item.title} (${item.originalName}) · ID: ${item.id} · SHA256: ${item.sha256.slice(0, 16)}…`).join("\n")
    : "- Nincs kijelölt kötelező segédanyag.";
  return `FOLYTATÁSI PROMPT – BENJADMIN\n\nAktuális projekt: ${selectedProjectName || "Általános / nincs kiválasztva"}\nKörnyezet: ${context?.environment || "DEV"}\nGit ág: ${context?.branch || "ismeretlen"}\nHEAD: ${context?.commit || "ismeretlen"}\nAktív build: ${context?.buildId || "nincs / ismeretlen"}\nWorktree: ${context?.worktree || "ismeretlen"}\nLegutóbbi termékdokumentum: ${context?.latestProductDoc || "ismeretlen"}\nPRODUCTION alapállapot: ${context?.productionDefault || "READ_ONLY"}\n\nKötelező fejlesztési segédanyagok:\n${refs}\n\nFeladat: folytasd a legutóbbi dokumentált DEV checkpointtól. Először ellenőrizd a státuszt, a párhuzamos módosításokat és a fenti kötelező segédanyagokat. Ha a segédanyaghoz nincs közvetlen hozzáférésed, kérd, hogy csatoljam a ChatGPT csevegőbe. A fejlesztési ciklus: status -> read -> backup -> code -> docs -> tsc -> lint -> targeted acceptance -> build -> DEV restart -> smoke -> responsive acceptance -> commit/handoff. PROD módosítás kizárólag külön explicit jóváhagyással.`;
}

export default function CommandLibraryDrawer({ open, onClose, context, selectedProjectName, resources }: { open: boolean; onClose: () => void; context: RuntimeContext | null; selectedProjectName: string; resources: DevelopmentResource[] }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("Mind");
  const [copied, setCopied] = useState("");
  const categories = useMemo(() => ["Mind", ...Array.from(new Set(COMMAND_LIBRARY.map((item) => item.category)))], []);
  const filtered = useMemo(() => {
    const q = query.trim().toLocaleLowerCase("hu-HU");
    return COMMAND_LIBRARY.filter((item) => (category === "Mind" || item.category === category) && (!q || `${item.title} ${item.description} ${item.text} ${item.tags.join(" ")}`.toLocaleLowerCase("hu-HU").includes(q)));
  }, [category, query]);

  async function copy(id: string, text: string, dangerous = false) {
    if (dangerous && !window.confirm("Ez PROD-jóváhagyási sablon. Csak konkrét, külön megnevezett éles művelethez másolja. Folytatja?")) return;
    await navigator.clipboard.writeText(text);
    setCopied(id);
    window.setTimeout(() => setCopied((current) => current === id ? "" : current), 1800);
  }

  if (!open) return null;
  const dynamicPrompt = currentPrompt(context, selectedProjectName, resources);
  return (
    <div className={styles.drawerLayer} role="presentation">
      <button type="button" className={styles.drawerBackdrop} aria-label="Parancstár bezárása" onClick={onClose} />
      <aside className={`${styles.drawer} ${styles.drawerWide}`} aria-label="ChatGPT Parancstár">
        <header className={styles.drawerHeader}><div><span>CHATGPT PARANCSTÁR</span><strong>Szabályok · indítás · folytatás · átadás</strong></div><button type="button" onClick={onClose} aria-label="Bezárás"><X size={18} /></button></header>
        <div className={styles.drawerBody}>
          <section className={styles.currentPromptCard}>
            <div><span>AKTUÁLIS MUNKAMENET PROMPT</span><strong>{selectedProjectName || "Általános fejlesztés"}</strong><small>{context?.branch || "ág betöltése…"} · {context?.commit || "HEAD…"} · build {context?.buildId || "—"}</small></div>
            <button type="button" onClick={() => void copy("dynamic", dynamicPrompt)}>{copied === "dynamic" ? <Check size={15} /> : <ClipboardCopy size={15} />}{copied === "dynamic" ? "Másolva" : "Teljes folytatási prompt másolása"}</button>
          </section>
          <div className={styles.libraryToolbar}>
            <label><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Keresés a parancsok között…" /></label>
            <div>{categories.map((item) => <button type="button" key={item} className={category === item ? styles.libraryFilterActive : ""} onClick={() => setCategory(item)}>{item}</button>)}</div>
          </div>
          <div className={styles.commandList}>
            {filtered.map((item) => (
              <article key={item.id} className={item.dangerous ? styles.commandDanger : ""}>
                <header><div>{item.dangerous ? <ShieldAlert size={17} /> : <ClipboardCopy size={17} />}<span>{item.category}</span></div>{item.dangerous ? <b><AlertTriangle size={13} /> KÜLÖN PROD JÓVÁHAGYÁS</b> : null}</header>
                <strong>{item.title}</strong>
                <p>{item.description}</p>
                <pre>{item.text}</pre>
                <footer><div>{item.tags.map((tag) => <span key={tag}>{tag}</span>)}</div><button type="button" onClick={() => void copy(item.id, item.text, item.dangerous)}>{copied === item.id ? <Check size={15} /> : <ClipboardCopy size={15} />}{copied === item.id ? "Másolva" : "Másolás"}</button></footer>
              </article>
            ))}
          </div>
        </div>
      </aside>
    </div>
  );
}
