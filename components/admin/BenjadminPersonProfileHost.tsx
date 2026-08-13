"use client";

import { useEffect, useState } from "react";
import BenjadminPersonProfileCard from "./BenjadminPersonProfileCard";
import { BENJADMIN_PEOPLE, type BenjadminPersonCode } from "./benjadminPeople";

export const BENJADMIN_PERSON_PROFILE_EVENT = "benjadmin:person-profile";

export function openBenjadminPersonProfile(code: BenjadminPersonCode) {
  window.dispatchEvent(new CustomEvent(BENJADMIN_PERSON_PROFILE_EVENT, { detail: { code } }));
}

export default function BenjadminPersonProfileHost() {
  const [code, setCode] = useState<BenjadminPersonCode | null>(null);

  useEffect(() => {
    const onOpen = (event: Event) => {
      const custom = event as CustomEvent<{ code?: string }>;
      const next = String(custom.detail?.code || "") as BenjadminPersonCode;
      if (next && Object.prototype.hasOwnProperty.call(BENJADMIN_PEOPLE, next)) setCode(next);
    };
    window.addEventListener(BENJADMIN_PERSON_PROFILE_EVENT, onOpen);
    return () => window.removeEventListener(BENJADMIN_PERSON_PROFILE_EVENT, onOpen);
  }, []);

  return code ? <BenjadminPersonProfileCard code={code} onClose={() => setCode(null)} /> : null;
}
