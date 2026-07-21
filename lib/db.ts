// SQLite永続化層。better-sqlite3 はネイティブアドオンなので動的requireで読み込み、
// 未導入環境（例: Vercel）でも `next build` が失敗しないようにする（参考: ted-stem-cards/lib/db.ts）。
/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any */
import path from "path";
import { parseTimeToMinutes, RECEPTION_GRACE_MINUTES } from "./schedule";

const DB_PATH = path.join(process.cwd(), "data", "waiting.db");

let db: any = null;

function getDb() {
  if (db) return db;

  const Database = require("better-sqlite3");
  const fs = require("fs");
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");

  db.exec(`
    CREATE TABLE IF NOT EXISTS slots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT NOT NULL UNIQUE,
      label TEXT NOT NULL,
      start_time TEXT,
      end_time TEXT,
      capacity INTEGER NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS tickets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_number TEXT NOT NULL UNIQUE,
      name TEXT,
      slot_id INTEGER NOT NULL REFERENCES slots(id),
      uid TEXT,
      status TEXT NOT NULL DEFAULT 'issued',
      issued_at INTEGER NOT NULL,
      checked_in_at INTEGER,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_tickets_slot ON tickets(slot_id);
    CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status);
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);

  migrateTicketsNameNullable(db);
  migrateSlotsAddEndTime(db);

  return db;
}

/**
 * 旧スキーマ(tickets.name が NOT NULL)のDBを、既存データを保持したまま
 * nullable スキーマへ移行する。SQLiteは ALTER TABLE で列制約を直接緩和できないため、
 * 新スキーマのテーブルを作りデータをコピーしてから差し替える(公式手順に準拠)。
 * 既に新スキーマ、またはテーブルがまだ無い(新規DB)場合は何もしない。
 */
function migrateTicketsNameNullable(database: any): void {
  const columns = database.prepare(`PRAGMA table_info(tickets)`).all() as Array<{
    name: string;
    notnull: number;
  }>;
  const nameColumn = columns.find((c) => c.name === "name");
  if (!nameColumn || nameColumn.notnull === 0) return;

  console.log("[db] Migrating tickets.name to nullable (preserving existing data)...");
  database.transaction(() => {
    database.exec(`
      CREATE TABLE tickets_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ticket_number TEXT NOT NULL UNIQUE,
        name TEXT,
        slot_id INTEGER NOT NULL REFERENCES slots(id),
        uid TEXT,
        status TEXT NOT NULL DEFAULT 'issued',
        issued_at INTEGER NOT NULL,
        checked_in_at INTEGER,
        created_at INTEGER NOT NULL
      );
      INSERT INTO tickets_new (id, ticket_number, name, slot_id, uid, status, issued_at, checked_in_at, created_at)
        SELECT id, ticket_number, name, slot_id, uid, status, issued_at, checked_in_at, created_at FROM tickets;
      DROP TABLE tickets;
      ALTER TABLE tickets_new RENAME TO tickets;
      CREATE INDEX IF NOT EXISTS idx_tickets_slot ON tickets(slot_id);
      CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status);
    `);
  })();
  console.log("[db] Migration complete.");
}

/**
 * slots.end_time(終了時刻)列を追加する。新規のnullable列追加なので、
 * tickets.nameの時のようなテーブル再構築は不要で、SQLite標準のALTER TABLE ADD COLUMNで足りる。
 * 既に列が存在する場合(新規DB含む)は何もしない(冪等)。
 */
function migrateSlotsAddEndTime(database: any): void {
  const columns = database.prepare(`PRAGMA table_info(slots)`).all() as Array<{ name: string }>;
  if (columns.some((c) => c.name === "end_time")) return;

  console.log("[db] Adding slots.end_time column...");
  database.exec(`ALTER TABLE slots ADD COLUMN end_time TEXT`);
  console.log("[db] Migration complete.");
}

export interface SlotRow {
  id: number;
  key: string;
  label: string;
  startTime: string | null;
  endTime: string | null;
  capacity: number;
  sortOrder: number;
  createdAt: number;
}

export interface TicketRow {
  id: number;
  ticketNumber: string;
  name: string | null;
  slotId: number;
  uid: string | null;
  status: "issued" | "checked_in" | "void";
  issuedAt: number;
  checkedInAt: number | null;
  createdAt: number;
}

interface SlotSql {
  id: number;
  key: string;
  label: string;
  start_time: string | null;
  end_time: string | null;
  capacity: number;
  sort_order: number;
  created_at: number;
}

interface TicketSql {
  id: number;
  ticket_number: string;
  name: string | null;
  slot_id: number;
  uid: string | null;
  status: "issued" | "checked_in" | "void";
  issued_at: number;
  checked_in_at: number | null;
  created_at: number;
}

function toSlot(row: SlotSql): SlotRow {
  return {
    id: row.id,
    key: row.key,
    label: row.label,
    startTime: row.start_time,
    endTime: row.end_time,
    capacity: row.capacity,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
  };
}

function toTicket(row: TicketSql): TicketRow {
  return {
    id: row.id,
    ticketNumber: row.ticket_number,
    name: row.name,
    slotId: row.slot_id,
    uid: row.uid,
    status: row.status,
    issuedAt: row.issued_at,
    checkedInAt: row.checked_in_at,
    createdAt: row.created_at,
  };
}

// ---- slots ----

export function listSlots(): SlotRow[] {
  const rows = getDb()
    .prepare(`SELECT * FROM slots ORDER BY sort_order ASC, start_time ASC, id ASC`)
    .all() as SlotSql[];
  return rows.map(toSlot);
}

export function getSlot(id: number): SlotRow | undefined {
  const row = getDb().prepare(`SELECT * FROM slots WHERE id = ?`).get(id) as
    | SlotSql
    | undefined;
  return row ? toSlot(row) : undefined;
}

export function getSlotByKey(key: string): SlotRow | undefined {
  const row = getDb().prepare(`SELECT * FROM slots WHERE key = ?`).get(key) as
    | SlotSql
    | undefined;
  return row ? toSlot(row) : undefined;
}

export function createSlot(input: {
  key: string;
  label: string;
  startTime?: string | null;
  endTime?: string | null;
  capacity: number;
  sortOrder?: number;
}): SlotRow {
  const now = Date.now();
  const result = getDb()
    .prepare(
      `INSERT INTO slots (key, label, start_time, end_time, capacity, sort_order, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      input.key,
      input.label,
      input.startTime ?? null,
      input.endTime ?? null,
      input.capacity,
      input.sortOrder ?? 0,
      now
    );
  return getSlot(Number(result.lastInsertRowid)) as SlotRow;
}

