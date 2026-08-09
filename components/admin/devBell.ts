"use client";

export const DEV_RING_STORAGE_KEY = "dimpro-dev-ring-enabled";

function createTone(
  context: AudioContext,
  destination: AudioNode,
  frequency: number,
  startAt: number,
  duration: number,
  strength: number,
  type: OscillatorType,
) {
  const oscillator = context.createOscillator();
  const gain = context.createGain();

  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, startAt);
  oscillator.frequency.exponentialRampToValueAtTime(frequency * 1.015, startAt + duration * 0.35);
  oscillator.frequency.exponentialRampToValueAtTime(frequency * 0.985, startAt + duration);

  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.exponentialRampToValueAtTime(strength, startAt + 0.025);
  gain.gain.setValueAtTime(strength, startAt + duration * 0.55);
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);

  oscillator.connect(gain);
  gain.connect(destination);
  oscillator.start(startAt);
  oscillator.stop(startAt + duration + 0.04);
}

export async function playDimproDevBell() {
  if (typeof window === "undefined") return false;
  const AudioContextClass = window.AudioContext
    || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextClass) return false;

  const context = new AudioContextClass();
  if (context.state === "suspended") await context.resume();

  const compressor = context.createDynamicsCompressor();
  compressor.threshold.setValueAtTime(-18, context.currentTime);
  compressor.knee.setValueAtTime(12, context.currentTime);
  compressor.ratio.setValueAtTime(8, context.currentTime);
  compressor.attack.setValueAtTime(0.003, context.currentTime);
  compressor.release.setValueAtTime(0.18, context.currentTime);

  const master = context.createGain();
  master.gain.setValueAtTime(0.0001, context.currentTime);
  master.connect(compressor);
  compressor.connect(context.destination);

  const start = context.currentTime + 0.06;
  const motif = [
    { frequency: 659.25, duration: 0.24 },
    { frequency: 987.77, duration: 0.24 },
    { frequency: 783.99, duration: 0.24 },
    { frequency: 1174.66, duration: 0.42 },
  ];

  // Mély indítójel: könnyebben észlelhető telefonhangszórón is.
  createTone(context, master, 329.63, start, 0.34, 0.32, "square");
  createTone(context, master, 659.25, start, 0.34, 0.24, "sine");

  let cursor = start + 0.43;
  for (let cycle = 0; cycle < 3; cycle += 1) {
    motif.forEach((note, index) => {
      const accent = index === motif.length - 1 ? 0.34 : 0.29;
      createTone(context, master, note.frequency, cursor, note.duration, accent, "sine");
      createTone(context, master, note.frequency / 2, cursor, note.duration, accent * 0.42, "triangle");
      cursor += note.duration + 0.075;
    });
    cursor += cycle === 1 ? 0.26 : 0.18;
  }

  // Egyedi lezáró kettős jelzés.
  createTone(context, master, 1318.51, cursor, 0.32, 0.34, "sine");
  createTone(context, master, 659.25, cursor, 0.32, 0.20, "square");
  cursor += 0.43;
  createTone(context, master, 1567.98, cursor, 0.58, 0.36, "sine");
  createTone(context, master, 783.99, cursor, 0.58, 0.22, "triangle");

  master.gain.exponentialRampToValueAtTime(0.96, start + 0.025);
  master.gain.setValueAtTime(0.96, cursor + 0.32);
  master.gain.exponentialRampToValueAtTime(0.0001, cursor + 0.72);

  if ("vibrate" in navigator) {
    navigator.vibrate([320, 100, 220, 100, 320, 180, 500]);
  }

  window.setTimeout(() => void context.close(), Math.ceil((cursor - start + 1.3) * 1000));
  return true;
}
