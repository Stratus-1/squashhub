import { PDFDocument, StandardFonts, rgb } from 'npm:pdf-lib@1.17.1'

export interface InvoicePdfData {
  clubName: string
  clubEmail?: string | null
  clubPhone?: string | null
  logoUrl?: string | null
  memberName: string
  invoiceNumber?: string | null
  issueDate: string
  dueDate?: string | null
  description: string
  amount: number
  bankName?: string | null
  bankAccountName?: string | null
  bankAccountNumber?: string | null
  bankBranchCode?: string | null
  reference?: string | null
  payNowUrl?: string | null
}

const navy = rgb(0.118, 0.227, 0.373)
const grey = rgb(0.35, 0.38, 0.42)
// Built-in fonts are WinAnsi only: strip anything they cannot draw.
const safe = (s: unknown) => String(s ?? '').replace(/[^\x20-\x7E\u00A0-\u00FF]/g, '')
const money = (n: number) => 'R ' + Number(n || 0).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(/\u00A0/g, ' ')

export async function buildInvoicePdf(d: InvoicePdfData): Promise<Uint8Array> {
  const pdf = await PDFDocument.create()
  const page = pdf.addPage([595, 842])
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const L = 50, R = 545
  let y = 790

  let logoW = 0
  if (d.logoUrl) {
    try {
      const res = await fetch(d.logoUrl, { signal: AbortSignal.timeout(5000) })
      if (res.ok) {
        const bytes = new Uint8Array(await res.arrayBuffer())
        const img = bytes[0] === 0x89 ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes)
        const s = img.scaleToFit(70, 60)
        page.drawImage(img, { x: L, y: y - s.height + 10, width: s.width, height: s.height })
        logoW = s.width + 12
      }
    } catch (_) { /* logo optional */ }
  }
  page.drawText(safe(d.clubName), { x: L + logoW, y, size: 16, font: bold, color: navy })
  const contact = [d.clubEmail, d.clubPhone].filter(Boolean).map(safe).join('  |  ')
  if (contact) page.drawText(contact, { x: L + logoW, y: y - 16, size: 9, font, color: grey })

  page.drawText('INVOICE', { x: R - bold.widthOfTextAtSize('INVOICE', 22), y, size: 22, font: bold, color: navy })
  y -= 80
  page.drawLine({ start: { x: L, y }, end: { x: R, y }, thickness: 1, color: navy })
  y -= 25

  page.drawText('Bill to', { x: L, y, size: 9, font, color: grey })
  page.drawText(safe(d.memberName), { x: L, y: y - 14, size: 12, font: bold })
  const meta: [string, string][] = [
    ['Invoice no.', safe(d.invoiceNumber || '-')],
    ['Invoice date', safe(d.issueDate)],
    ['Due date', safe(d.dueDate || '-')],
  ]
  meta.forEach(([k, v], i) => {
    page.drawText(k, { x: 360, y: y - i * 15, size: 9, font, color: grey })
    page.drawText(v, { x: R - font.widthOfTextAtSize(v, 10), y: y - i * 15, size: 10, font })
  })
  y -= 70

  page.drawRectangle({ x: L, y: y - 6, width: R - L, height: 22, color: navy })
  page.drawText('Description', { x: L + 8, y, size: 10, font: bold, color: rgb(1, 1, 1) })
  page.drawText('Amount', { x: R - 8 - bold.widthOfTextAtSize('Amount', 10), y, size: 10, font: bold, color: rgb(1, 1, 1) })
  y -= 26
  const amt = money(d.amount)
  page.drawText(safe(d.description), { x: L + 8, y, size: 10, font })
  page.drawText(amt, { x: R - 8 - font.widthOfTextAtSize(amt, 10), y, size: 10, font })
  y -= 14
  page.drawLine({ start: { x: L, y }, end: { x: R, y }, thickness: 0.5, color: grey })
  y -= 20
  page.drawText('Total due', { x: 360, y, size: 11, font: bold })
  page.drawText(amt, { x: R - 8 - bold.widthOfTextAtSize(amt, 12), y, size: 12, font: bold, color: navy })
  y -= 50

  page.drawText('How to pay', { x: L, y, size: 12, font: bold, color: navy })
  y -= 18
  const bank: [string, string | null | undefined][] = [
    ['Bank', d.bankName], ['Account name', d.bankAccountName], ['Account number', d.bankAccountNumber],
    ['Branch code', d.bankBranchCode], ['Reference', d.reference],
  ]
  page.drawText('EFT', { x: L, y, size: 10, font: bold })
  y -= 15
  for (const [k, v] of bank) {
    if (!v) continue
    page.drawText(k, { x: L, y, size: 10, font, color: grey })
    page.drawText(safe(v), { x: L + 110, y, size: 10, font })
    y -= 14
  }
  if (d.payNowUrl) {
    y -= 10
    page.drawText('Online', { x: L, y, size: 10, font: bold })
    y -= 15
    page.drawText('Use the "Pay now" button in the email, or sign in and pay from My Account.', { x: L, y, size: 10, font })
    y -= 14
  }

  page.drawText(`Please use invoice number ${safe(d.invoiceNumber || '')} as your payment reference.`, { x: L, y: 70, size: 9, font, color: grey })
  return await pdf.save()
}
