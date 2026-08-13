"use client";

import Image from "next/image";
import { useEffect } from "react";
import { BENJADMIN_PEOPLE, type BenjadminPersonCode } from "./benjadminPeople";

const SHOWCASE_ORDER: BenjadminPersonCode[] = ["BENJADMIN", "BENAI", "ARMINAI", "JAZMINAI", "OUTMINAI", "MFORGE", "VGUARD"];

function PersonCard({ code }: { code: BenjadminPersonCode }) {
  const person = BENJADMIN_PEOPLE[code];
  const displayName = person.personalName ? `${person.name} · ${person.personalName}` : person.name;
  return (
    <article className="benjadmin-team-screen__infra-card" style={{ marginBottom: 12 }}>
      <strong style={{ fontSize: 16 }}>{displayName}</strong>
      <span style={{ display: "block", marginTop: 5, color: "#7ddbea", fontSize: 12, fontWeight: 850, lineHeight: 1.35 }}>{person.title}</span>
      <p style={{ marginTop: 8, color: "#a8c3ce", fontSize: 12.5, lineHeight: 1.5 }}>{person.shortDescription}</p>
    </article>
  );
}

export default function BenjadminTeamShowcaseScreen({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <main className="benjadmin-team-screen admin-theme-dark" data-theme="dark" data-testid="benjadmin-team-showcase">
      <div className="benjadmin-protective__grid" aria-hidden="true" />
      <div className="benjadmin-protective__glow benjadmin-protective__glow--a" aria-hidden="true" />
      <div className="benjadmin-protective__glow benjadmin-protective__glow--b" aria-hidden="true" />

      <header className="benjadmin-team-screen__brand">
        <div className="benjadmin-protective__wordmark"><b className="benjadmin-protective__d">D</b><span>IMPRO BENJADMIN</span></div>
        <p>AI FEJLESZTÉSI CSAPAT · BEMUTATÓ TABLÓ</p>
      </header>

      <section className="benjadmin-team-screen__layout" aria-label="BENJADMIN AI fejlesztési csapat bemutató">
        <aside className="benjadmin-team-screen__side benjadmin-team-screen__side--left">
          {SHOWCASE_ORDER.slice(0, 3).map((code) => <PersonCard key={code} code={code} />)}
        </aside>

        <figure className="benjadmin-team-screen__center">
          <Image
            src="/benjadmin/benjadmin-ai-csapat-tablokep-260813.png"
            alt="DIMPRO BENJADMIN AI fejlesztési csapat tablókép"
            width={1672}
            height={941}
            style={{ width: "100%", height: "auto", objectFit: "contain" }}
            priority
          />
          <figcaption style={{ fontSize: 12.5, lineHeight: 1.45, color: "#91b4c2", textAlign: "center" }}>A DIMPRO fejlesztési munkatere: emberi irányítás, AI koordináció, belső és külső fejlesztői szerepkörök.</figcaption>
        </figure>

        <aside className="benjadmin-team-screen__side benjadmin-team-screen__side--right">
          {SHOWCASE_ORDER.slice(3).map((code) => <PersonCard key={code} code={code} />)}
        </aside>
      </section>

      <button type="button" className="benjadmin-team-screen__shortcut" onClick={onClose}>Ctrl+Alt+9 = bezárás · Esc = bezárás</button>
    </main>
  );
}
