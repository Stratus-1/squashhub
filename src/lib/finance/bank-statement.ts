/**
 * Bank statement parsing + reconciliation helpers.
 *
 * Supports CSV/TSV exports from SA banks (FNB, ABSA, Standard Bank, Nedbank,
 * Capitec) and basic OFX/QIF files. Pure functions only — no Supabase access —
 * so the whole thing is unit-testable.
 */

export type ParsedBankRow = {
  /** ISO yyyy-MM-dd */
  txn_date: string;
  description: string;
  reference: string | null;
  /** signed: positive = money IN, negative = money OUT */
  amount: number;
  /** running balance if the statement supplies one */
  balance: number | null;
  /** stable duplicate-detection key */
  fingerprint: string;
};

export type ColumnMapping = {
  date: number;
  description: number;
  reference: number | null;
  /** single signed amount column */
  amount: number | null;
  /** OR separate debit/credit columns */
  debit: number | null;
  credit: number | null;
  balance: number | null;
};

export type ParsedStatement = {
  headers: string[];
  rows: string[][];
  mapping: ColumnMapping;
  delimiter: string;
};

const DATE_HEADERS = ["date", "transaction date", "txn date", "posting date", "value date", "effective date"];
const DESC_HEADERS = ["description", "narrative", "details", "transaction description", "memo", "payee"];
const REF_HEADERS = ["reference", "ref", "transaction reference", "your reference", "cheque"];
const AMOUNT_HEADERS = ["amount", "transaction amount", "value"];
const DEBIT_HEADERS = ["debit", "debits", "money out", "withdrawal", "paid out"];
const CREDIT_HEADERS = ["credit", "credits", "money in", "deposit", "paid in"];
const BALANCE_HEADERS = ["balance", "running balance", "closing balance", "bal"];

const norm = (s: string) => s.trim().toLowerCase().replace(/["']/g, "").replace(/\s+/g, " ");

function findCol(headers: string[], candidates: string[]): number | null {
  const h = headers.map(norm);
  for (const c of candidates) {
    const exact = h.indexOf(c);
    if (exact >= 0) return exact;
  }
  for (let i = 0; i < h.length; i++) {
    if (candidates.some((c) => h[i].includes(c))) return i;
  }
  return null;
}

/** Split a delimited line respecting double quotes. */
export function splitLine(line: string, delimiter: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else inQuotes = !inQuotes;
    } else if (ch === delimiter && !inQuotes) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out.map((v) => v.trim().replace(/^"|"$/g, ""));
}

function detectDelimiter(sample: string): string {
  const counts: Record<string, number> = { ",": 0, ";": 0, "\t": 0, "|": 0 };
  for (const d of Object.keys(counts)) counts[d] = (sample.match(new RegExp(`\\${d === "\t" ? "t" : d}`, "g")) || []).length;
  const tabs = (sample.match(/\t/g) || []).length;
  counts["\t"] = tabs;
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][1] > 0
    ? Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0]
    : ",";
}

