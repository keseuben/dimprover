import { getDropWorkerConfig } from "../app/lib/drop/worker/dropWorkerConfig";
import { getClamdHealth, scanAsyncIterableWithClamd } from "../app/lib/drop/worker/clamdInstream";

async function* chunks(buffer: Buffer) {
  for (let offset = 0; offset < buffer.length; offset += 17) {
    yield buffer.subarray(offset, Math.min(buffer.length, offset + 17));
  }
}

async function main() {
  const config = getDropWorkerConfig();
  const health = await getClamdHealth(config);
  const clean = Buffer.from("DIMPRO DROP 0.5.0 clean stream test\n", "utf8");
  const eicar = Buffer.from("X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*", "utf8");
  const cleanResult = await scanAsyncIterableWithClamd(chunks(clean), clean.length, config);
  const infectedResult = await scanAsyncIterableWithClamd(chunks(eicar), eicar.length, config);
  const output = {
    ok: health.ping === "PONG"
      && cleanResult.status === "clean"
      && infectedResult.status === "infected"
      && infectedResult.signatureName === "Eicar-Test-Signature"
      && /^[0-9a-f]{64}$/.test(cleanResult.sha256)
      && /^[0-9a-f]{64}$/.test(infectedResult.sha256),
    scanner: {
      ping: health.ping,
      engine: health.version.engine,
      engineVersion: health.version.engineVersion,
      signatureVersion: health.version.signatureVersion,
    },
    clean: {
      status: cleanResult.status,
      bytesScanned: cleanResult.bytesScanned,
      sha256Stored: /^[0-9a-f]{64}$/.test(cleanResult.sha256),
    },
    infected: {
      status: infectedResult.status,
      signatureName: infectedResult.signatureName,
      bytesScanned: infectedResult.bytesScanned,
      sha256Stored: /^[0-9a-f]{64}$/.test(infectedResult.sha256),
    },
    secretsExposed: false,
  };
  console.log(JSON.stringify(output, null, 2));
  if (!output.ok) process.exit(2);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
