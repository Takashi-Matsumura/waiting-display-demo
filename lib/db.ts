// SQLite永続化層。better-sqlite3 はネイティブアドオンなので動的requireで読み込み、
// 未導入環境（例: Vercel）でも `next build` が失敗しないようにする（参考: ted-stem-cards/lib/db.ts）。
/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any */
import path from "path";

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
      capacity INTEGER NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS tickets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_number TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      slot_id INTEGER NOT NULL REFERENCES slots(id),
      uid TEXT,
      status TEXT NOT NULL DEFAULT 'issued',
      issued_at INTEGER NOT NULL,
      checked_in_at INTEGER,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_tickets_slot ON tickets(slot_id);
    CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status);
  `);

  return db;
}

export interface SlotRow {
  id: number;
  key: string;
  label: string;
  startTime: string | null;
  capacity: number;
  sortOrder: number;
  createdAt: number;
}

export interface TicketRow {
  id: number;
  ticketNumber: string;
  name: string;
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
  capacity: number;
  sort_order: number;
  created_at: number;
}

interface TicketSql {
  id: number;
  ticket_number: string;
  name: string;
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
  capacity: number;
  sortOrder?: number;
}): SlotRow {
  const now = Date.now();
  const result = getDb()
    .prepare(
      `INSERT INTO slots (key, label, start_time, capacity, sort_order, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(
      input.key,
      input.label,
      input.startTime ?? null,
      input.capacity,
      input.sortOrder ?? 0,
      now
    );
  return getSlot(Number(result.lastInsertRowid)) as SlotRow;
}

export function updateSlot(
  id: number,
  patch: Partial<{ label: string; capacity: number; startTime: string | null }>
): SlotRow | undefined {
  const current = getSlot(id);
  if (!current) return undefined;
  getDb()
    .prepare(
      `UPDATE slots SET label = ?, capacity = ?, start_time = ? WHERE id = ?`
    )
    .run(
      patch.label ?? current.label,
      patch.capacity ?? current.capacity,
      patch.startTime !== undefined ? patch.startTime : current.startTime,
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
  name: string;
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
 */
export function issueTicketWithCapacityCheck(input: {
  ticketNumber: string;
  name: string;
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

export function listTickets(): TicketRow[] {
  const rows = getDb()
    .prepare(`SELECT * FROM tickets ORDER BY created_at DESC`)
    .all() as TicketSql[];
  return rows.map(toTicket);
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

export type CheckinResult = "ok" | "already" | "unknown" | "void";

/** 整理番号でチェックインを実行する。単一トランザクションで判定・更新する。 */
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
    if (ticket.status === "checked_in") {
      return { result: "already" as const, ticket, slot: getSlot(ticket.slotId) };
    }
    const now = Date.now();
    database
      .prepare(
        `UPDATE tickets SET status = 'checked_in', checked_in_at = ? WHERE id = ?`
      )
      .run(now, ticket.id);
    const updated = getTicket(ticket.id) as TicketRow;
    return { result: "ok" as const, ticket: updated, slot: getSlot(ticket.slotId) };
  });
  return run(ticketNumber);
}

// ---- 集計 ----

export interface SlotStat {
  id: number;
  key: string;
  label: string;
  startTime: string | null;
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
         s.capacity as capacity,
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
    capacity: number;
    issued: number;
    checked_in: number;
  }>;

  const slots: SlotStat[] = rows.map((r) => ({
    id: r.id,
    key: r.key,
    label: r.label,
    startTime: r.start_time,
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
