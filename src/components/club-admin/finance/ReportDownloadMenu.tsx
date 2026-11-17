import { Download, FileSpreadsheet, FileText, FileType } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { downloadReportCsv, downloadReportPdf, downloadReportXlsx, type FinancialReport } from "@/lib/finance/report-export";

/** Download just the report (no page chrome) as CSV, Excel or PDF. */
export function ReportDownloadMenu({ build, money, disabled }: { build: () => FinancialReport; money: (n: number) => string; disabled?: boolean }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" variant="outline" disabled={disabled} className="gap-1.5 h-8"><Download className="w-3.5 h-3.5" /> Download</Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => downloadReportPdf(build(), money)}><FileText className="w-3.5 h-3.5 mr-2" /> PDF (for printing)</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => downloadReportXlsx(build())}><FileSpreadsheet className="w-3.5 h-3.5 mr-2" /> Excel</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => downloadReportCsv(build())}><FileType className="w-3.5 h-3.5 mr-2" /> CSV</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
