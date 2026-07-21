// NFCリーダー(PC/SC)連携。ネイティブアドオンの nfc-pcsc は動的requireで読み込み、
// 未導入環境（例: Vercel）でも `next build` が失敗しないようにする。
// (参考: ted-stem-cards/lib/nfc.ts のシングルトン管理・キュー・重複除去パターンを踏襲)
/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-require-imports */
import { decodeTicketPayload, encodeTicketPayload, TicketPayload } from "./payload";
import {
  decodeNdefMessage,
  encodeNdefMessage,
  locateNdefMessageTlv,
  RawNdefRecord,
  TNF_WELL_KNOWN,
} from "./ndef";

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

// カードが現在リーダーにかざされているか(card〜card.offの間 true)。
// 受付画面が「かざされている間だけ」結果を表示するために使う。
let cardPresent = false;

// 発行(NDEF書込)モード: 次にタップされたカードへ payload を書き込む。
// expectedUid が指定されている場合、タップされたカードのUIDがそれと異なれば書込を行わない
// (「発行」完了ステップで、識別時に読んだタグと異なるタグへ誤って書き込むことを防ぐガード)。
let pendingIssue: {
  payload: TicketPayload;
  expectedUid?: string;
  resolve: (info: { uid: string }) => void;
  reject: (err: Error) => void;
} | null = null;

