"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Bluetooth, CheckCircle2, Keyboard, Radio, Ruler, Send, Smartphone, Unplug, X } from "lucide-react";
import {
  parseSurveyMeasurement,
  type SurveyRoomDimensionTarget,
  type SurveyRoomDimensionSource,
} from "@/components/property-survey/propertySurveyRoomDimensions";
import {
  connectLeicaDisto,
  getBluetoothErrorMessage,
  isWebBluetoothSupported,
  type LeicaDistoConnection,
  type LeicaDistoMeasurement,
} from "@/components/property-survey/bluetooth/leicaDistoBle";

type PropertySurveyMeasurementPanelProps = {
  target: SurveyRoomDimensionTarget | null;
  waiting: boolean;
  lastMeasurement?: { valueMeters: number; target: SurveyRoomDimensionTarget; source: SurveyRoomDimensionSource; deviceName?: string; measuredAt: string } | null;
  onTargetChange: (target: SurveyRoomDimensionTarget) => void;
  onWaitingChange: (waiting: boolean) => void;
  onApply: (target: SurveyRoomDimensionTarget, valueMeters: number, source: SurveyRoomDimensionSource, deviceName?: string) => void;
};

type PairingState = "idle" | "pairing" | "connecting" | "connected" | "disconnected" | "unsupported" | "error";

const targets: Array<{ id: SurveyRoomDimensionTarget; label: string }> = [
  { id: "length", label: "Hossz" },
  { id: "width", label: "Kereszt" },
  { id: "height", label: "Belmagasság" },
];

function targetLabel(target: SurveyRoomDimensionTarget | null) {
  return targets.find((item) => item.id === target)?.label || "Nincs célmező";
}

function formatMeasurement(valueMeters: number, digits = 3) {
  return valueMeters.toFixed(digits).replace(".", ",");
}

