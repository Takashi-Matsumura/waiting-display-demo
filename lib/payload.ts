// NTAG の NDEF Text レコードに書き込む整理券ペイロードの encode/decode。
// Node.js 依存を持たない純粋モジュールなので、サーバー（NDEF組立/解析）と
// クライアント（発行前のプレビュー表示）の双方から import できる。

/**
 * NTAG に書き込む整理券情報。
 * キーは NTAG213 のユーザーメモリ(144B)に収まるよう1文字に圧縮している。
 *   t: 整理番号 (ticketNumber)
 *   n: 受付名 (name)
 *   s: 時間枠キー (slot.key)
 */
export interface TicketPayload {
  t: string;
  n: string;
  s: string;
}

/** TicketPayload をタグに書き込むJSON文字列にエンコードする。 */
export function encodeTicketPayload(payload: TicketPayload): string {
  return JSON.stringify({ t: payload.t, n: payload.n, s: payload.s });
}

/**
 * タグから読み取ったテキストを TicketPayload にデコードする。
 * JSON として解釈できない、または必須フィールドが欠けている場合は null を返す。
 */
export function decodeTicketPayload(text: string): TicketPayload | null {
  try {
    const parsed = JSON.parse(text);
    if (
      parsed &&
      typeof parsed === "object" &&
      typeof parsed.t === "string" &&
      typeof parsed.n === "string" &&
      typeof parsed.s === "string"
    ) {
      return { t: parsed.t, n: parsed.n, s: parsed.s };
    }
    return null;
  } catch {
    return null;
  }
}
