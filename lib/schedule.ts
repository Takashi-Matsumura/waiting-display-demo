// 時間枠の「現在開催中」「次の開催」判定ロジック。Node依存を持たない純粋モジュールなので、
// サーバー(API Route・lib/db.ts)からもクライアントからも import できる。
//
// 「受付中(current)」は [開始時刻-猶予分, 終了時刻) と定義する。この定義により、
// 画面が current として表示するタイミングと、サーバーが早期チェックインを拒否しなくなる
// タイミングが同一の基準で一致し、表示と実際の受理判定に矛盾が生じない。

/** 開始時刻の何分前から受付("現在開催中")とみなすか。 */
export const RECEPTION_GRACE_MINUTES = 5;

/** "HH:MM" 形式の文字列を 0時からの分数に変換する。不正な形式や null は null を返す。 */
export function parseTimeToMinutes(t: string | null | undefined): number | null {
  if (!t) return null;
  const match = /^(\d{1,2}):(\d{2})$/.exec(t.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
}

export interface ScheduleTimes {
  startTime: string | null;
  endTime: string | null;
}

/**
 * 指定時刻(nowMinutes)が、この時間枠の受付中区間 [開始-猶予分, 終了) に含まれるか判定する。
 * 開始時刻が未設定の枠は判定対象外(false)。終了時刻が未設定の場合は無期限([開始-猶予分, ∞))とみなす。
 */
export function isReceptionOpen(times: ScheduleTimes, nowMinutes: number): boolean {
  const startMinutes = parseTimeToMinutes(times.startTime);
  if (startMinutes === null) return false;
  if (nowMinutes < startMinutes - RECEPTION_GRACE_MINUTES) return false;

  const endMinutes = parseTimeToMinutes(times.endTime);
  if (endMinutes === null) return true; // 終了時刻未設定 = 無期限に受付中
  return nowMinutes < endMinutes;
}

/**
 * 終了時刻を過ぎている(すでに受付終了した)枠かどうかを判定する。
 * 終了時刻が未設定の枠は無期限とみなし、常に false を返す。
 */
export function isSlotPast(times: ScheduleTimes, nowMinutes: number): boolean {
  const endMinutes = parseTimeToMinutes(times.endTime);
  if (endMinutes === null) return false;
  return nowMinutes >= endMinutes;
}

/**
 * 開始時刻が設定されている枠の中から、「現在開催中(current)」と「次の開催(next)」を判定する。
 * - current: isReceptionOpen を満たす枠のうち、複数該当する場合は開始が最も遅いもの。
 * - next: 開始時刻が「現在時刻+猶予分」より後の枠のうち、開始が最も早いもの。
 * - 開始時刻未設定の枠はどちらの対象にもならない。
 */
export function classifySlots<T extends ScheduleTimes>(
  slots: T[],
  nowMinutes: number
): { current: T | null; next: T | null } {
  let current: T | null = null;
  let currentStart = -Infinity;
  let next: T | null = null;
  let nextStart = Infinity;

  for (const slot of slots) {
    const startMinutes = parseTimeToMinutes(slot.startTime);
    if (startMinutes === null) continue;

    if (isReceptionOpen(slot, nowMinutes)) {
      if (startMinutes > currentStart) {
        current = slot;
        currentStart = startMinutes;
      }
      continue;
    }

    if (nowMinutes < startMinutes - RECEPTION_GRACE_MINUTES && startMinutes < nextStart) {
      next = slot;
      nextStart = startMinutes;
    }
  }

  return { current, next };
}

/** 12時台(12:00〜13:00)と重なる、連続していない空き時間帯。 */
export interface LunchBreak {
  startTime: string;
  endTime: string;
}

const NOON_START_MINUTES = 12 * 60;
const NOON_END_MINUTES = 13 * 60;

/**
 * 開始・終了時刻が設定された枠を時系列に並べたとき、隣り合う枠の間にできる空き時間帯のうち
 * 12時台(12:00〜13:00)と重なるものを「お昼休み」として検出する。該当する空きが複数あっても
 * 最初の1件のみを返す(通常のイベントでは昼休みは1日1回のため)。
 */
export function findLunchBreak<T extends ScheduleTimes>(slots: T[]): LunchBreak | null {
  const timed = slots
    .map((slot) => ({
      startTime: slot.startTime,
      endTime: slot.endTime,
      start: parseTimeToMinutes(slot.startTime),
      end: parseTimeToMinutes(slot.endTime),
    }))
    .filter(
      (s): s is { startTime: string; endTime: string; start: number; end: number } =>
        s.start !== null && s.end !== null
    )
    .sort((a, b) => a.start - b.start);

  for (let i = 0; i < timed.length - 1; i++) {
    const gapStart = timed[i].end;
    const gapEnd = timed[i + 1].start;
    if (gapEnd <= gapStart) continue; // 連続 or 重複(空きなし)
    if (gapStart < NOON_END_MINUTES && gapEnd > NOON_START_MINUTES) {
      return { startTime: timed[i].endTime, endTime: timed[i + 1].startTime };
    }
  }
  return null;
}

/** 指定時刻(nowMinutes)が、検出済みのお昼休み区間の最中かどうかを判定する。 */
export function isWithinLunchBreak(lunchBreak: LunchBreak | null, nowMinutes: number): boolean {
  if (!lunchBreak) return false;
  const start = parseTimeToMinutes(lunchBreak.startTime);
  const end = parseTimeToMinutes(lunchBreak.endTime);
  if (start === null || end === null) return false;
  return nowMinutes >= start && nowMinutes < end;
}
