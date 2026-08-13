"use client";

import Image from "next/image";
import { X } from "lucide-react";
import { getBenjadminPerson, type BenjadminPersonCode } from "./benjadminPeople";
import styles from "./BenjadminPersonProfileCard.module.css";

export default function BenjadminPersonProfileCard({ code, onClose }: { code: BenjadminPersonCode; onClose: () => void }) {
  const person = getBenjadminPerson(code);
  return (
    <div className={styles.layer} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className={styles.card} role="dialog" aria-modal="true" aria-label={`${person.name} munkaköri profil`} data-testid="benjadmin-person-profile-card" data-person-code={person.code}>
        <button type="button" className={styles.close} onClick={onClose} aria-label="Profil bezárása" data-testid="benjadmin-person-profile-close"><X size={18} /></button>
        <div className={styles.visual}>
          <Image src={person.image} alt={`${person.name} hexagon avatár`} width={560} height={560} priority />
          <span>{person.category}</span>
        </div>
        <div className={styles.copy}>
          <header>
            <span>{person.code}</span>
            <h2>{person.name}{person.personalName ? <small> · {person.personalName}</small> : null}</h2>
            <p>{person.title}</p>
          </header>
          <strong>{person.shortDescription}</strong>
          <p>{person.detailedDescription}</p>
          <div className={styles.responsibilities}>
            <span>FŐ FELADATKÖRÖK</span>
            <ul>{person.responsibilities.map((item) => <li key={item}>{item}</li>)}</ul>
          </div>
        </div>
      </section>
    </div>
  );
}
