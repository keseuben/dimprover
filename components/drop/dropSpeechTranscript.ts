export type DropSpeechRecognitionEventLike = {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: {
      isFinal: boolean;
      [index: number]: { transcript: string };
    };
  };
};

type SpeechSlot = { text: string; isFinal: boolean };

function cleanTranscript(value: unknown) {
  return String(value ?? "").normalize("NFKC").replace(/\s+/g, " ").trim();
}

function comparableWord(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("hu-HU")
    .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
}

/**
 * Egymásba épülő SpeechRecognition részmondatok összeillesztése.
 * Csak a szomszédos recognition blokkok közötti átfedést szedi ki;
 * az egy blokkon belül ténylegesen kimondott szóismétlést nem módosítja.
 */
export function mergeDropSpeechTranscriptParts(parts: string[]) {
  const output: string[] = [];
  for (const rawPart of parts) {
    const words = cleanTranscript(rawPart).split(" ").filter(Boolean);
    if (!words.length) continue;
    if (!output.length) {
      output.push(...words);
      continue;
    }
    const maxOverlap = Math.min(output.length, words.length);
    let overlap = 0;
    for (let size = maxOverlap; size >= 1; size -= 1) {
      let matches = true;
      for (let index = 0; index < size; index += 1) {
        if (comparableWord(output[output.length - size + index]) !== comparableWord(words[index])) {
          matches = false;
          break;
        }
      }
      if (matches) {
        overlap = size;
        break;
      }
    }
    output.push(...words.slice(overlap));
  }
  return cleanTranscript(output.join(" "));
}


const SPOKEN_PUNCTUATION: Record<string, string> = {
  pont: ".",
  vesszo: ",",
  felkialtojel: "!",
  kerdojel: "?",
};

function spokenKey(value: string) {
  return comparableWord(value);
}

function uppercaseSentenceStart(value: string) {
  return value.replace(/(^|[.!?]\s+)([\p{Ll}\p{L}])/gu, (match, prefix: string, letter: string) => `${prefix}${letter.toLocaleUpperCase("hu-HU")}`);
}

/**
 * DIMPRO diktálási szabályok, AI nélkül:
 * - mondat eleje nagybetű;
 * - kimondott pont/vessző/felkiáltójel/kérdőjel írásjellé válik;
 * - "szó szerint <írásjelnév>" esetén a szó változatlanul marad;
 * - írásjel előtt nincs szóköz, utána egy szóköz van;
 * - . ! ? után a következő mondat nagybetűvel indul.
 */
export function formatDropSpeechTranscript(value: string) {
  const words = cleanTranscript(value).split(" ").filter(Boolean);
  const output: string[] = [];
  let literalNext = false;

  for (let index = 0; index < words.length; index += 1) {
    const current = words[index];
    const key = spokenKey(current);
    const nextKey = spokenKey(words[index + 1] || "");

    if (key === "szo" && nextKey === "szerint") {
      literalNext = true;
      index += 1;
      continue;
    }

    // A böngésző külön szóként is visszaadhatja: "felkiáltó jel", "kérdő jel".
    const compoundKey = (key === "felkialto" || key === "kerdo") && nextKey === "jel" ? `${key}jel` : key;
    const punctuation = SPOKEN_PUNCTUATION[compoundKey];
    if (punctuation && !literalNext) {
      output.push(punctuation);
      if (compoundKey !== key) index += 1;
      continue;
    }

    if (literalNext) {
      if ((key === "felkialto" || key === "kerdo") && nextKey === "jel") {
        output.push(`${current} ${words[index + 1]}`);
        index += 1;
      } else {
        output.push(current);
      }
      literalNext = false;
      continue;
    }

    output.push(current);
  }

  let text = output.join(" ")
    .replace(/\s+([,.!?])/g, "$1")
    .replace(/([,.!?])(?=[\p{L}\p{N}])/gu, "$1 ")
    .replace(/\s+/g, " ")
    .trim();
  text = uppercaseSentenceStart(text);
  return text;
}

/**
 * A Web Speech API resultIndex/eredménypozíció modelljét követi.
 * Ugyanaz a result slot módosuláskor felülíródik, nem appendelődik.
 */
export class DropSpeechTranscriptAccumulator {
  private slots = new Map<number, SpeechSlot>();

  reset() {
    this.slots.clear();
  }

  update(event: DropSpeechRecognitionEventLike) {
    const firstChanged = Math.max(0, Number(event.resultIndex) || 0);
    for (let index = firstChanged; index < event.results.length; index += 1) {
      const result = event.results[index];
      const text = cleanTranscript(result?.[0]?.transcript);
      if (text) this.slots.set(index, { text, isFinal: Boolean(result?.isFinal) });
      else this.slots.delete(index);
    }
    for (const index of Array.from(this.slots.keys())) {
      if (index >= event.results.length) this.slots.delete(index);
    }
    return this.getText();
  }

  getText() {
    return formatDropSpeechTranscript(mergeDropSpeechTranscriptParts(
      Array.from(this.slots.entries())
        .sort(([left], [right]) => left - right)
        .map(([, slot]) => slot.text),
    ));
  }
}