export function updateSlot(
  id: number,
  patch: Partial<{
    label: string;
    capacity: number;
    startTime: string | null;
    endTime: string | null;
  }>
): SlotRow | undefined {
  const current = getSlot(id);
  if (!current) return undefined;
  getDb()
    .prepare(
      `UPDATE slots SET label = ?, capacity = ?, start_time = ?, end_time = ? WHERE id = ?`
    )
    .run(
      patch.label ?? current.label,
      patch.capacity ?? current.capacity,
      patch.startTime !== undefined ? patch.startTime : current.startTime,
      patch.endTime !== undefined ? patch.endTime : current.endTime,
      id
    );
  return getSlot(id);
}

/** 券が紐づく枠は削除できない（例外を投げる）。 */
export function deleteSlot(id: number): void {
  const count = getDb()
    .prepare(`SELECT COUNT(*) as c FROM tickets WHERE slot_id = ?`)
    .get(id) as { c: number };
  if (count.c > 0) {
    throw new Error("この時間枠には発行済みの整理券が紐づいているため削除できません。");
  }
  getDb().prepare(`DELETE FROM slots WHERE id = ?`).run(id);
}

// ---- tickets ----

export function createTicket(input: {
  ticketNumber: string;
  name: string | null;
  slotId: number;
  uid?: string | null;
}): TicketRow {
  const now = Date.now();
  const result = getDb()
    .prepare(
      `INSERT INTO tickets (ticket_number, name, slot_id, uid, status, issued_at, created_at)
       VALUES (?, ?, ?, ?, 'issued', ?, ?)`
    )
    .run(input.ticketNumber, input.name, input.slotId, input.uid ?? null, now, now);
  return getTicket(Number(result.lastInsertRowid)) as TicketRow;
}

/**
 * 定員・整理番号重複を再検証したうえで整理券を発行する（トランザクション内)。
 * 発行フローの最終確定はすべてこれを通す。
 * 「準備」段階では name=null で呼ばれ、この時点で定員が消費される。
 */
