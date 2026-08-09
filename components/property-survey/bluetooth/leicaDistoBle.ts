export const LEICA_DISTO_SERVICE_UUID = "3ab10100-f831-4395-b29d-570977d5bf94";
export const LEICA_DISTO_DISTANCE_CHARACTERISTIC_UUID = "3ab10101-f831-4395-b29d-570977d5bf94";
export const LEICA_DISTO_DISTANCE_UNIT_CHARACTERISTIC_UUID = "3ab10102-f831-4395-b29d-570977d5bf94";

const BLUETOOTH_DEVICE_INFORMATION_SERVICE_UUID = "0000180a-0000-1000-8000-00805f9b34fb";
const BLUETOOTH_BATTERY_SERVICE_UUID = "0000180f-0000-1000-8000-00805f9b34fb";

type BrowserBluetoothRequestDeviceOptions = {
  filters?: Array<{ services?: string[]; namePrefix?: string }>;
  optionalServices?: string[];
  acceptAllDevices?: boolean;
};

export type BrowserBluetoothRemoteGATTCharacteristic = EventTarget & {
  value?: DataView | null;
  startNotifications(): Promise<BrowserBluetoothRemoteGATTCharacteristic>;
  stopNotifications?(): Promise<BrowserBluetoothRemoteGATTCharacteristic>;
};

type BrowserBluetoothRemoteGATTService = {
  getCharacteristic(uuid: string): Promise<BrowserBluetoothRemoteGATTCharacteristic>;
};

type BrowserBluetoothRemoteGATTServer = {
  connected: boolean;
  connect(): Promise<BrowserBluetoothRemoteGATTServer>;
  disconnect(): void;
  getPrimaryService(uuid: string): Promise<BrowserBluetoothRemoteGATTService>;
};

export type BrowserBluetoothDevice = EventTarget & {
  id: string;
  name?: string | null;
  gatt?: BrowserBluetoothRemoteGATTServer;
};

type BluetoothCapableNavigator = Navigator & {
  bluetooth?: {
    requestDevice(options: BrowserBluetoothRequestDeviceOptions): Promise<BrowserBluetoothDevice>;
  };
};

export type LeicaDistoMeasurement = {
  valueMeters: number;
  measuredAt: string;
};

export type LeicaDistoConnection = {
  device: BrowserBluetoothDevice;
  deviceName: string;
  disconnect(): Promise<void>;
};

type ConnectLeicaDistoOptions = {
  onMeasurement: (measurement: LeicaDistoMeasurement) => void;
  onDisconnected: () => void;
};

export function isWebBluetoothSupported() {
  if (typeof navigator === "undefined") return false;
  return Boolean((navigator as BluetoothCapableNavigator).bluetooth?.requestDevice);
}

export function parseLeicaDistoDistance(value?: DataView | null) {
  if (!value || value.byteLength < 4) return null;
  const distanceMeters = value.getFloat32(0, true);
  if (!Number.isFinite(distanceMeters) || distanceMeters <= 0 || distanceMeters > 1000) return null;
  return distanceMeters;
}

export function getBluetoothErrorMessage(error: unknown) {
  if (error instanceof DOMException) {
    switch (error.name) {
      case "NotFoundError":
        return "Az eszközválasztás megszakadt vagy nem található DISTO eszköz.";
      case "SecurityError":
        return "A böngésző nem engedélyezte a Bluetooth-hozzáférést. HTTPS és felhasználói gombnyomás szükséges.";
      case "NetworkError":
        return "A Bluetooth GATT-kapcsolat nem hozható létre. Kapcsold ki, majd vissza a DISTO Bluetooth funkcióját.";
      case "NotSupportedError":
        return "A kiválasztott eszköz nem adja a Leica DISTO mérési szolgáltatást.";
      case "InvalidStateError":
        return "A Bluetooth-kapcsolat nincs megfelelő állapotban. Bontsd a kapcsolatot, majd csatlakozz újra.";
      default:
        return error.message || "Ismeretlen Web Bluetooth hiba történt.";
    }
  }
  return error instanceof Error ? error.message : "Ismeretlen Bluetooth hiba történt.";
}

export async function connectLeicaDisto({
  onMeasurement,
  onDisconnected,
}: ConnectLeicaDistoOptions): Promise<LeicaDistoConnection> {
  const bluetooth = (navigator as BluetoothCapableNavigator).bluetooth;
  if (!bluetooth?.requestDevice) {
    throw new DOMException("A Web Bluetooth API nem érhető el.", "NotSupportedError");
  }

  const device = await bluetooth.requestDevice({
    filters: [
      { services: [LEICA_DISTO_SERVICE_UUID] },
      { namePrefix: "DISTO" },
    ],
    optionalServices: [
      LEICA_DISTO_SERVICE_UUID,
      BLUETOOTH_DEVICE_INFORMATION_SERVICE_UUID,
      BLUETOOTH_BATTERY_SERVICE_UUID,
    ],
  });

  if (!device.gatt) {
    throw new DOMException("A kiválasztott eszköz nem biztosít GATT-kapcsolatot.", "NotSupportedError");
  }

  const server = device.gatt.connected ? device.gatt : await device.gatt.connect();
  const service = await server.getPrimaryService(LEICA_DISTO_SERVICE_UUID);
  const distanceCharacteristic = await service.getCharacteristic(LEICA_DISTO_DISTANCE_CHARACTERISTIC_UUID);

  let clientDisconnect = false;

  const handleMeasurement = (event: Event) => {
    const characteristic = event.target as BrowserBluetoothRemoteGATTCharacteristic | null;
    const valueMeters = parseLeicaDistoDistance(characteristic?.value);
    if (!valueMeters) return;
    onMeasurement({ valueMeters, measuredAt: new Date().toISOString() });
  };

  const handleDisconnected = () => {
    if (!clientDisconnect) onDisconnected();
  };

  distanceCharacteristic.addEventListener("characteristicvaluechanged", handleMeasurement);
  device.addEventListener("gattserverdisconnected", handleDisconnected);
  await distanceCharacteristic.startNotifications();

  const deviceName = device.name?.trim() || `Leica DISTO (${device.id.slice(0, 8)})`;

  return {
    device,
    deviceName,
    async disconnect() {
      clientDisconnect = true;
      distanceCharacteristic.removeEventListener("characteristicvaluechanged", handleMeasurement);
      device.removeEventListener("gattserverdisconnected", handleDisconnected);
      try {
        if (distanceCharacteristic.stopNotifications) await distanceCharacteristic.stopNotifications();
      } catch {
        // A kapcsolat bontásakor egyes böngészők már nem engedik a notification leállítását.
      }
      if (device.gatt?.connected) device.gatt.disconnect();
    },
  };
}
