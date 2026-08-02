// Parses pasted TSV/CSV blocks of club contacts into prospect + contact rows.

export interface ParsedRow {
  index: number;
  club_name: string;
  association: string;
  city: string;
  country: string;
  courts: number | null;
  website: string;
  is_nsa: boolean;
  source: string;
  tags: string[];
  notes: string;
  contact_name: string;
  role: string;
  email: string;
  phone: string;
  problems: string[];
  include: boolean;
}

const HEADER_ALIASES: Record<string, string> = {
  club: "club_name",
  club_name: "club_name",
  clubname: "club_name",
  "club name": "club_name",
  association: "association",
  province: "association",
  region: "association",
  league: "association",
  city: "city",
  town: "city",
  country: "country",
  courts: "courts",
  "no of courts": "courts",
  website: "website",
  url: "website",
  site: "website",
  nsa: "is_nsa",
  is_nsa: "is_nsa",
  "nsa affiliated": "is_nsa",
  source: "source",
  tags: "tags",
  tag: "tags",
  notes: "notes",
  note: "notes",
  comment: "notes",
  name: "contact_name",
  contact: "contact_name",
  contact_name: "contact_name",
  "contact name": "contact_name",
  person: "contact_name",
  role: "role",
  position: "role",
  title: "role",
  email: "email",
  "e-mail": "email",
  "email address": "email",
  phone: "phone",
  cell: "phone",
  mobile: "phone",
  telephone: "phone",
  tel: "phone",
};

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/;

function splitLine(line: string, delim: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { cur += '"'; i++; }
      else inQuotes = !inQuotes;
} else if (ch === delim && !inQuotes) {
      out.push(cur); cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

function detectDelimiter(headerLine: string): string {
  const tabs = (headerLine.match(/\t/g) || []).length;
  const semis = (headerLine.match(/;/g) || []).length;
  const commas = (headerLine.match(/,/g) || []).length;
  if (tabs >= semis && tabs >= commas && tabs > 0) return "\t";
  if (semis > commas) return ";";
  return ",";
}

function truthy(v: string) {
  return /^(y|yes|true|1|nsa|affiliated)$/i.test(v.trim());
}

export function parseProspectPaste(raw: string, defaults?: { country?: string; tags?: string[]; source?: string }): {
  rows: ParsedRow[];
  headerFound: boolean;
  unmappedHeaders: string[];
} {
  const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (!lines.length) return { rows: [], headerFound: false, unmappedHeaders: [] };

  const delim = detectDelimiter(lines[0]);
  const rawHeaders = splitLine(lines[0], delim).map((h) => h.toLowerCase().replace(/^"|"$/g, "").trim());
  const mapped = rawHeaders.map((h) => HEADER_ALIASES[h] ?? null);
  const headerFound = mapped.filter(Boolean).length >= 2;
  const unmappedHeaders = headerFound ? rawHeaders.filter((_, i) => !mapped[i]) : [];

  const bodyLines = headerFound ? lines.slice(1) : lines;
  const cols = headerFound
    ? mapped
    : ["club_name", "contact_name", "role", "email", "phone"]; // positional fallback

  const seenEmails = new Set<string>();
  const rows: ParsedRow[] = bodyLines.map((line, i) => {
    const cells = splitLine(line, delim);
    const get = (field: string) => {
      const idx = cols.indexOf(field);
      return idx >= 0 ? (cells[idx] ?? "").replace(/^"|"$/g, "").trim() : "";
    };

    const email = get("email").toLowerCase();
    const tagsRaw = get("tags");
    const problems: string[] = [];
    const clubName = get("club_name");

    if (!clubName) problems.push("Missing club name");
    if (!email) problems.push("Missing email");
    else if (!EMAIL_RE.test(email)) problems.push("Email looks invalid");
    else if (seenEmails.has(email)) problems.push("Duplicate email in this paste");
    if (email && EMAIL_RE.test(email)) seenEmails.add(email);

    const courtsRaw = get("courts");
    const courts = courtsRaw && /^\d+$/.test(courtsRaw) ? Number(courtsRaw) : null;

    return {
      index: i,
      club_name: clubName,
      association: get("association"),
      city: get("city"),
      country: get("country") || defaults?.country || "South Africa",
      courts,
      website: get("website"),
      is_nsa: truthy(get("is_nsa")),
      source: get("source") || defaults?.source || "",
      tags: [
        ...(tagsRaw ? tagsRaw.split(/[|,;]/).map((t) => t.trim()).filter(Boolean) : []),
        ...(defaults?.tags ?? []),
      ].filter((t, idx, arr) => arr.indexOf(t) === idx),
      notes: get("notes"),
      contact_name: get("contact_name"),
      role: get("role"),
      email,
      phone: get("phone"),
      problems,
      include: problems.length === 0,
    };
  });

  return { rows, headerFound, unmappedHeaders };
}

export const IMPORT_TEMPLATE_HEADER =
  "club_name\tassociation\tcity\tcountry\tcourts\twebsite\tnsa\tcontact_name\trole\temail\tphone\ttags\tnotes";

export function toCsv(rows: Record<string, unknown>[], columns: string[]): string {
  const esc = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [columns.join(","), ...rows.map((r) => columns.map((c) => esc(r[c])).join(","))].join("\n");
}
