// Server-side consent-form PDF renderer (pdf-lib). Pure layout engine —
// content comes from lib/consent/rules.ts buildConsentSections().
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib'
import {
  type ConsentSection, type Vertical,
  formTitle, legalFooter, STATES,
} from './rules'

const PAGE_W = 612
const PAGE_H = 792
const MARGIN = 54

const OLIVE = rgb(0.36, 0.4, 0.19)
const CHARCOAL = rgb(0.12, 0.12, 0.11)
const GREY = rgb(0.42, 0.42, 0.4)
const LINE = rgb(0.85, 0.84, 0.8)
const WHITE = rgb(1, 1, 1)

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = text.split(/\s+/)
  const lines: string[] = []
  let cur = ''
  for (const w of words) {
    const t = cur ? cur + ' ' + w : w
    if (cur && font.widthOfTextAtSize(t, size) > maxWidth) {
      lines.push(cur)
      cur = w
    } else {
      cur = t
    }
  }
  if (cur) lines.push(cur)
  return lines.length ? lines : ['']
}

interface Ctx {
  doc: PDFDocument
  font: PDFFont
  bold: PDFFont
  page: PDFPage
  y: number
  pageNum: number
  totalPagesHint: string
  footerText: string
  runningHead: string
}

function newPage(ctx: Ctx, first: boolean) {
  ctx.page = ctx.doc.addPage([PAGE_W, PAGE_H])
  ctx.pageNum += 1
  ctx.y = PAGE_H - MARGIN
  if (!first) {
    // Running head on continuation pages
    ctx.page.drawText(ctx.runningHead, {
      x: MARGIN, y: ctx.y, size: 8, font: ctx.font, color: GREY,
    })
    ctx.y -= 18
    ctx.page.drawLine({
      start: { x: MARGIN, y: ctx.y }, end: { x: PAGE_W - MARGIN, y: ctx.y },
      thickness: 0.75, color: LINE,
    })
    ctx.y -= 14
  }
}

function ensureSpace(ctx: Ctx, needed: number) {
  if (ctx.y - needed < MARGIN + 28) {
    drawFooter(ctx)
    newPage(ctx, false)
  }
}

function drawFooter(ctx: Ctx) {
  const lines = wrapText(ctx.footerText, ctx.font, 7, PAGE_W - MARGIN * 2)
  let fy = MARGIN - 8
  // draw from bottom up: last line at bottom
  for (let i = lines.length - 1; i >= 0; i--) {
    ctx.page.drawText(lines[i], { x: MARGIN, y: fy, size: 7, font: ctx.font, color: GREY })
    fy += 9
  }
  // Page numbers ("n / total") are stamped in a post-pass once the total is known.
}

function drawParagraph(ctx: Ctx, text: string, size = 9.5, color = CHARCOAL, indent = 0) {
  const maxW = PAGE_W - MARGIN * 2 - indent
  const lines = wrapText(text, ctx.font, size, maxW)
  ensureSpace(ctx, lines.length * (size + 4) + 6)
  for (const line of lines) {
    ctx.page.drawText(line, { x: MARGIN + indent, y: ctx.y, size, font: ctx.font, color })
    ctx.y -= size + 4
  }
  ctx.y -= 4
}

function drawCheckbox(ctx: Ctx, label: string) {
  const maxW = PAGE_W - MARGIN * 2 - 22
  const lines = wrapText(label, ctx.font, 9.5, maxW)
  ensureSpace(ctx, lines.length * 13.5 + 4)
  const boxY = ctx.y - 9
  ctx.page.drawRectangle({
    x: MARGIN, y: boxY, width: 10, height: 10,
    borderColor: GREY, borderWidth: 1,
  })
  lines.forEach((line, i) => {
    ctx.page.drawText(line, { x: MARGIN + 18, y: ctx.y - i * 13.5, size: 9.5, font: ctx.font, color: CHARCOAL })
  })
  ctx.y -= lines.length * 13.5 + 4
}

