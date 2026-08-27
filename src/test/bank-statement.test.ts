import { describe, it, expect } from "vitest";
import {
  detectOpeningBalance,
  parseAmount,
  parseDate,
  parseDelimitedStatement,
  buildRows,
  parseOfx,
  detectDuplicate,
  suggestAccount,
  suggestMember,
  summarise,
  parseTextStatement,
} from "@/lib/finance/bank-statement";

describe("parseAmount", () => {
  it("handles SA and international formats", () => {
    expect(parseAmount("1 234,56")).toBeCloseTo(1234.56);
    expect(parseAmount("R 1,234.56")).toBeCloseTo(1234.56);
    expect(parseAmount("(120.00)")).toBeCloseTo(-120);
    expect(parseAmount("-45")).toBe(-45);
    expect(parseAmount("")).toBeNull();
  });
});

describe("parseDate", () => {
  it("parses common formats day-first", () => {
    expect(parseDate("2026-08-26")).toBe("2026-08-26");
    expect(parseDate("26/08/2026")).toBe("2026-08-26");
    expect(parseDate("26 Aug 2026")).toBe("2026-08-26");
    expect(parseDate("20260826")).toBe("2026-08-26");
    expect(parseDate("nonsense")).toBeNull();
  });
});

const CSV = `Some Bank Ltd Statement
Account 1234567890

Date,Description,Reference,Debit,Credit,Balance
26/08/2026,MONTHLY SERVICE FEE,,"120,00",,"5 000,00"
27/08/2026,SUBS PRETORIUS W,MEM001,,"450,00","5 450,00"
27/08/2026,ESKOM PREPAID,,"1 000,00",,"4 450,00"
`;

describe("delimited statement parsing", () => {
  it("skips preamble, maps columns and signs amounts", () => {
    const parsed = parseDelimitedStatement(CSV);
    expect(parsed.headers[0].toLowerCase()).toBe("date");
    const rows = buildRows(parsed);
    expect(rows).toHaveLength(3);
    expect(rows[0].amount).toBeCloseTo(-120);
    expect(rows[1].amount).toBeCloseTo(450);
    expect(rows[1].reference).toBe("MEM001");
    expect(rows[0].balance).toBeCloseTo(5000);
  });

  it("gives every row a unique fingerprint even when identical", () => {
    const dupCsv = `Date,Description,Amount\n01/08/2026,COFFEE,-50\n01/08/2026,COFFEE,-50\n`;
    const rows = buildRows(parseDelimitedStatement(dupCsv));
    expect(rows[0].fingerprint).not.toBe(rows[1].fingerprint);
  });
});

describe("OFX/QIF", () => {
  it("parses OFX transactions", () => {
    const ofx = `<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260826120000<TRNAMT>-120.00<FITID>abc<NAME>BANK CHARGE</STMTTRN>`;
    const rows = parseOfx(ofx);
    expect(rows).toHaveLength(1);
    expect(rows[0].txn_date).toBe("2026-08-26");
    expect(rows[0].amount).toBeCloseTo(-120);
  });

  it("parses QIF transactions", () => {
    const qif = `!Type:Bank\nD26/08/2026\nT-120.00\nPBANK CHARGE\n^\n`;
    const rows = parseOfx(qif);
    expect(rows[0].description).toBe("BANK CHARGE");
  });
});

describe("duplicate detection", () => {
  const rows = buildRows(parseDelimitedStatement(CSV));
  it("flags exact re-imports", () => {
    const existing = rows.map((r) => ({ ...r }));
    expect(detectDuplicate(rows[0], existing)).toBe("exact");
  });
  it("flags likely duplicates within 7 days", () => {
    const existing = [{ fingerprint: "other", txn_date: "2026-08-22", amount: -120, description: "MONTHLY SERVICE FEE" }];
    expect(detectDuplicate(rows[0], existing)).toBe("likely");
  });
  it("does not flag outside the window", () => {
    const existing = [{ fingerprint: "other", txn_date: "2026-07-01", amount: -120, description: "MONTHLY SERVICE FEE" }];
    expect(detectDuplicate(rows[0], existing)).toBe("none");
  });
});

describe("categorisation", () => {
  const rows = buildRows(parseDelimitedStatement(CSV));
  it("suggests accounts from the narrative", () => {
    expect(suggestAccount(rows[0]).account).toBe("bank_charges");
    expect(suggestAccount(rows[2]).account).toBe("electricity");
    expect(suggestAccount(rows[1]).account).toBe("membership_income");
  });
  it("matches members by number and surname", () => {
    const members = [{ id: "m1", name: "Willem Pretorius", club_member_number: null } as any];
    expect(suggestMember(rows[1], [{ id: "m1", name: "Willem Pretorius" }])).toBe("m1");
    expect(suggestMember(rows[0], members)).toBeNull();
  });
});

describe("summarise", () => {
  it("derives period and opening balance", () => {
    const rows = buildRows(parseDelimitedStatement(CSV));
    const s = summarise(rows);
    expect(s.count).toBe(3);
    expect(s.period_start).toBe("2026-08-26");
    expect(s.period_end).toBe("2026-08-27");
    expect(s.opening_balance).toBeCloseTo(5120);
    expect(s.closing_balance).toBeCloseTo(4450);
  });
});