export function PropertySurveyMeasurementPanel({
  target,
  waiting,
  lastMeasurement,
  onTargetChange,
  onWaitingChange,
  onApply,
}: PropertySurveyMeasurementPanelProps) {
  const [inputValue, setInputValue] = useState("");
  const [pairedDevice, setPairedDevice] = useState("");
  const [pairingState, setPairingState] = useState<PairingState>("idle");
  const [connectionMessage, setConnectionMessage] = useState("Nincs közvetlen Leica kapcsolat.");
  const [pairingError, setPairingError] = useState("");
  const [lastIncomingValue, setLastIncomingValue] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const connectionRef = useRef<LeicaDistoConnection | null>(null);
  const targetRef = useRef(target);
  const waitingRef = useRef(waiting);
  const pairedDeviceRef = useRef(pairedDevice);
  const onApplyRef = useRef(onApply);
  const onWaitingChangeRef = useRef(onWaitingChange);

  useEffect(() => {
    targetRef.current = target;
    waitingRef.current = waiting;
    pairedDeviceRef.current = pairedDevice;
    onApplyRef.current = onApply;
    onWaitingChangeRef.current = onWaitingChange;
  }, [onApply, onWaitingChange, pairedDevice, target, waiting]);

  const browserBluetoothSupported = useMemo(() => isWebBluetoothSupported(), []);
  const directlyConnected = pairingState === "connected";

  useEffect(() => {
    if (!waiting) return;
    const timer = window.setTimeout(() => inputRef.current?.focus(), 50);
    return () => window.clearTimeout(timer);
  }, [waiting, target]);

  useEffect(() => {
    return () => {
      const connection = connectionRef.current;
      connectionRef.current = null;
      if (connection) void connection.disconnect();
    };
  }, []);

  async function closeCurrentConnection() {
    const connection = connectionRef.current;
    connectionRef.current = null;
    if (connection) await connection.disconnect();
  }

  function receiveDirectMeasurement(measurement: LeicaDistoMeasurement) {
    const activeTarget = targetRef.current;
    const activeDeviceName = pairedDeviceRef.current || "Leica DISTO";
    setLastIncomingValue(measurement.valueMeters);
    setInputValue(formatMeasurement(measurement.valueMeters));

    if (!activeTarget) {
      setConnectionMessage(`${formatMeasurement(measurement.valueMeters)} m érkezett. Válassz célméretet; adat még nem lett felülírva.`);
      return;
    }

    if (!waitingRef.current) {
      setConnectionMessage(`${formatMeasurement(measurement.valueMeters)} m érkezett a(z) ${targetLabel(activeTarget)} célhoz. Nyomd meg az Alkalmazás gombot, vagy indítsd el a Mérés fogadását.`);
      return;
    }

    onApplyRef.current(activeTarget, measurement.valueMeters, "bluetooth_leica", activeDeviceName);
    onWaitingChangeRef.current(false);
    setInputValue("");
    setLastIncomingValue(null);
    setConnectionMessage(`${formatMeasurement(measurement.valueMeters)} m automatikusan rögzítve: ${targetLabel(activeTarget)}.`);
  }

  async function selectBluetoothDevice() {
    if (!browserBluetoothSupported) {
      setPairingState("unsupported");
      return;
    }

    setPairingError("");
    setPairingState("pairing");
    setConnectionMessage("Leica DISTO keresése és eszközengedély kérése...");

    try {
      await closeCurrentConnection();
      setPairingState("connecting");
      setConnectionMessage("Kapcsolódás a Leica DISTO mérési GATT-szolgáltatásához...");

      const connection = await connectLeicaDisto({
        onMeasurement: receiveDirectMeasurement,
        onDisconnected: () => {
          connectionRef.current = null;
          setPairingState("disconnected");
          setConnectionMessage("A Leica DISTO Bluetooth-kapcsolata megszakadt. Kapcsold be a mérőt, majd csatlakozz újra.");
          onWaitingChangeRef.current(false);
        },
      });

      connectionRef.current = connection;
      pairedDeviceRef.current = connection.deviceName;
      setPairedDevice(connection.deviceName);
      setPairingState("connected");
      setConnectionMessage("Leica DISTO D2 csatlakoztatva. A DIMPRO közvetlenül fogadja a mérési értéket.");
      if (targetRef.current) onWaitingChangeRef.current(true);
    } catch (error) {
      const message = getBluetoothErrorMessage(error);
      const errorName = error instanceof DOMException ? error.name : "";
      setPairingState(errorName === "NotFoundError" ? "idle" : "error");
      setConnectionMessage(errorName === "NotFoundError" ? "Az eszközválasztás megszakadt." : "A közvetlen Leica kapcsolat nem jött létre.");
      setPairingError(errorName === "NotFoundError" ? "" : message);
    }
  }

  async function disconnectBluetoothDevice() {
    await closeCurrentConnection();
    setPairingState("disconnected");
    setConnectionMessage("A Leica DISTO kapcsolat bontva.");
    onWaitingChange(false);
  }

  function applyValue(source: SurveyRoomDimensionSource) {
    if (!target) return;
    const valueMeters = parseSurveyMeasurement(inputValue);
    if (!valueMeters) return;
    const resolvedSource = directlyConnected && lastIncomingValue !== null ? "bluetooth_leica" : source;
    onApply(target, valueMeters, resolvedSource, pairedDevice || undefined);
    setInputValue("");
    setLastIncomingValue(null);
    onWaitingChange(false);
  }

  return (
    <div className="rounded-2xl border border-blue-300 bg-blue-50 p-4 text-slate-950">
      <div className="flex items-start justify-between gap-3">
        <div className="flex gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-blue-700 text-white"><Bluetooth size={20} /></span>
          <div>
            <div className="text-sm font-black">Bluetooth-lézeres méretbevitel</div>
            <div className="mt-1 text-xs font-semibold leading-5 text-slate-600">Leica DISTO D2 közvetlen BLE-adapterrel vagy Bluetooth-billentyűzet módban. A közvetlen mérés az aktív célmezőbe automatikusan bekerül.</div>
          </div>
        </div>
        {waiting ? <button type="button" onClick={() => onWaitingChange(false)} className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-blue-300 bg-white text-blue-800" aria-label="Mérésfogadás megszakítása"><X size={15} /></button> : null}
      </div>

      <div className="mt-3 grid grid-cols-3 gap-1.5" role="group" aria-label="Bluetooth mérés célmezője">
        {targets.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => {
              onTargetChange(item.id);
              onWaitingChange(directlyConnected);
            }}
            className={`min-h-9 rounded-lg border px-2 text-[10px] font-black uppercase transition ${target === item.id ? "border-blue-600 bg-blue-100 text-blue-900 ring-2 ring-blue-300" : "border-blue-200 bg-white text-slate-700 hover:border-blue-400"}`}
            aria-pressed={target === item.id}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]">
        <div className="relative">
          <Ruler className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-blue-600" size={17} />
          <input
            ref={inputRef}
            value={inputValue}
            onChange={(event) => setInputValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== "Enter") return;
              event.preventDefault();
              applyValue(waiting && !directlyConnected ? "bluetooth_keyboard" : "manual");
            }}
            inputMode="decimal"
            placeholder={target ? `${targetLabel(target)} m-ben, pl. 4,25` : "Előbb válassz célméretet"}
            className={`h-11 w-full rounded-xl border bg-white pl-10 pr-12 text-sm font-black text-slate-950 outline-none transition focus:ring-4 ${waiting ? "border-blue-600 ring-4 ring-blue-300/50" : "border-blue-200 focus:border-blue-500 focus:ring-blue-200"}`}
            aria-label="Beérkező Bluetooth mérés méterben"
          />
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-black text-slate-500">m</span>
        </div>
        <button type="button" disabled={!target || !parseSurveyMeasurement(inputValue)} onClick={() => applyValue(waiting && !directlyConnected ? "bluetooth_keyboard" : "manual")} className="survey-action-primary disabled:cursor-not-allowed disabled:opacity-40"><Send size={16} /> Alkalmazás</button>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          type="button"
          disabled={!target}
          onClick={() => {
            onWaitingChange(true);
            window.setTimeout(() => inputRef.current?.focus(), 20);
          }}
          className={`survey-action-secondary disabled:cursor-not-allowed disabled:opacity-40 ${waiting ? "border-blue-600 bg-blue-100 text-blue-900" : ""}`}
        >
          <Radio size={16} className={waiting ? "animate-pulse" : ""} /> {waiting ? `${targetLabel(target)} mérésére vár` : "Mérés fogadása"}
        </button>
        <button
          type="button"
          onClick={() => void (directlyConnected ? disconnectBluetoothDevice() : selectBluetoothDevice())}
          className="survey-action-secondary"
        >
          {directlyConnected ? <Unplug size={16} /> : <Bluetooth size={16} />}
          {pairingState === "pairing" ? "Eszközválasztó..." : pairingState === "connecting" ? "Kapcsolódás..." : directlyConnected ? "Kapcsolat bontása" : pairedDevice ? "Újracsatlakozás" : "Leica csatlakoztatása"}
        </button>
      </div>

      {waiting ? (
        <div className="mt-3 flex items-start gap-2 rounded-xl border border-blue-300 bg-white px-3 py-2.5 text-xs font-bold leading-5 text-blue-950">
          {directlyConnected ? <Radio size={17} className="mt-0.5 shrink-0 animate-pulse text-blue-700" /> : <Keyboard size={17} className="mt-0.5 shrink-0 text-blue-700" />}
          <span>Aktív cél: <strong>{targetLabel(target)}</strong>. {directlyConnected ? "Nyomd meg a DISTO mérés gombját; az érték automatikusan rögzül." : "Billentyűzet-emuláció esetén az érték a fókuszált mezőbe íródik; ezután nyomj Entert."}</span>
        </div>
      ) : null}

      {pairingState === "connected" ? <div className="mt-2 flex items-start gap-2 rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-2.5 text-xs font-bold leading-5 text-emerald-900"><CheckCircle2 size={16} className="mt-0.5 shrink-0" /><span><strong>{pairedDevice}</strong><br />{connectionMessage}</span></div> : null}
      {pairingState === "pairing" || pairingState === "connecting" ? <div className="mt-2 flex items-center gap-2 text-xs font-black text-blue-800"><Radio size={15} className="animate-pulse" /> {connectionMessage}</div> : null}
      {pairingState === "disconnected" ? <div className="mt-2 flex items-start gap-2 text-xs font-bold leading-5 text-amber-800"><Unplug size={16} className="mt-0.5 shrink-0" /> {connectionMessage}</div> : null}
      {pairingState === "unsupported" ? <div className="mt-2 flex items-start gap-2 text-xs font-bold leading-5 text-amber-800"><Smartphone size={16} className="mt-0.5 shrink-0" /> Ezen a böngészőn nincs közvetlen Web Bluetooth. Androidon Google Chrome szükséges; a billentyűzet mód és a DIMPRO natív bridge továbbra is használható.</div> : null}
      {pairingState === "error" ? <div className="mt-2 rounded-xl border border-rose-300 bg-rose-50 px-3 py-2.5 text-xs font-bold leading-5 text-rose-800"><strong>Leica kapcsolat sikertelen.</strong><br />{pairingError}</div> : null}
      {!browserBluetoothSupported && pairingState === "idle" ? <div className="mt-2 text-[10px] font-semibold leading-4 text-slate-600">iPad/Safari esetén a későbbi DIMPRO natív bridge továbbítja a mérést. Androidos Chrome alatt a Leica DISTO D2 közvetlenül csatlakoztatható.</div> : null}
      {lastIncomingValue !== null && !waiting && inputValue ? <div className="mt-2 text-[10px] font-bold text-blue-800">Legutóbb fogadott, még nem alkalmazott érték: {formatMeasurement(lastIncomingValue)} m.</div> : null}

      {lastMeasurement ? (
        <div className="mt-3 rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-2.5 text-xs text-emerald-900">
          <div className="flex items-center gap-2 font-black"><CheckCircle2 size={16} /> Utolsó mérés: {lastMeasurement.valueMeters.toFixed(3).replace(".", ",")} m → {targetLabel(lastMeasurement.target)}</div>
          <div className="mt-1 font-semibold text-emerald-700">{lastMeasurement.deviceName || (lastMeasurement.source === "manual" ? "Kézi bevitel" : "DIMPRO mérésfogadó")}</div>
        </div>
      ) : null}
    </div>
  );
}