export function issueTicketWithCapacityCheck(input: {
  ticketNumber: string;
  name: string | null;
  slotId: number;
  uid?: string | null;
}): TicketRow {
  const database = getDb();
  const run = database.transaction(() => {
    const slot = getSlot(input.slotId);
    if (!slot) {
      throw new Error("指定された時間枠が見つかりません。");
    }
    if (getTicketByNumber(input.ticketNumber)) {
      throw new Error(`整理番号 "${input.ticketNumber}" は既に使用されています。`);
    }
    const issued = countIssuedForSlot(input.slotId);
    if (issued >= slot.capacity) {
      throw new Error("この時間枠は満員のため発行できません。");
    }
    return createTicket(input);
  });
  return run();
}

export function getTicket(id: number): TicketRow | undefined {
  const row = getDb().prepare(`SELECT * FROM tickets WHERE id = ?`).get(id) as
    | TicketSql
    | undefined;
  return row ? toTicket(row) : undefined;
}

export function getTicketByNumber(ticketNumber: string): TicketRow | undefined {
  const row = getDb()
    .prepare(`SELECT * FROM tickets WHERE ticket_number = ?`)
    .get(ticketNumber) as TicketSql | undefined;
  return row ? toTicket(row) : undefined;
}

export type CompleteTicketResult = "ok" | "unknown" | "void";

/**
 * 「発行」段階: 準備済み(name=null)の整理券に受付名を書き込む(UPDATEのみ、新規作成はしない)。
 * 既に受付名が設定済みでも上書きを許容する(訂正のため)。`wasNamed` で呼び出し側が
 * 「上書きしました」等のメッセージを出し分けられるようにする。
 */
export function completeTicketName(
  ticketNumber: string,
  name: string,
  uid?: string | null
): { result: CompleteTicketResult; ticket?: TicketRow; slot?: SlotRow; wasNamed: boolean } {
  const database = getDb();
  const run = database.transaction(() => {
    const ticket = getTicketByNumber(ticketNumber);
    if (!ticket) {
      return { result: "unknown" as const, wasNamed: false };
    }
    if (ticket.status === "void") {
      return {
        result: "void" as const,
        ticket,
        slot: getSlot(ticket.slotId),
        wasNamed: ticket.name != null && ticket.name !== "",
      };
    }
    const wasNamed = ticket.name != null && ticket.name !== "";
    if (uid !== undefined) {
      database
        .prepare(`UPDATE tickets SET name = ?, uid = ? WHERE id = ?`)
        .run(name, uid, ticket.id);
    } else {
      database.prepare(`UPDATE tickets SET name = ? WHERE id = ?`).run(name, ticket.id);
    }
    const updated = getTicket(ticket.id) as TicketRow;
    return { result: "ok" as const, ticket: updated, slot: getSlot(ticket.slotId), wasNamed };
  });
  return run();
}

export function listTickets(): TicketRow[] {
  const rows = getDb()
    .prepare(`SELECT * FROM tickets ORDER BY created_at DESC`)
    .all() as TicketSql[];
  return rows.map(toTicket);
}

/** 指定した時間枠に属する整理券を整理番号順に返す。紛失タグの再発行UIの一覧表示に使う。 */
export function listTicketsBySlot(slotId: number): TicketRow[] {
  const rows = getDb()
    .prepare(`SELECT * FROM tickets WHERE slot_id = ? ORDER BY ticket_number ASC`)
    .all(slotId) as TicketSql[];
  return rows.map(toTicket);
}

/**
 * 再発行: 紛失した物理タグの代替として新タグに書き込んだ後、そのUIDだけを記録する。
 * name/status/定員には一切触れない(新規発行ではなく同一レコードのタグ差し替えのため)。
 * completeTicketName とは意図的に分離する(あちらは「発行」ステップの受付名確定用)。
 */
export function updateTicketUid(ticketNumber: string, uid: string): TicketRow | undefined {
  const ticket = getTicketByNumber(ticketNumber);
  if (!ticket) return undefined;
  getDb().prepare(`UPDATE tickets SET uid = ? WHERE id = ?`).run(uid, ticket.id);
  return getTicket(ticket.id);
}

/** 発行済み(void以外)件数。定員チェックに使用。 */
export function countIssuedForSlot(slotId: number): number {
  const row = getDb()
    .prepare(
      `SELECT COUNT(*) as c FROM tickets WHERE slot_id = ? AND status != 'void'`
    )
    .get(slotId) as { c: number };
  return row.c;
}

export type CheckinResult =
  | "ok"
  | "already"
  | "unknown"
  | "void"
  | "not_issued"
  | "too_early";

