/** Bounded HTTP stream decoder, independent of Next, DB and S3 for exhaustive tests. */
export class PersonalStreamBodyError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(code: string, status: number, message: string) {
    super(message);
    this.code = code;
    this.status = status;
    this.name = "PersonalStreamBodyError";
  }
}
export async function* checkedPersonalStreamChunks(
  source: AsyncIterable<Uint8Array>, declaredBytes: number, maxBytes: number,
): AsyncGenerator<Uint8Array> {
  if (!Number.isSafeInteger(declaredBytes) || declaredBytes < 1
    || !Number.isSafeInteger(maxBytes) || maxBytes < 1 || declaredBytes > maxBytes) {
    throw new PersonalStreamBodyError("PERSONAL_UPLOAD_STREAM_SIZE_INVALID", 413,
      "Az adatfolyam mérete meghaladja az engedélyezett korlátot.");
  }
  let seen = 0;
  for await (const value of source) {
    if (!value?.byteLength) continue;
    seen += value.byteLength;
    if (seen > declaredBytes || seen > maxBytes) {
      throw new PersonalStreamBodyError("PERSONAL_UPLOAD_STREAM_OVERFLOW", 413,
        "A szerver több adatot kapott, mint a bejelentett fájlméret.");
    }
    yield value;
  }
  if (seen !== declaredBytes) {
    throw new PersonalStreamBodyError("PERSONAL_UPLOAD_STREAM_LENGTH_MISMATCH", 409,
      "Az adatfolyam nem egyezik a fájl bejelentett méretével.");
  }
}
