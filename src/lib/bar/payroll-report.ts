import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export interface PayrollReportLine { name: string; basis?: string; quantity?: string; salary: number; tips: number }

const r = (n: number) => `R ${n.toFixed(2)}`;

/** Paymaster report: what must be paid to each staff member for the month. */
export function downloadPayrollReport(monthLabel: string, lines: PayrollReportLine[], processedOn = new Date()) {
  const doc = new jsPDF();
  doc.setFontSize(14);
  doc.text(`Bar staff payroll — ${monthLabel}`, 14, 16);
  doc.setFontSize(9);
  doc.text(`Paymaster report · processed ${processedOn.toLocaleDateString("en-ZA")} · salaries and tips recorded under Cost of sales — Bar`, 14, 22);
  const paid = lines.filter(l => l.salary > 0 || l.tips > 0);
  const salary = paid.reduce((s, l) => s + l.salary, 0);
  const tips = paid.reduce((s, l) => s + l.tips, 0);
  autoTable(doc, {
    startY: 28,
    head: [["Staff member", "Basis", "Hours / shifts", "Salary", "Tips", "Total to pay"]],
    body: paid.map(l => [l.name, l.basis ?? "", l.quantity ?? "", r(l.salary), r(l.tips), r(l.salary + l.tips)]),
    foot: [["Total", "", "", r(salary), r(tips), r(salary + tips)]],
    styles: { fontSize: 9 },
    columnStyles: { 3: { halign: "right" }, 4: { halign: "right" }, 5: { halign: "right" } },
  });
  doc.save(`bar-payroll-${monthLabel.replace(/\s+/g, "-").toLowerCase()}.pdf`);
}