function drawField(ctx: Ctx, field: string) {
  // Fill-in line if it ends with ':'; otherwise a small note.
  if (!field.trim().endsWith(':')) {
    drawParagraph(ctx, field, 8, GREY)
    return
  }
  const parts = field.split(/ {2,}/).map(p => p.trim()).filter(Boolean)
  const totalW = PAGE_W - MARGIN * 2
  const partW = totalW / parts.length
  // measure height: one row
  ensureSpace(ctx, 22)
  parts.forEach((part, i) => {
    const x = MARGIN + i * partW
    const label = part
    const tw = ctx.font.widthOfTextAtSize(label, 9.5)
    ctx.page.drawText(label, { x, y: ctx.y, size: 9.5, font: ctx.font, color: GREY })
    const lineStart = x + tw + 6
    const lineEnd = x + partW - (i === parts.length - 1 ? 0 : 10)
    if (lineEnd > lineStart + 8) {
      ctx.page.drawLine({
        start: { x: lineStart, y: ctx.y - 4 }, end: { x: lineEnd, y: ctx.y - 4 },
        thickness: 0.75, color: LINE,
      })
    }
  })
  ctx.y -= 22
}

function drawSection(ctx: Ctx, section: ConsentSection, index: number) {
  ensureSpace(ctx, 44)
  ctx.y -= 2
  const title = `${index} · ${section.title.toUpperCase()}`
  ctx.page.drawText(title, { x: MARGIN, y: ctx.y, size: 10.5, font: ctx.bold, color: OLIVE })
  ctx.y -= 6
  ctx.page.drawLine({
    start: { x: MARGIN, y: ctx.y }, end: { x: PAGE_W - MARGIN, y: ctx.y },
    thickness: 0.75, color: LINE,
  })
  ctx.y -= 12
  for (const p of section.paragraphs) drawParagraph(ctx, p)
  for (const c of section.checkboxes ?? []) drawCheckbox(ctx, c)
  for (const f of section.fields ?? []) drawField(ctx, f)
  ctx.y -= 6
}

export async function generateConsentPdf(opts: {
  shopName: string
  stateCode: string
  vertical: Vertical
  sections: ConsentSection[]
}): Promise<Uint8Array> {
  const { shopName, stateCode, vertical, sections } = opts
  const stateName = STATES.find(s => s.code === stateCode)?.name ?? stateCode

  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)

  const ctx: Ctx = {
    doc, font, bold,
    page: doc.addPage([PAGE_W, PAGE_H]),
    y: PAGE_H - MARGIN,
    pageNum: 0,
    totalPagesHint: '',
    footerText: legalFooter(vertical, stateCode),
    runningHead: `${shopName} — ${formTitle(vertical)}`,
  }
  ctx.pageNum = 1

  // Header band
  const bandH = 64
  ctx.page.drawRectangle({ x: 0, y: PAGE_H - bandH - 12, width: PAGE_W, height: bandH, color: OLIVE })
  let nameSize = 19
  const name = shopName || 'Consent Form'
  while (nameSize > 12 && bold.widthOfTextAtSize(name, nameSize) > PAGE_W - MARGIN * 2) nameSize -= 1
  ctx.page.drawText(name, { x: MARGIN, y: PAGE_H - 38, size: nameSize, font: bold, color: WHITE })
  ctx.page.drawText(formTitle(vertical), { x: MARGIN, y: PAGE_H - 58, size: 10, font: bold, color: WHITE })
  const stateLabel = stateName
  ctx.page.drawText(stateLabel, {
    x: PAGE_W - MARGIN - font.widthOfTextAtSize(stateLabel, 9),
    y: PAGE_H - 40, size: 9, font, color: WHITE,
  })
  ctx.page.drawText('Generated by ChairOS', {
    x: PAGE_W - MARGIN - font.widthOfTextAtSize('Generated by ChairOS', 8),
    y: PAGE_H - 56, size: 8, font, color: WHITE,
  })
  ctx.y = PAGE_H - bandH - 12 - 18

  sections.forEach((s, i) => drawSection(ctx, s, i + 1))
  drawFooter(ctx)

  // Fill page numbers now that we know the total
  const total = ctx.pageNum
  const pages = doc.getPages()
  pages.forEach((p, i) => {
    const label = `${i + 1} / ${total}`
    p.drawText(label, {
      x: PAGE_W - MARGIN - font.widthOfTextAtSize(label, 8),
      y: MARGIN - 8, size: 8, font, color: GREY,
    })
  })

  return doc.save()
}