/** Parse an amount like "1 234,56", "(120.00)", "R 1,234.56", "-45.00". */
export function parseAmount(raw: string | undefined | null): number | null {
  if (raw == null) return null;
  let s = String(raw).trim();
  if (!s) return null;
  let neg = false;
  if (/^\(.*\)$/.test(s)) {
    neg = true;
    s = s.slice(1, -1);
  }
  s = s.replace(/[Rr]\s?|ZAR|\s|\u00a0/g, "");
  if (s.startsWith("-")) {
    neg = true;
    s = s.slice(1);
  } else if (s.startsWith("+")) s = s.slice(1);
  // Decide decimal separator: last of , or . wins when both present
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  if (lastComma >= 0 && lastDot >= 0) {
    if (lastComma > lastDot) s = s.replace(/\./g, "").replace(",", ".");
    else s = s.replace(/,/g, "");
  } else if (lastComma >= 0) {
    // comma is decimal only when it has <=2 trailing digits
    s = s.length - lastComma - 1 <= 2 ? s.replace(",", ".") : s.replace(/,/g, "");
  }
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return neg ? -n : n;
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

/** Parse common SA/ISO date formats into yyyy-MM-dd. Day-first is assumed for ambiguous d/m/y. */
export function parseDate(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const s = String(raw).trim();
  if (!s) return null;
  const pad = (n: number) => String(n).padStart(2, "0");
  const mk = (y: number, m: number, d: number) => {
    if (y < 100) y += y > 70 ? 1900 : 2000;
    if (m < 1 || m > 12 || d < 1 || d > 31) return null;
    return `${y}-${pad(m)}-${pad(d)}`;
  };
  let m: RegExpMatchArray | null;
  if ((m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/))) return mk(+m[1], +m[2], +m[3]);
  if ((m = s.match(/^(\d{8})$/))) return mk(+m[1].slice(0, 4), +m[1].slice(4, 6), +m[1].slice(6, 8));
  if ((m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/))) {
    let d = +m[1];
    let mo = +m[2];
    if (d <= 12 && mo > 12) [d, mo] = [mo, d];
    return mk(+m[3], mo, d);
  }
  if ((m = s.match(/^(\d{1,2})[\s-]([A-Za-z]{3,})[\s-](\d{2,4})/))) {
    const mo = MONTHS[m[2].slice(0, 3).toLowerCase()];
    return mo ? mk(+m[3], mo, +m[1]) : null;
  }
  if ((m = s.match(/^([A-Za-z]{3,})[\s-](\d{1,2}),?[\s-](\d{2,4})/))) {
    const mo = MONTHS[m[1].slice(0, 3).toLowerCase()];
    return mo ? mk(+m[3], mo, +m[2]) : null;
  }
  const d = new Date(s);
  if (!isNaN(d.getTime())) return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  return null;
}

/**
 * Split raw file text into a header row + data rows and guess the column mapping.
 * Preamble lines (bank blurb before the real header) are skipped.
 */
export function parseDelimitedStatement(text: string): ParsedStatement {
  const lines = text.split(/\r\n|\r|\n/).filter((l) => l.trim().length > 0);
  const delimiter = detectDelimiter(lines.slice(0, 20).join("\n"));
  // find the header row: the first line whose cells look like a date+amount header set
  let headerIdx = 0;
  for (let i = 0; i < Math.min(lines.length, 25); i++) {
    const cells = splitLine(lines[i], delimiter);
    if (cells.length < 2) continue;
    const hasDate = findCol(cells, DATE_HEADERS) !== null;
    const hasMoney =
      findCol(cells, AMOUNT_HEADERS) !== null ||
      findCol(cells, DEBIT_HEADERS) !== null ||
      findCol(cells, CREDIT_HEADERS) !== null;
    if (hasDate && hasMoney) {
      headerIdx = i;
      break;
    }
  }
  const headers = splitLine(lines[headerIdx], delimiter);
  const rows = lines
    .slice(headerIdx + 1)
    .map((l) => splitLine(l, delimiter))
    .filter((r) => r.some((c) => c !== ""));

  const mapping: ColumnMapping = {
    date: findCol(headers, DATE_HEADERS) ?? 0,
    description: findCol(headers, DESC_HEADERS) ?? 1,
    reference: findCol(headers, REF_HEADERS),
    amount: findCol(headers, AMOUNT_HEADERS),
    debit: findCol(headers, DEBIT_HEADERS),
    credit: findCol(headers, CREDIT_HEADERS),
    balance: findCol(headers, BALANCE_HEADERS),
  };
  if (mapping.amount === null && mapping.debit === null && mapping.credit === null) {
    // fall back: last numeric-looking column that isn't the balance
    for (let i = headers.length - 1; i >= 0; i--) {
      if (i === mapping.balance) continue;
      if (rows.some((r) => parseAmount(r[i]) !== null)) {
        mapping.amount = i;
        break;
      }
    }
  }
  return { headers, rows, mapping, delimiter };
}

export function makeFingerprint(clubIdSalt: string, r: { txn_date: string; description: string; amount: number }, occurrence: number): string {
  const desc = norm(r.description).replace(/[^a-z0-9 ]/g, "").slice(0, 60);
  return `${r.txn_date}|${desc}|${r.amount.toFixed(2)}|${occurrence}`;
}