describe("parseTextStatement (PDF / OCR text)", () => {
  it("parses date + narrative + amount + balance lines", () => {
    const text = [
      "FNB Cheque Account Statement",
      "01 Mar 2026  OPENING BALANCE            12 000.00",
      "03/03/2026  POS PURCHASE SPAR        -250.00   11 750.00",
      "05/03/2026  EFT CREDIT J SMITH        500.00   12 250.00",
      "some footer text",
    ].join("\n");
    const rows = parseTextStatement(text);
    expect(rows.length).toBe(2);
    expect(rows[0].txn_date).toBe("2026-03-03");
    expect(rows[0].amount).toBe(-250);
    expect(rows[0].balance).toBe(11750);
    expect(rows[1].amount).toBe(500);
    expect(rows[1].description).toContain("EFT CREDIT");
  });

  it("uses the running balance to correct a missing minus sign", () => {
    const text = [
      "02/04/2026 CREDIT 1 000.00 5 000.00",
      "03/04/2026 BANK CHARGES 100.00 4 900.00",
    ].join("\n");
    const rows = parseTextStatement(text);
    expect(rows[1].amount).toBe(-100);
  });

  it("fills in a missing year from the fallback", () => {
    const rows = parseTextStatement("12 Jun  CASH DEPOSIT  1 500.00", 2025);
    expect(rows[0].txn_date).toBe("2025-06-12");
  });

  it("ignores lines with no money token", () => {
    expect(parseTextStatement("01/01/2026 Statement period continues").length).toBe(0);
  });
});

describe("parseTextStatement — balance-chain reconciliation", () => {
  it("derives amounts and signs from the running balance", () => {
    const text = [
      "Statement period 01 Mar 2026 to 31 Mar 2026",
      "Opening balance 1 000,00",
      "01 Mar 2026 CLUB FEES JOE   500,00   1 500,00",
      "03 Mar 2026 BALL PURCHASE   250,00   1 250,00",
      "05 Mar 2026 BANK CHARGES   50,00   1 200,00",
    ].join("\n");
    const rows = parseTextStatement(text);
    expect(rows.map((r) => [r.txn_date, r.amount])).toEqual([
      ["2026-03-01", 500],
      ["2026-03-03", -250],
      ["2026-03-05", -50],
    ]);
  });

  it("uses Cr/Dr markers when there is no balance column", () => {
    const rows = parseTextStatement("02/03/2026 EFT IN 1 234,56 Cr\n04/03/2026 EFT OUT 100,00 Dr");
    expect(rows.map((r) => r.amount)).toEqual([1234.56, -100]);
  });

  it("folds wrapped description lines into the previous transaction", () => {
    const rows = parseTextStatement("01 Mar 2026 EFT PAYMENT 100,00\nREF SQUASH CLUB");
    expect(rows).toHaveLength(1);
    expect(rows[0].description).toContain("REF SQUASH CLUB");
  });
});

describe("parseTextStatement — FNB statement layout", () => {
  // Real FNB call-account layout: no year on dates, `Cr` markers instead of
  // signs, and an accrued-bank-charges column printed AFTER the balance.
  const fnb = [
    "Statement Period : 30 April 2026 to 30 July 2026",
    "Opening Balance 4,758.51 Cr Service Fees 450.00 Dr",
    "Closing Balance 10,202.43 Cr",
    "Date Description Amount Balance",
    "02 May FNB App Payment To Broomstix Squash Bane 810.00 3,948.51Cr 45.00",
    "02 May FNB App Payment To Gbay Security 002019 736.11 3,212.40Cr 45.00",
    "27 May Payshap Credit Aam Coetzee & Family 1,260.00Cr 4,472.40Cr",
    "30 May 135.00 4,337.40Cr",
    "On 29 May 2026, the Prime Lending Rate changed to 10.50%.",
  ].join("\n");

  it("reads amounts, signs and the balance column correctly", () => {
    const rows = parseTextStatement(fnb);
    expect(rows.map((r) => [r.txn_date, r.amount, r.balance])).toEqual([
      ["2026-05-02", -810, 3948.51],
      ["2026-05-02", -736.11, 3212.4],
      ["2026-05-27", 1260, 4472.4],
      ["2026-05-30", -135, 4337.4],
    ]);
  });

  it("keeps the reference digits in the description, not in the amount", () => {
    const rows = parseTextStatement(fnb);
    expect(rows[1].description).toContain("002019");
  });

  it("ignores rate footnotes and reconciles to the closing balance", () => {
    const rows = parseTextStatement(fnb);
    const net = rows.reduce((s, r) => s + r.amount, 0);
    expect(Number((4758.51 + net).toFixed(2))).toBe(4337.4);
  });

  it("detects the printed opening balance", () => {
    expect(detectOpeningBalance(fnb)).toBe(4758.51);
  });
  it("still reads the amount column when the opening balance line is missing", () => {
    const noHeader = fnb
      .split("\n")
      .filter((l) => !/opening\s+balance/i.test(l))
      .join("\n");
    expect(detectOpeningBalance(noHeader)).toBeNull();
    const rows = parseTextStatement(noHeader);
    const withBal = parseTextStatement(fnb);
    expect(rows.map((r) => [r.txn_date, r.amount])).toEqual(
      withBal.map((r) => [r.txn_date, r.amount]),
    );
  });
});