// 識別(読取専用)モード: 次にタップされたカードのNDEFを読み取るだけで、書込は行わない。
// 「発行」画面の最初のステップ(どの整理券のタグかを識別する)で使う。
let pendingIdentify: {
  resolve: (info: { uid: string; payload: TicketPayload | null; raw: string }) => void;
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
      cardPresent = true;

      // --- 発行(書込)モード ---
      if (await handlePendingIssue(reader, card)) return;

      // --- 識別(読取専用)モード ---
      if (await handlePendingIdentify(reader, card)) return;

      // --- 通常読取モード(受付/チェックイン用キュー) ---
      if (card.uid === lastSeenUid) return;
      lastSeenUid = card.uid;

      try {
        const raw = await readNdefText(reader);
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
      cardPresent = false;
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
        cardPresent = false;
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
  mode: "idle" | "issuing" | "identifying";
  cardPresent: boolean;
} {
  ensureNfc();
  return {
    connected: activeReader !== null,
    readerName,
    mode: pendingIssue !== null ? "issuing" : pendingIdentify !== null ? "identifying" : "idle",
    cardPresent,
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
 * `expectedUid` を指定すると、タップされたカードのUIDがそれと異なる場合は
 * 書込を行わずエラーにする(「発行」完了ステップで、識別時と異なるタグへの誤書込を防ぐ)。
 */
export function issueNextCard(
  payload: TicketPayload,
  opts: { timeoutMs?: number; expectedUid?: string } = {}
): Promise<{ uid: string }> {
  const { timeoutMs = 30000, expectedUid } = opts;
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
      expectedUid,
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

/**
 * 次にタップされたカードのNDEFを読み取るだけで、書込は行わない(識別専用)。
 * 「発行」画面の最初のステップで、タグに書かれている整理番号を読み取るために使う。
 */
export function identifyNextCard(
  timeoutMs = 30000
): Promise<{ uid: string; payload: TicketPayload | null; raw: string }> {
  ensureNfc();

  if (!activeReader) {
    return Promise.reject(new Error("NFCリーダーが接続されていません。"));
  }

  if (pendingIdentify) {
    pendingIdentify.reject(new Error("新しい識別リクエストで上書きされました。"));
    pendingIdentify = null;
  }

  return new Promise((resolve, reject) => {
    const entry: NonNullable<typeof pendingIdentify> = {
      resolve: (info) => {
        clearTimeout(timer);
        resolve(info);
      },
      reject: (err) => {
        clearTimeout(timer);
        reject(err);
      },
    };
    const timer = setTimeout(() => {
      if (pendingIdentify === entry) {
        pendingIdentify = null;
        reject(new Error("タイムアウト: カードが検出されませんでした。"));
      }
    }, timeoutMs);

    pendingIdentify = entry;
  });
}

/** 識別アームを取り消す。 */
export function cancelIdentify(): void {
  if (pendingIdentify) {
    pendingIdentify.reject(new Error("キャンセルされました。"));
    pendingIdentify = null;
  }
}

// ---- NDEF Text レコードの組立/解析 (TicketPayloadのtype='T'ラッピングのみ担当。
//      複数レコードのTLV/メッセージ組立・解析は lib/ndef.ts に切り出し済み) ----

const PAGE_SIZE = 4;
const USER_MEMORY_START_PAGE = 4; // NTAG のユーザーデータは page 4 から
const INITIAL_READ_BYTES = 64; // NTAG213(144B)のうち先頭64Bをまず読む。TLV長が超える場合のみ追加読取。

// NTAG機種ごとのユーザーメモリ容量(バイト)。機種は現状 NTAG213 決め打ち。
const NTAG_CAPACITY_BYTES = {
  NTAG213: 144,
  NTAG215: 504,
  NTAG216: 888,
} as const;
const TAG_USER_MEMORY_CAPACITY = NTAG_CAPACITY_BYTES.NTAG213;

const TEXT_RECORD_TYPE = Buffer.from("T", "ascii"); // type='T' (0x54)

/** TicketPayloadのテキストをNDEF Textレコードのpayload(status byte + lang + text)にエンコードする。 */
function encodeTextRecordPayload(text: string, lang = "en"): Buffer {
  const langBytes = Buffer.from(lang, "ascii");
  const textBytes = Buffer.from(text, "utf8");
  const statusByte = langBytes.length & 0x3f; // bit7=0(UTF-8), bits0-5=言語コード長
  return Buffer.concat([Buffer.from([statusByte]), langBytes, textBytes]);
}

/** NDEF Textレコードのpayloadから本文文字列を取り出す。 */
function decodeTextRecordPayload(payload: Buffer): string {
  const statusByte = payload[0] ?? 0;
  const langLength = statusByte & 0x3f;
  return payload.subarray(1 + langLength).toString("utf8");
}

/** レコードがwell-known type='T'(Textレコード)かどうか判定する。 */
function isTextRecord(record: RawNdefRecord): boolean {
  return record.tnf === TNF_WELL_KNOWN && record.type.length === 1 && record.type[0] === 0x54;
}

/** カードの page4 以降を読み、NDEFメッセージ内の全レコードを返す(未解釈のraw形式)。 */
async function readNdefRecords(reader: any): Promise<RawNdefRecord[]> {
  let buf: Buffer = await reader.read(USER_MEMORY_START_PAGE, INITIAL_READ_BYTES, PAGE_SIZE);

  // 初回読取に収まっていればここで解決。TLV長が読取範囲を超える場合のみ追加読取する。
  const located = locateNdefMessageTlv(buf);
  if (located !== null) {
    const neededBytes = located.offset + 2 + located.length;
    if (neededBytes > buf.length) {
      const extraPages = Math.ceil(neededBytes / PAGE_SIZE);
      buf = await reader.read(USER_MEMORY_START_PAGE, extraPages * PAGE_SIZE, PAGE_SIZE);
    }
  }

  return decodeNdefMessage(buf);
}

/** カードの page4 以降を読み、NDEF Textレコードの本文を返す(無ければ null)。他typeのレコードは無視する。 */
async function readNdefText(reader: any): Promise<string | null> {
  const records = await readNdefRecords(reader);
  const textRecord = records.find(isTextRecord);
  return textRecord ? decodeTextRecordPayload(textRecord.payload) : null;
}

/** 発行アーム中に card イベントが来た場合、NDEF書込を行う。処理した場合 true を返す。 */
async function handlePendingIssue(reader: any, card: any): Promise<boolean> {
  if (!pendingIssue) return false;

  // expectedUid が指定されていて、タップされたカードが異なる場合は書込を行わない。
  // アームは解除せず維持する(pendingIssueをnullにしない)ことで、オペレーターが
  // 正しいタグを改めてかざせばそのままリクエストが成立する(別タグへの誤書込を防ぎつつ、
  // タイムアウトまでリトライ可能にする)。
  if (pendingIssue.expectedUid !== undefined && card.uid !== pendingIssue.expectedUid) {
    console.log(
      `[NFC] Ignoring tap from unexpected UID=${card.uid} (expected ${pendingIssue.expectedUid})`
    );
    return true;
  }

  const req = pendingIssue;
  pendingIssue = null;

  try {
    const text = encodeTicketPayload(req.payload);
    const textRecord: RawNdefRecord = {
      tnf: TNF_WELL_KNOWN,
      type: TEXT_RECORD_TYPE,
      payload: encodeTextRecordPayload(text),
    };

    // read: 既存のNDEFメッセージを読み取り、自分のTextレコード以外(他アプリが書いた
    // レコード等)を保持したまま、Textレコードだけを置き換える/無ければ追加する。
    const existingRecords = await readNdefRecords(reader);
    const textIndex = existingRecords.findIndex(isTextRecord);
    const records = [...existingRecords];
    if (textIndex >= 0) {
      records[textIndex] = textRecord;
    } else {
      records.push(textRecord);
    }

    // modify: 全レコードを1つのNDEFメッセージに再構成する。
    const message = encodeNdefMessage(records);

    // 4バイト境界にパディングしてページ単位で逐次書込する。
    // (参考実装同様、並列書込ではなくページごとに await することでハードウェア互換性を優先)
    const paddedLength = Math.ceil(message.length / PAGE_SIZE) * PAGE_SIZE;
    if (paddedLength > TAG_USER_MEMORY_CAPACITY) {
      throw new Error(
        `書込データ(${paddedLength}B)がタグの容量(${TAG_USER_MEMORY_CAPACITY}B)を超えています。`
      );
    }
    const padded = Buffer.alloc(paddedLength, 0);
    message.copy(padded, 0);

    // write: 再構成したメッセージを書き戻す。
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

/** 識別アーム中に card イベントが来た場合、NDEFを読み取るだけで解決する。処理した場合 true を返す。 */
async function handlePendingIdentify(reader: any, card: any): Promise<boolean> {
  if (!pendingIdentify) return false;

  const req = pendingIdentify;
  pendingIdentify = null;

  try {
    const raw = await readNdefText(reader);
    const payload = raw ? decodeTicketPayload(raw) : null;
    req.resolve({ uid: card.uid, payload, raw: raw ?? "" });
  } catch (err) {
    console.error(`[NFC] Identify read failed:`, err);
    const message = err instanceof Error ? err.message : String(err);
    req.reject(new Error(`読み取りに失敗しました: ${message}`));
  }

  return true;
}