/** Turn raw rows + mapping into normalised bank rows (invalid rows are dropped). */
export function buildRows(parsed: ParsedStatement, mapping: ColumnMapping = parsed.mapping): ParsedBankRow[] {
  const seen = new Map<string, number>();
  const out: ParsedBankRow[] = [];
  for (const r of parsed.rows) {
    const txn_date = parseDate(r[mapping.date]);
    if (!txn_date) continue;
    let amount: number | null = null;
    if (mapping.amount !== null) amount = parseAmount(r[mapping.amount]);
    if (amount === null || amount === 0) {
      const dr = mapping.debit !== null ? parseAmount(r[mapping.debit]) : null;
      const cr = mapping.credit !== null ? parseAmount(r[mapping.credit]) : null;
      if (dr || cr) amount = (cr ? Math.abs(cr) : 0) - (dr ? Math.abs(dr) : 0);
    }
    if (amount === null || !Number.isFinite(amount)) continue;
    const description = (r[mapping.description] || "").trim();
    const base = { txn_date, description, amount };
    const key = `${txn_date}|${norm(description)}|${amount.toFixed(2)}`;
    const occ = (seen.get(key) ?? -1) + 1;
    seen.set(key, occ);
    out.push({
      ...base,
      reference: mapping.reference !== null ? (r[mapping.reference] || "").trim() || null : null,
      balance: mapping.balance !== null ? parseAmount(r[mapping.balance]) : null,
      fingerprint: makeFingerprint("", base, occ),
    });
  }
  return out.sort((a, b) => a.txn_date.localeCompare(b.txn_date));
}

/** Minimal OFX / QIF support — returns rows directly. */
export function parseOfx(text: string): ParsedBankRow[] {
  const rows: ParsedBankRow[] = [];
  const seen = new Map<string, number>();
  const push = (txn_date: string, description: string, amount: number, reference: string | null) => {
    const key = `${txn_date}|${norm(description)}|${amount.toFixed(2)}`;
    const occ = (seen.get(key) ?? -1) + 1;
    seen.set(key, occ);
    rows.push({
      txn_date,
      description,
      amount,
      reference,
      balance: null,
      fingerprint: makeFingerprint("", { txn_date, description, amount }, occ),
    });
  };

  if (/<STMTTRN>/i.test(text)) {
    const blocks = text.split(/<STMTTRN>/i).slice(1);
    for (const b of blocks) {
      const tag = (name: string) => {
        const m = b.match(new RegExp(`<${name}>([^<\r\n]*)`, "i"));
        return m ? m[1].trim() : "";
      };
      const date = parseDate(tag("DTPOSTED").slice(0, 8));
      const amount = parseAmount(tag("TRNAMT"));
      if (!date || amount === null) continue;
      const desc = tag("NAME") || tag("MEMO") || "Bank transaction";
      push(date, desc, amount, tag("FITID") || null);
    }
    return rows.sort((a, b) => a.txn_date.localeCompare(b.txn_date));
  }

  // QIF
  let cur: { d?: string; a?: number; p?: string; m?: string } = {};
  for (const line of text.split(/\r\n|\r|\n/)) {
    const code = line[0];
    const val = line.slice(1).trim();
    if (code === "D") cur.d = parseDate(val) || undefined;
    else if (code === "T" || code === "U") cur.a = parseAmount(val) ?? undefined;
    else if (code === "P") cur.p = val;
    else if (code === "M") cur.m = val;
    else if (line.trim() === "^") {
      if (cur.d && cur.a !== undefined) push(cur.d, cur.p || cur.m || "Bank transaction", cur.a, null);
      cur = {};
    }
  }
  return rows.sort((a, b) => a.txn_date.localeCompare(b.txn_date));
}

/* ─── Duplicate detection ─── */

export type ExistingTxn = { fingerprint: string; txn_date: string; amount: number; description: string };

export type DuplicateFlag = "none" | "exact" | "likely";

const DAY = 86400000;

export function daysBetween(a: string, b: string): number {
  return Math.abs(new Date(`${a}T00:00:00Z`).getTime() - new Date(`${b}T00:00:00Z`).getTime()) / DAY;
}

/**
 * "exact" = same fingerprint already imported.
 * "likely" = same amount and similar description within a ±7 day window.
 */