/**
 * 整理番号でチェックインを実行する。単一トランザクションで判定・更新する。
 * 判定順序: unknown → void → not_issued → already → too_early → ok。
 * 券の状態(unknown/void/not_issued/already)に関する判定は時刻に依存せず常に優先する。
 * 特に既にチェックイン済みの券を「早すぎます」と案内するのは不適切なので already を先に見る。
 * too_early は「有効・発行済み・未チェックインだが時間帯が早い」場合にのみ意味を持つ最後の関門。
 */
export function checkInTicket(
  ticketNumber: string
): { result: CheckinResult; ticket?: TicketRow; slot?: SlotRow } {
  const database = getDb();
  const run = database.transaction((num: string) => {
    const ticket = getTicketByNumber(num);
    if (!ticket) {
      return { result: "unknown" as const };
    }
    if (ticket.status === "void") {
      return { result: "void" as const, ticket, slot: getSlot(ticket.slotId) };
    }
    if (ticket.name == null || ticket.name === "") {
      // 準備済みだが「発行」(受付名の書込)がまだ完了していない整理券。
      return { result: "not_issued" as const, ticket, slot: getSlot(ticket.slotId) };
    }
    if (ticket.status === "checked_in") {
      return { result: "already" as const, ticket, slot: getSlot(ticket.slotId) };
    }

    const slot = getSlot(ticket.slotId);
    // 開始時刻が設定されている枠のみ、開始5分前より早いチェックインを拒否する。
    // 未設定の枠は従来通り時間制限なしで受理する。
    if (slot?.startTime) {
      const now = new Date();
      const nowMinutes = now.getHours() * 60 + now.getMinutes();
      const startMinutes = parseTimeToMinutes(slot.startTime);
      if (startMinutes !== null && nowMinutes < startMinutes - RECEPTION_GRACE_MINUTES) {
        return { result: "too_early" as const, ticket, slot };
      }
    }

    const now = Date.now();
    database
      .prepare(
        `UPDATE tickets SET status = 'checked_in', checked_in_at = ? WHERE id = ?`
      )
      .run(now, ticket.id);
    const updated = getTicket(ticket.id) as TicketRow;
    return { result: "ok" as const, ticket: updated, slot };
  });
  return run(ticketNumber);
}

// ---- 集計 ----

export interface SlotStat {
  id: number;
  key: string;
  label: string;
  startTime: string | null;
  endTime: string | null;
  capacity: number;
  issued: number;
  checkedIn: number;
  remaining: number;
}

export function getStats(): {
  slots: SlotStat[];
  totals: { capacity: number; issued: number; checkedIn: number; remaining: number };
} {
  const rows = getDb()
    .prepare(
      `SELECT
         s.id as id, s.key as key, s.label as label, s.start_time as start_time,
         s.end_time as end_time, s.capacity as capacity,
         COUNT(t.id) FILTER (WHERE t.status != 'void') as issued,
         COUNT(t.id) FILTER (WHERE t.status = 'checked_in') as checked_in
       FROM slots s
       LEFT JOIN tickets t ON t.slot_id = s.id
       GROUP BY s.id
       ORDER BY s.sort_order ASC, s.start_time ASC, s.id ASC`
    )
    .all() as Array<{
    id: number;
    key: string;
    label: string;
    start_time: string | null;
    end_time: string | null;
    capacity: number;
    issued: number;
    checked_in: number;
  }>;

  const slots: SlotStat[] = rows.map((r) => ({
    id: r.id,
    key: r.key,
    label: r.label,
    startTime: r.start_time,
    endTime: r.end_time,
    capacity: r.capacity,
    issued: r.issued,
    checkedIn: r.checked_in,
    remaining: r.capacity - r.issued,
  }));

  const totals = slots.reduce(
    (acc, s) => ({
      capacity: acc.capacity + s.capacity,
      issued: acc.issued + s.issued,
      checkedIn: acc.checkedIn + s.checkedIn,
      remaining: acc.remaining + s.remaining,
    }),
    { capacity: 0, issued: 0, checkedIn: 0, remaining: 0 }
  );

  return { slots, totals };
}

// ---- settings (key-value) ----

/** 「全整理券発行済み時」に表示する案内コメントの設定キー。 */
export const SETTING_ANNOUNCEMENT = "announcement";

export function getSetting(key: string): string | null {
  const row = getDb().prepare(`SELECT value FROM settings WHERE key = ?`).get(key) as
    | { value: string }
    | undefined;
  return row?.value ?? null;
}

export function setSetting(key: string, value: string): void {
  getDb()
    .prepare(
      `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
    )
    .run(key, value, Date.now());
}
