import { jsPDF } from "jspdf";
import { autoTable } from "jspdf-autotable";
import shLogo from "@/assets/sh-logo.png";
import { positionWinners, recountFromReceipts } from "./ballot";

export interface AgmResultsPdfInput {
  clubName: string;
  clubLogoUrl?: string | null;
  title: string;
  closedAt: string;
  generatedAt?: Date;
  turnout: { voted: number; eligible: number };
  attendance: { inPerson: string[]; online: string[]; apologies: string[]; noReply: number };
  proxies?: { grantor: string; proxy: string; status: string }[];
  results: any;
}

const fmt = (d: string | Date) =>
  new Date(d).toLocaleString("en-ZA", { timeZone: "Africa/Johannesburg", dateStyle: "long", timeStyle: "short" });

async function toDataUrl(src?: string | null): Promise<{ url: string; w: number; h: number } | null> {
  if (!src) return null;
  try {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = src;
    await img.decode();
    const c = document.createElement("canvas");
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    c.getContext("2d")!.drawImage(img, 0, 0);
    return { url: c.toDataURL("image/png"), w: img.naturalWidth, h: img.naturalHeight };
  } catch { return null; }
}

/** Official AGM record: club + SquashHub header, closure statement, attendance, then results per position. */
export async function buildAgmResultsPdf(input: AgmResultsPdfInput): Promise<jsPDF> {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const M = 15;
  const [club, sh] = await Promise.all([toDataUrl(input.clubLogoUrl), toDataUrl(shLogo)]);
  const fit = (i: { w: number; h: number }, max: number) => { const r = Math.min(max / i.w, max / i.h); return { w: i.w * r, h: i.h * r }; };

  if (club) { const f = fit(club, 22); doc.addImage(club.url, "PNG", M, 12, f.w, f.h); }
  if (sh) { const f = fit(sh, 18); doc.addImage(sh.url, "PNG", W - M - f.w, 14, f.w, f.h); }
  doc.setFont("helvetica", "bold"); doc.setFontSize(16);
  doc.text(input.clubName, W / 2, 20, { align: "center" });
  doc.setFontSize(12); doc.setFont("helvetica", "normal");
  doc.text(`${input.title} — Official voting results`, W / 2, 27, { align: "center" });
  doc.setDrawColor(30, 58, 95); doc.setLineWidth(0.6); doc.line(M, 38, W - M, 38);

  let y = 45;
  doc.setFontSize(10);
  const statement =
    `This election was conducted through the SquashHub independent secret voting system. ` +
    `Each eligible member received a personal one-time voting link, and votes are stored without any link to the voter. ` +
    `Voting closed on ${fmt(input.closedAt)}. No results were visible to anyone — including club officials and administrators — ` +
    `before that time; results became available only from ${fmt(input.closedAt)}, so the outcome could not be influenced ` +
    `while voting was open. The results are as follows.`;
  const lines = doc.splitTextToSize(statement, W - 2 * M);
  doc.text(lines, M, y); y += lines.length * 4.6 + 3;
  doc.setFont("helvetica", "bold");
  doc.text(`Turnout: ${input.turnout.voted} of ${input.turnout.eligible} eligible voters (${input.turnout.eligible ? Math.round((input.turnout.voted / input.turnout.eligible) * 100) : 0}%)`, M, y);
  y += 8;

  // Attendance
  doc.setFontSize(12); doc.text("Meeting attendance", M, y); y += 2;
  const a = input.attendance;
  const rows = Math.max(a.inPerson.length, a.online.length, a.apologies.length, 1);
  autoTable(doc, {
    startY: y, margin: { left: M, right: M },
    head: [[`Attending in person (${a.inPerson.length})`, `Attending online (${a.online.length})`, `Apologies (${a.apologies.length})`]],
    body: Array.from({ length: rows }, (_, i) => [a.inPerson[i] ?? "", a.online[i] ?? "", a.apologies[i] ?? ""]),
    styles: { fontSize: 9 }, headStyles: { fillColor: [30, 58, 95] },
  });
  y = (doc as any).lastAutoTable.finalY + 4;
  doc.setFontSize(9); doc.setFont("helvetica", "normal");
  doc.text(`No reply: ${a.noReply}`, M, y); y += 9;

  const accepted = (input.proxies ?? []).filter((p) => p.status === "accepted");
  if (accepted.length) {
    doc.setFontSize(12); doc.setFont("helvetica", "bold"); doc.text(`Proxies (${accepted.length}) — in-person meeting votes only`, M, y); y += 2;
    autoTable(doc, {
      startY: y, margin: { left: M, right: M }, head: [["Proxy holder", "On behalf of"]],
      body: accepted.map((p) => [p.proxy, p.grantor]), styles: { fontSize: 9 }, headStyles: { fillColor: [30, 58, 95] },
    });
    y = (doc as any).lastAutoTable.finalY + 9;
  }

  // Results
  doc.setFontSize(12); doc.setFont("helvetica", "bold"); doc.text("Voting results", M, y); y += 2;
  for (const p of input.results?.positions ?? []) {
    const seats = p.max_choices ?? 1;
    const { elected, tie } = positionWinners(p.tally, seats);
    const recount = recountFromReceipts(input.results.receipts, p.id);
    const ok = p.tally.every((t: any) => (recount[t.candidate_id] ?? 0) === t.votes) && (recount.abstain ?? 0) === p.abstain;
    const body = [...p.tally].sort((x: any, z: any) => z.votes - x.votes).map((t: any) => [t.name, String(t.votes), elected.includes(t.name) ? "Elected" : ""]);
    body.push(["Abstain", String(p.abstain), ""]);
    autoTable(doc, {
      startY: y + 2, margin: { left: M, right: M },
      head: [[`${p.title}${seats > 1 ? ` (${seats} places)` : ""}`, "Votes", ""]],
      body,
      foot: [[{ colSpan: 3, content: `${elected.length ? `Elected: ${elected.join(", ")}` : "No candidate elected"}${tie.length ? ` · Tie: ${tie.join(", ")}` : ""} · ${ok ? "Recount from receipts matches" : "Recount mismatch — check"}` }]],
      styles: { fontSize: 9 }, headStyles: { fillColor: [30, 58, 95] }, footStyles: { fillColor: [240, 240, 240], textColor: 30, fontStyle: "bold" },
      columnStyles: { 1: { halign: "right", cellWidth: 20 }, 2: { cellWidth: 25, fontStyle: "bold" } },
      showFoot: "lastPage",
    });
    y = (doc as any).lastAutoTable.finalY + 2;
  }

  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i); doc.setFontSize(8); doc.setFont("helvetica", "normal"); doc.setTextColor(120);
    doc.text(`Generated ${fmt(input.generatedAt ?? new Date())} by SquashHub · Page ${i} of ${pages}`, W / 2, doc.internal.pageSize.getHeight() - 8, { align: "center" });
    doc.setTextColor(0);
  }
  return doc;
}
