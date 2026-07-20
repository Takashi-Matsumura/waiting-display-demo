// NFCリーダー(PC/SC)連携。ネイティブアドオンの nfc-pcsc は動的requireで読み込み、
// 未導入環境（例: Vercel）でも `next build` が失敗しないようにする。
// (参考: ted-stem-cards/lib/nfc.ts のシングルトン管理・キュー・重複除去パターンを踏襲)
/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-require-imports */
import { decodeTicketPayload, encodeTicketPayload, TicketPayload } from "./payload";

let NFC: any;
try {
  NFC = require("nfc-pcsc").NFC;
} catch {
  /* nfc-pcsc not available (e.g. Vercel) */
}

export interface TicketReadEvent {
  payload: TicketPayload | null;
  uid: string;
  raw: string;
  timestamp: number;
}

let nfc: any = null;
let activeReader: any = null;
let readerName = "";

// 読取イベントキュー。受付画面がポーリングでドレインする。
let readEvents: TicketReadEvent[] = [];
let lastSeenUid = "";

// 発行(NDEF書込)モード: 次にタップされたカードへ payload を書き込む。
let pendingIssue: {
  payload: TicketPayload;
  resolve: (info: { uid: string }) => void;
  reject: (err: Error) => void;
} | null = null;

function ensureNfc() {
  if (nfc) return;
  if (!NFC) return; // nfc-pcsc not available

  nfc = new NFC();

  nfc.on("reader", (reader: any) => {
    activeReader = reader;
    readerName = reader.reader.name;
    console.log(`[NFC] Reader connected: ${readerName}`);

    reader.on("card", async (card: any) => {
      console.log(`[NFC] Card detected: UID=${card.uid}`);

      // --- 発行(書込)モード ---
      if (await handlePendingIssue(reader, card)) return;

      // --- 通常読取モード ---
      if (card.uid === lastSeenUid) return;
      lastSeenUid = card.uid;

      try {
        const raw = await readNdef(reader);
        const payload = raw ? decodeTicketPayload(raw) : null;
        if (!payload) {
          console.log(`[NFC] Unrecognized tag UID=${card.uid} (no valid ticket payload)`);
        }
        readEvents.push({ payload, uid: card.uid, raw: raw ?? "", timestamp: Date.now() });
      } catch (err) {
        console.error(`[NFC] NDEF read failed:`, err);
        readEvents.push({ payload: null, uid: card.uid, raw: "", timestamp: Date.now() });
      }
    });

    reader.on("card.off", (card: any) => {
      console.log(`[NFC] Card removed: UID=${card.uid}`);
      if (card.uid === lastSeenUid) {
        lastSeenUid = "";
      }
    });

    reader.on("error", (err: any) => {
      console.error(`[NFC] Reader error:`, err);
    });

    reader.on("end", () => {
      console.log(`[NFC] Reader disconnected: ${readerName}`);
      if (activeReader === reader) {
        activeReader = null;
        readerName = "";
      }
    });
  });

  nfc.on("error", (err: any) => {
    console.error("[NFC] NFC error:", err);
  });
}

/** リーダー接続状態を取得する。 */
export function getStatus(): {
  connected: boolean;
  readerName: string;
  mode: "idle" | "issuing";
} {
  ensureNfc();
  return {
    connected: activeReader !== null,
    readerName,
    mode: pendingIssue !== null ? "issuing" : "idle",
  };
}

/** 読取イベントキューをドレイン(取得と同時にクリア)する。 */
export function drainReadEvents(): TicketReadEvent[] {
  ensureNfc();
  const events = readEvents;
  readEvents = [];
  return events;
}

/**
 * 次にタップされたカードへ整理券情報を NDEF Text レコードとして書き込み、
 * 書込に使われたカードの UID を解決する。
 */
export function issueNextCard(
  payload: TicketPayload,
  timeoutMs = 30000
): Promise<{ uid: string }> {
  ensureNfc();

  if (!activeReader) {
    return Promise.reject(new Error("NFCリーダーが接続されていません。"));
  }

  if (pendingIssue) {
    pendingIssue.reject(new Error("新しい発行リクエストで上書きされました。"));
    pendingIssue = null;
  }

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      if (pendingIssue?.payload === payload) {
        pendingIssue = null;
        reject(new Error("タイムアウト: カードが検出されませんでした。"));
      }
    }, timeoutMs);

    pendingIssue = {
      payload,
      resolve: (info) => {
        clearTimeout(timer);
        resolve(info);
      },
      reject: (err) => {
        clearTimeout(timer);
        reject(err);
      },
    };
  });
}

/** 発行アームを取り消す。 */
export function cancelIssue(): void {
  if (pendingIssue) {
    pendingIssue.reject(new Error("キャンセルされました。"));
    pendingIssue = null;
  }
}

// ---- NDEF Text レコードの組立/解析 ----

const PAGE_SIZE = 4;
const USER_MEMORY_START_PAGE = 4; // NTAG のユーザーデータは page 4 から
const INITIAL_READ_BYTES = 64; // NTAG213(144B)のうち先頭64Bをまず読む。TLV長が超える場合のみ追加読取。

/**
 * NDEF Text レコードを TLV でラップした Buffer を組み立てる。
 * (参考 buildNdefUrlMessage の URIレコード版をTextレコード用に踏襲)
 */
