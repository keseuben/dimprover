import net from "node:net";
import { access } from "node:fs/promises";

const env = (name, fallback = "") => process.env[name]?.trim() || fallback;
const secretConfigured = env("DROP_WORKER_SECRET").length >= 32;
const scannerMode = env("DIMPRO_DROP_VIRUS_SCANNER_COMMAND", env("DROP_VIRUS_SCANNER_COMMAND")).toLowerCase();
const socketPath = env("DIMPRO_DROP_CLAMD_SOCKET", "/var/run/clamav/clamd.ctl");
const systemdService = "/etc/systemd/system/dimpro-drop-worker-v050.service";
const systemdTimer = "/etc/systemd/system/dimpro-drop-worker-v050.timer";

async function pingClamd() {
  try {
    await access(socketPath);
    return await new Promise((resolve) => {
      const socket = net.createConnection(socketPath);
      let response = "";
      const timer = setTimeout(() => {
        socket.destroy();
        resolve({ reachable: false, ping: null });
      }, 5000);
      socket.on("connect", () => socket.write(Buffer.from("zPING\0")));
      socket.on("data", (chunk) => {
        response += chunk.toString("utf8");
        if (response.includes("\0") || response.includes("\n")) {
          clearTimeout(timer);
          socket.destroy();
          const ping = response.replace(/\0/g, "").trim();
          resolve({ reachable: ping === "PONG", ping });
        }
      });
      socket.on("error", () => {
        clearTimeout(timer);
        resolve({ reachable: false, ping: null });
      });
    });
  } catch {
    return { reachable: false, ping: null };
  }
}

const [clamd, serviceInstalled, timerInstalled] = await Promise.all([
  pingClamd(),
  access(systemdService).then(() => true).catch(() => false),
  access(systemdTimer).then(() => true).catch(() => false),
]);
const scannerConfigured = scannerMode === "clamd-instream";
const ready = secretConfigured && scannerConfigured && clamd.reachable;
console.log(JSON.stringify({
  ok: ready,
  workerSecretConfigured: secretConfigured,
  scannerMode,
  scannerConfigured,
  clamdSocketConfigured: socketPath.startsWith("/"),
  clamdReachable: clamd.reachable,
  clamdPing: clamd.ping,
  serviceInstalled,
  timerInstalled,
  timerActivationExpectedAfterSql: true,
  retentionReportGateEnabled: env("DIMPRO_DROP_RETENTION_REPORT_GATE", "true").toLowerCase() !== "false",
  downloadUrlTtlSeconds: Number(env("DIMPRO_DROP_DOWNLOAD_URL_TTL_SECONDS", "180")),
  secretsExposed: false,
}, null, 2));
process.exit(ready ? 0 : 2);
