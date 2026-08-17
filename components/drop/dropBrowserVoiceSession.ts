"use client";

import {
  DropSpeechTranscriptAccumulator,
  formatDropSpeechTranscript,
  mergeDropSpeechTranscriptParts,
  type DropSpeechRecognitionEventLike,
} from "./dropSpeechTranscript";

type BrowserSpeechRecognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: DropSpeechRecognitionEventLike) => void) | null;
  onerror: ((event: Event & { error?: string }) => void) | null;
  onend: (() => void) | null;
};

type BrowserSpeechRecognitionConstructor = new () => BrowserSpeechRecognition;

export type DimproBrowserVoiceState = "listening" | "restarting" | "error";

type Options = {
  language?: string;
  onTranscript?: (text: string) => void;
  onState?: (state: DimproBrowserVoiceState, detail: string) => void;
  onEnd: (result: { text: string; commit: boolean }) => void;
};

function constructorFromWindow() {
  if (typeof window === "undefined") return null;
  const speechWindow = window as Window & {
    SpeechRecognition?: BrowserSpeechRecognitionConstructor;
    webkitSpeechRecognition?: BrowserSpeechRecognitionConstructor;
  };
  return speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition || null;
}

export function dimproBrowserVoiceSupported() {
  return Boolean(constructorFromWindow());
}

export class DimproBrowserVoiceSession {
  private recognition: BrowserSpeechRecognition | null = null;
  private accumulator = new DropSpeechTranscriptAccumulator();
  private completedParts: string[] = [];
  private restartTimer: number | null = null;
  private running = false;
  private commitOnStop = true;
  private ended = false;
  private fatal = false;
  private restartCount = 0;

  constructor(private readonly options: Options) {}

  start() {
    if (this.running || this.ended) return;
    if (!constructorFromWindow()) throw new Error("Ezen a böngészőn nincs támogatott közvetlen beszédfelismerés.");
    this.running = true;
    this.commitOnStop = true;
    this.fatal = false;
    this.launchRecognition();
  }

  stop(commit = true) {
    if (this.ended) return;
    this.commitOnStop = commit;
    this.running = false;
    if (this.restartTimer !== null) window.clearTimeout(this.restartTimer);
    this.restartTimer = null;
    const recognition = this.recognition;
    if (!recognition) {
      this.finish();
      return;
    }
    try {
      recognition.stop();
    } catch {
      this.commitCurrentSegment();
      this.recognition = null;
      this.finish();
    }
  }

  abort() {
    if (this.ended) return;
    this.commitOnStop = false;
    this.running = false;
    if (this.restartTimer !== null) window.clearTimeout(this.restartTimer);
    this.restartTimer = null;
    const recognition = this.recognition;
    this.recognition = null;
    try { recognition?.abort(); } catch {}
    this.finish();
  }

  private currentText() {
    const active = this.accumulator.getText();
    return formatDropSpeechTranscript(mergeDropSpeechTranscriptParts([
      ...this.completedParts,
      ...(active ? [active] : []),
    ]));
  }

  private commitCurrentSegment() {
    const text = this.accumulator.getText();
    if (text) this.completedParts.push(text);
    this.accumulator.reset();
  }

  private launchRecognition() {
    if (!this.running || this.ended) return;
    const Constructor = constructorFromWindow();
    if (!Constructor) {
      this.fatal = true;
      this.running = false;
      this.options.onState?.("error", "A böngésző beszédfelismerője már nem érhető el.");
      this.finish();
      return;
    }

    const recognition = new Constructor();
    recognition.lang = this.options.language || "hu-HU";
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    this.accumulator.reset();
    this.recognition = recognition;

    recognition.onresult = (event) => {
      if (this.recognition !== recognition || this.ended) return;
      this.restartCount = 0;
      const segment = this.accumulator.update(event);
      const text = formatDropSpeechTranscript(mergeDropSpeechTranscriptParts([
        ...this.completedParts,
        ...(segment ? [segment] : []),
      ]));
      this.options.onTranscript?.(text);
      this.options.onState?.("listening", "Beszéd felismerve · a diktálás folytatódik.");
    };

    recognition.onerror = (event) => {
      if (this.recognition !== recognition || this.ended) return;
      const code = String(event.error || "");
      if (code === "aborted") return;
      if (code === "not-allowed" || code === "service-not-allowed" || code === "audio-capture") {
        this.fatal = true;
        this.running = false;
        const detail = code === "not-allowed" || code === "service-not-allowed"
          ? "A mikrofonengedély nincs megadva."
          : "A mikrofon nem érhető el.";
        this.options.onState?.("error", `${detail} A már felismert szöveget megőrizzük.`);
        return;
      }
      const detail = code === "no-speech"
        ? "Rövid csendet érzékeltem · a diktálás automatikusan folytatódik."
        : "A böngésző megszakította a felismerést · DIMPRO automatikusan újraindítja.";
      this.options.onState?.("restarting", detail);
    };

    recognition.onend = () => {
      if (this.recognition !== recognition || this.ended) return;
      this.commitCurrentSegment();
      this.recognition = null;
      if (!this.running || this.fatal) {
        this.finish();
        return;
      }
      this.restartCount += 1;
      const delay = Math.min(1500, 250 + this.restartCount * 150);
      this.options.onState?.("restarting", "A beszédfelismerés újraindul · beszélhet tovább.");
      this.restartTimer = window.setTimeout(() => {
        this.restartTimer = null;
        this.launchRecognition();
      }, delay);
    };

    try {
      recognition.start();
      this.options.onState?.("listening", this.restartCount ? "Diktálás folytatva." : "Hallgatom…");
    } catch (error) {
      this.recognition = null;
      if (!this.running) {
        this.finish();
        return;
      }
      this.restartCount += 1;
      if (this.restartCount > 8) {
        this.fatal = true;
        this.running = false;
        this.options.onState?.("error", error instanceof Error ? error.message : "A beszédfelismerés nem indítható újra.");
        this.finish();
        return;
      }
      const delay = Math.min(1500, 300 + this.restartCount * 150);
      this.options.onState?.("restarting", "A diktálás újracsatlakozik…");
      this.restartTimer = window.setTimeout(() => {
        this.restartTimer = null;
        this.launchRecognition();
      }, delay);
    }
  }

  private finish() {
    if (this.ended) return;
    this.ended = true;
    if (this.restartTimer !== null) window.clearTimeout(this.restartTimer);
    this.restartTimer = null;
    const text = this.currentText();
    this.accumulator.reset();
    this.completedParts = [];
    this.options.onEnd({ text, commit: this.commitOnStop });
  }
}
