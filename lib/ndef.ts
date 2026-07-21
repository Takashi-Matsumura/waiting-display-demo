// NDEF (NFC Data Exchange Format) の汎用的なレコード/メッセージ encode/decode。
// 特定アプリのペイロード形式(整理券JSON等)は関知せず、type/payloadは未解釈(raw)のまま扱う。
// これにより、type='T'(Text)以外のレコード(例: 他アプリが書くtype='U'のURIレコード)を
// 壊さずに保持できる。
// 対応範囲: 短レコード(SR)のみ、単一の NDEF Message TLV のみ(拡張長0xFF・ネストは非対応)。

export const TNF_EMPTY = 0x00;
export const TNF_WELL_KNOWN = 0x01;

/** 未解釈(raw)のNDEFレコード。type/payloadの意味はTNF/type値に応じて呼び出し側が解釈する。 */
export interface RawNdefRecord {
  tnf: number;
  type: Buffer;
  payload: Buffer;
}

const NDEF_MESSAGE_TLV = 0x03;
const TERMINATOR_TLV = 0xfe;
const NULL_TLV = 0x00;

const FLAG_MB = 0x80;
const FLAG_ME = 0x40;
const FLAG_SR = 0x10;

/**
 * 1レコード分のバイト列を組み立てる(短レコードのみ)。
 * MB/MEフラグはここでは立てない。複数レコードをまとめる encodeNdefMessage が設定する。
 */
export function encodeNdefRecord(record: RawNdefRecord): Buffer {
  const { tnf, type, payload } = record;
  if (payload.length > 0xff) {
    throw new Error("NDEFレコードのペイロードが大きすぎます(拡張長は非対応)。");
  }
  if (type.length > 0xff) {
    throw new Error("NDEFレコードのtypeが大きすぎます。");
  }

  const header = FLAG_SR | (tnf & 0x07);
  return Buffer.concat([Buffer.from([header, type.length, payload.length]), type, payload]);
}

/** 複数レコードを1つのNDEFメッセージ(TLVラップ込み、0x03...0xFE)にまとめる。 */
export function encodeNdefMessage(records: RawNdefRecord[]): Buffer {
  if (records.length === 0) {
    throw new Error("空のNDEFメッセージは書き込めません。");
  }

  const encoded = records.map((record) => encodeNdefRecord(record));
  encoded[0][0] |= FLAG_MB;
  encoded[encoded.length - 1][0] |= FLAG_ME;

  const body = Buffer.concat(encoded);
  if (body.length > 0xff) {
    throw new Error("NDEFメッセージが大きすぎます(拡張長TLVは非対応)。");
  }

  return Buffer.concat([
    Buffer.from([NDEF_MESSAGE_TLV, body.length]),
    body,
    Buffer.from([TERMINATOR_TLV]),
  ]);
}

/** バッファ中のNDEF Message TLVの開始位置と宣言長を調べる(見つからなければnull)。 */
export function locateNdefMessageTlv(buf: Buffer): { offset: number; length: number } | null {
  let offset = 0;
  while (offset < buf.length) {
    const tlvType = buf[offset];
    if (tlvType === NULL_TLV) {
      offset += 1;
      continue;
    }
    if (tlvType === TERMINATOR_TLV) break;

    const len = buf[offset + 1];
    if (len === undefined) return null;
    if (tlvType === NDEF_MESSAGE_TLV) {
      if (len === 0xff) return null; // 拡張長は非対応
      return { offset, length: len };
    }
    offset += 2 + len;
  }
  return null;
}

/**
 * page4以降の生バイト列から、NDEFメッセージ内の全レコードを未解釈(raw)のまま取り出す。
 * ME=1のレコードに到達したら終了する。読取範囲がメッセージ全体をカバーしていない場合は
 * 空配列を返す(呼び出し側で追加読取が必要)。
 */
export function decodeNdefMessage(buf: Buffer): RawNdefRecord[] {
  const located = locateNdefMessageTlv(buf);
  if (!located) return [];

  const messageStart = located.offset + 2;
  const message = buf.subarray(messageStart, messageStart + located.length);
  if (message.length < located.length) return []; // 読取範囲不足

  const records: RawNdefRecord[] = [];
  let offset = 0;

  while (offset < message.length) {
    const flags = message[offset];
    const isShortRecord = (flags & FLAG_SR) !== 0;
    if (!isShortRecord) break; // 拡張長レコードは非対応

    const typeLength = message[offset + 1];
    const payloadLength = message[offset + 2];
    if (typeLength === undefined || payloadLength === undefined) break;

    const typeStart = offset + 3;
    const payloadStart = typeStart + typeLength;
    const payloadEnd = payloadStart + payloadLength;
    if (payloadEnd > message.length) break;

    records.push({
      tnf: flags & 0x07,
      type: Buffer.from(message.subarray(typeStart, payloadStart)),
      payload: Buffer.from(message.subarray(payloadStart, payloadEnd)),
    });

    if ((flags & FLAG_ME) !== 0) break;
    offset = payloadEnd;
  }

  return records;
}