export function detectDuplicate(row: ParsedBankRow, existing: ExistingTxn[], windowDays = 7): DuplicateFlag {
  if (existing.some((e) => e.fingerprint === row.fingerprint)) return "exact";
  const d = norm(row.description).slice(0, 20);
  const hit = existing.some(
    (e) =>
      Math.abs(Number(e.amount) - row.amount) < 0.005 &&
      daysBetween(e.txn_date, row.txn_date) <= windowDays &&
      (d.length === 0 || norm(e.description).slice(0, 20) === d),
  );
  return hit ? "likely" : "none";
}

/* ─── Auto-categorisation ─── */

export type AccountGuess = { account: string; confidence: "high" | "low" };

const RULES: Array<{ re: RegExp; account: string; sign?: "in" | "out" }> = [
  { re: /bank charge|service fee|admin fee|monthly fee|cash dep fee|fee:/i, account: "bank_charges", sign: "out" },
  { re: /yoco|stitch|payfast|card fee|merchant fee/i, account: "gateway_fees", sign: "out" },
  { re: /eskom|electric|prepaid meter|city power|municipal/i, account: "electricity", sign: "out" },
  { re: /rent|lease/i, account: "rent", sign: "out" },
  { re: /repair|maintenance|plumb|paint|court resurf|garden/i, account: "maintenance", sign: "out" },
  { re: /liquor|bottle store|makro|bar stock|beverage|coca ?cola|drinks/i, account: "bar_expense", sign: "out" },
  { re: /squash sa|ssa|nsa|association|federation|league fee/i, account: "national_body_expense", sign: "out" },
  { re: /sub(scription)?|membership|member fee|annual fee/i, account: "membership_income", sign: "in" },
  { re: /tournament|champs|championship/i, account: "tournament_income", sign: "in" },
  { re: /light|court light/i, account: "light_fees_income", sign: "in" },
  { re: /bar|tab|honesty/i, account: "bar_income", sign: "in" },
];

export function suggestAccount(row: ParsedBankRow): AccountGuess {
  const text = `${row.description} ${row.reference || ""}`;
  const isIn = row.amount > 0;
  for (const r of RULES) {
    if (!r.re.test(text)) continue;
    if (r.sign === "in" && !isIn) continue;
    if (r.sign === "out" && isIn) continue;
    return { account: r.account, confidence: "high" };
  }
  return { account: isIn ? "fee_income" : "general_expense", confidence: "low" };
}

/** Fuzzy member match on the narrative (surname / initials + surname / member number). */
export function suggestMember(
  row: ParsedBankRow,
  members: Array<{ id: string; name: string; member_number?: string | null }>,
): string | null {
  const text = norm(`${row.description} ${row.reference || ""}`);
  if (!text) return null;
  for (const m of members) {
    const num = (m.member_number || "").trim();
    if (num.length >= 3 && text.includes(num.toLowerCase())) return m.id;
  }
  let best: { id: string; score: number } | null = null;
  for (const m of members) {
    const parts = norm(m.name).split(" ").filter((p) => p.length >= 3);
    if (!parts.length) continue;
    const surname = parts[parts.length - 1];
    if (!text.includes(surname)) continue;
    const score = parts.filter((p) => text.includes(p)).length;
    if (!best || score > best.score) best = { id: m.id, score };
  }
  return best ? best.id : null;
}

/** Statement summary for the import header row. */
export function summarise(rows: ParsedBankRow[]) {
  const money_in = rows.filter((r) => r.amount > 0).reduce((s, r) => s + r.amount, 0);
  const money_out = rows.filter((r) => r.amount < 0).reduce((s, r) => s + r.amount, 0);
  const withBal = rows.filter((r) => r.balance !== null);
  const closing = withBal.length ? withBal[withBal.length - 1].balance : null;
  const firstBal = withBal.length ? withBal[0].balance : null;
  const opening = firstBal !== null && withBal.length ? firstBal - withBal[0].amount : null;
  return {
    count: rows.length,
    period_start: rows.length ? rows[0].txn_date : null,
    period_end: rows.length ? rows[rows.length - 1].txn_date : null,
    money_in,
    money_out,
    opening_balance: opening,
    closing_balance: closing,
  };
}