function buildNdefTextMessage(text: string, lang = "en"): Buffer {
  const langBytes = Buffer.from(lang, "ascii");
  const textBytes = Buffer.from(text, "utf8");
  const statusByte = langBytes.length & 0x3f; // bit7=0(UTF-8), bits0-5=言語コード長
  const payload = Buffer.concat([Buffer.from([statusByte]), langBytes, textBytes]);
  const payloadLength = payload.length;

  if (payloadLength > 0xff) {
    throw new Error("整理券データが大きすぎてNTAGに書き込めません。");
  }

  // NDEF record: MB|ME|SR|TNF=well-known(1) = 0xD1, type='T'(0x54)
  const record = Buffer.concat([
    Buffer.from([0xd1, 0x01, payloadLength, 0x54]),
    payload,
  ]);

  // TLV wrapper: 0x03(NDEF Message TLV), length, record, 0xFE(terminator)
  return Buffer.concat([Buffer.from([0x03, record.length]), record, Buffer.from([0xfe])]);
}

/**
 * page4以降の生バイト列から、最初のNDEF Textレコードの本文文字列を取り出す。
 * TLV(0x00=NULLでスキップ、0x03=NDEF Message、0xFE=終端)を走査する。
 * 対応するのは短レコード(SR)・単純TLV長(1バイト、0xFF拡張長は非対応)のみ。
 */
function parseNdefText(buf: Buffer): string | null {
  let offset = 0;
  while (offset < buf.length) {
    const tlvType = buf[offset];

    if (tlvType === 0x00) {
      offset += 1; // NULL TLV: 値なし
      continue;
    }
    if (tlvType === 0xfe) {
      break; // Terminator TLV
    }
    if (tlvType !== 0x03) {
      // 未対応のTLV。長さバイトを信じて読み飛ばす。
      const len = buf[offset + 1];
      if (len === undefined) break;
      offset += 2 + len;
      continue;
    }

    const len = buf[offset + 1];
    if (len === undefined || len === 0xff) return null; // 拡張長は非対応
    const messageStart = offset + 2;
    const message = buf.subarray(messageStart, messageStart + len);
    if (message.length < len) return null; // 読取範囲不足(呼び出し側で追加読取)

    return parseNdefRecordText(message);
  }
  return null;
}

/** NDEFメッセージ(単一レコード想定)からTextレコードの本文文字列を取り出す。 */
function parseNdefRecordText(message: Buffer): string | null {
  if (message.length < 4) return null;

  const flags = message[0];
  const tnf = flags & 0x07;
  const isShortRecord = (flags & 0x10) !== 0;
  if (tnf !== 0x01 || !isShortRecord) return null; // well-known + short record のみ対応

  const typeLength = message[1];
  const payloadLength = message[2];
  const type = message.subarray(3, 3 + typeLength);
  if (type.length !== 1 || type[0] !== 0x54) return null; // type='T'

  const payloadStart = 3 + typeLength;
  const payload = message.subarray(payloadStart, payloadStart + payloadLength);
  if (payload.length < payloadLength) return null;

  const statusByte = payload[0];
  const langLength = statusByte & 0x3f;
  const textBytes = payload.subarray(1 + langLength);
  return textBytes.toString("utf8");
}

/** カードの page4 以降を読み、NDEF Textレコードの本文を返す(無ければ null)。 */
async function readNdef(reader: any): Promise<string | null> {
  let buf: Buffer = await reader.read(USER_MEMORY_START_PAGE, INITIAL_READ_BYTES, PAGE_SIZE);

  // 初回読取に収まっていればここで解決。TLV長が読取範囲を超える場合のみ追加読取する。
  const declaredLength = declaredNdefMessageLength(buf);
  if (declaredLength !== null) {
    const neededBytes = declaredLength.offset + 2 + declaredLength.length;
    if (neededBytes > buf.length) {
      const extraPages = Math.ceil(neededBytes / PAGE_SIZE);
      buf = await reader.read(USER_MEMORY_START_PAGE, extraPages * PAGE_SIZE, PAGE_SIZE);
    }
  }

  return parseNdefText(buf);
}

/** バッファ中のNDEF Message TLVの開始位置と宣言長を調べる(見つからなければnull)。 */
function declaredNdefMessageLength(buf: Buffer): { offset: number; length: number } | null {
  let offset = 0;
  while (offset < buf.length) {
    const tlvType = buf[offset];
    if (tlvType === 0x00) {
      offset += 1;
      continue;
    }
    if (tlvType === 0xfe) break;
    const len = buf[offset + 1];
    if (len === undefined) return null;
    if (tlvType === 0x03) {
      if (len === 0xff) return null; // 拡張長は非対応
      return { offset, length: len };
    }
    offset += 2 + len;
  }
  return null;
}

/** 発行アーム中に card イベントが来た場合、NDEF書込を行う。処理した場合 true を返す。 */
async function handlePendingIssue(reader: any, card: any): Promise<boolean> {
  if (!pendingIssue) return false;

  const req = pendingIssue;
  pendingIssue = null;

  try {
    const text = encodeTicketPayload(req.payload);
    const message = buildNdefTextMessage(text);

    // 4バイト境界にパディングしてページ単位で逐次書込する。
    // (参考実装同様、並列書込ではなくページごとに await することでハードウェア互換性を優先)
    const paddedLength = Math.ceil(message.length / PAGE_SIZE) * PAGE_SIZE;
    const padded = Buffer.alloc(paddedLength, 0);
    message.copy(padded, 0);

    for (let offset = 0; offset < padded.length; offset += PAGE_SIZE) {
      const page = USER_MEMORY_START_PAGE + offset / PAGE_SIZE;
      const chunk = padded.subarray(offset, offset + PAGE_SIZE);
      await reader.write(page, chunk, PAGE_SIZE);
    }

    console.log(`[NFC] Ticket written to card UID=${card.uid}: ${text}`);
    req.resolve({ uid: card.uid });
  } catch (err) {
    console.error(`[NFC] NDEF write failed:`, err);
    const message = err instanceof Error ? err.message : String(err);
    req.reject(new Error(`書き込みに失敗しました: ${message}`));
  }

  return true;
}
