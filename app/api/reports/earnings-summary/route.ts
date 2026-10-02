import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import { computeEarningsSummary } from '@/lib/earningsSummary'

function getAdminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

async function getRequestUser(req: NextRequest) {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll() {},
      },
    }
  )
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

function fmt(n: number) {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// Clean up raw address strings for a formal document: title-case words and
// uppercase a trailing two-letter state code ("123 main st jacksonville, fl."
// -> "123 Main St Jacksonville, FL."). Missing data stays a plain
// "Not provided" -- prompts to fill in profile info belong in the app UI,
// never printed on someone's tax paperwork.
function prettyAddress(s: string | null | undefined): string {
  if (!s || !s.trim()) return 'Not provided'
  const titled = s.trim().toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())
  return titled.replace(/,\s*([A-Za-z]{2})\.?\s*$/, (_, st: string) => `, ${st.toUpperCase()}.`)
}

// Generates an unofficial, 1099-NEC-shaped earnings summary PDF. Two
// legitimate requesters: the barber themselves, or the owner of the shop
// that barber has (or had) a shop_barbers membership at -- checked without
// an active=true filter so a since-departed staffer's owner can still pull
// their report for the year they worked.
export async function POST(req: NextRequest) {
  const user = await getRequestUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null)
  const shopId = body?.shopId as string | undefined
  const barberId = body?.barberId as string | undefined
  const now = new Date()
  const currentYear = now.getFullYear()
  const startDate = (body?.startDate as string) || `${currentYear}-01-01`
  const endDate = (body?.endDate as string) || `${currentYear}-12-31`

  if (!shopId || !barberId) {
    return NextResponse.json({ error: 'shopId and barberId are required' }, { status: 400 })
  }

  const supabase = getAdminSupabase()

  const isSelf = user.id === barberId
  if (!isSelf) {
    const { data: shop } = await supabase.from('shops').select('owner_id').eq('id', shopId).maybeSingle()
    if (shop?.owner_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    const { data: membership } = await supabase
      .from('shop_barbers')
      .select('id')
      .eq('shop_id', shopId)
      .eq('barber_id', barberId)
      .maybeSingle()
    if (!membership) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  }

  const [{ data: shop }, { data: taxInfo }, summary] = await Promise.all([
    supabase.from('shops').select('name, legal_business_name, business_address, ein').eq('id', shopId).maybeSingle(),
    supabase.from('staff_tax_info').select('legal_name, address, tin').eq('barber_id', barberId).maybeSingle(),
    computeEarningsSummary(supabase, shopId, barberId, startDate, endDate),
  ])

  const { data: shopBarber } = await supabase
    .from('shop_barbers')
    .select('barber_name, alias')
    .eq('shop_id', shopId)
    .eq('barber_id', barberId)
    .maybeSingle()

  const pdfDoc = await PDFDocument.create()
  const page = pdfDoc.addPage([612, 792])
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold)
  const { width } = page.getSize()
  const margin = 50

  const OLIVE = rgb(0.48, 0.55, 0.23)
  const CHARCOAL = rgb(0.09, 0.09, 0.10)
  const WHITE = rgb(1, 1, 1)
  const GREY = rgb(0.38, 0.38, 0.38)
  const LIGHT_GREY = rgb(0.55, 0.55, 0.55)

  // --- Brand header band: the SHOP's document. ChairOS moves to a
  // "Powered by" line in the footer.
  const headerShopName = shop?.legal_business_name || shop?.name || 'Earnings Summary'
  page.drawRectangle({ x: 0, y: 712, width, height: 80, color: CHARCOAL })
  let shopNameSize = 22
  const maxNameW = width - margin * 2 - 80
  while (shopNameSize > 14 && boldFont.widthOfTextAtSize(headerShopName, shopNameSize) > maxNameW) shopNameSize -= 2
  page.drawText(headerShopName, { x: margin, y: 750, size: shopNameSize, font: boldFont, color: WHITE })
  page.drawText('Earnings Summary', { x: margin, y: 728, size: 13, font, color: OLIVE })
  const yearLabel = `${startDate.slice(0, 4)}`
  const yearWidth = boldFont.widthOfTextAtSize(yearLabel, 13)
  page.drawText(yearLabel, { x: width - margin - yearWidth, y: 742, size: 13, font: boldFont, color: WHITE })

  let y = 688

  // --- Disclaimer banner ---
  page.drawRectangle({
    x: margin, y: y - 52, width: width - margin * 2, height: 62,
    color: rgb(0.99, 0.96, 0.88), borderColor: rgb(0.75, 0.60, 0.20), borderWidth: 1,
  })
  page.drawText('UNOFFICIAL EARNINGS SUMMARY — NOT A FILED TAX DOCUMENT', {
    x: margin + 12, y: y - 14, size: 10, font: boldFont, color: rgb(0.45, 0.32, 0.08),
  })
  page.drawText('Provided for reference only. Amounts reflect ChairOS-recorded', {
    x: margin + 12, y: y - 30, size: 9, font, color: rgb(0.45, 0.32, 0.08),
  })
  page.drawText('transactions only. Consult a licensed accountant or tax preparer before filing.', {
    x: margin + 12, y: y - 42, size: 9, font, color: rgb(0.45, 0.32, 0.08),
  })
  y -= 84

  // --- Title ---
  page.drawText('Nonemployee Compensation', { x: margin, y, size: 17, font: boldFont, color: CHARCOAL })
  y -= 18
  page.drawText('Reference summary in the shape of IRS Form 1099-NEC', { x: margin, y, size: 10, font, color: GREY })
  y -= 30

  // --- Payer ---
  page.drawText('PAYER', { x: margin, y, size: 10, font: boldFont, color: LIGHT_GREY })
  y -= 16
  page.drawText(shop?.legal_business_name || shop?.name || 'Not provided', { x: margin, y, size: 11, font, color: CHARCOAL })
  y -= 15
  page.drawText(prettyAddress(shop?.business_address), { x: margin, y, size: 11, font, color: CHARCOAL })
  y -= 15
  page.drawText(`EIN: ${shop?.ein || 'Not provided'}`, { x: margin, y, size: 11, font, color: CHARCOAL })
  y -= 32

  // --- Recipient ---
  const displayName = taxInfo?.legal_name || shopBarber?.barber_name || shopBarber?.alias || 'Not provided'
  page.drawText('RECIPIENT', { x: margin, y, size: 10, font: boldFont, color: LIGHT_GREY })
  y -= 16
  page.drawText(displayName, { x: margin, y, size: 11, font, color: CHARCOAL })
  y -= 15
  page.drawText(prettyAddress(taxInfo?.address), { x: margin, y, size: 11, font, color: CHARCOAL })
  y -= 15
  page.drawText(`TIN: ${taxInfo?.tin || 'Not provided'}`, { x: margin, y, size: 11, font, color: CHARCOAL })
  y -= 32

  // --- Box 1: compensation ---
  const serviceComp = summary.compensation - summary.totalTips
  page.drawRectangle({
    x: margin, y: y - 58, width: width - margin * 2, height: 58,
    borderColor: CHARCOAL, borderWidth: 1.5,
  })
  page.drawRectangle({ x: margin, y: y - 58, width: 6, height: 58, color: OLIVE, borderColor: OLIVE })
  page.drawText('Box 1 — Nonemployee compensation', { x: margin + 16, y: y - 20, size: 10, font, color: GREY })
  page.drawText(`$${fmt(summary.compensation)}`, { x: margin + 16, y: y - 44, size: 20, font: boldFont, color: CHARCOAL })
  y -= 74
  page.drawText(`Service compensation: $${fmt(serviceComp)}`, { x: margin, y, size: 10, font, color: GREY })
  y -= 15
  page.drawText(`Tips included: $${fmt(summary.totalTips)}`, { x: margin, y, size: 10, font, color: GREY })
  y -= 15
  if (summary.compensationType === 'commission' && summary.commissionRate != null) {
    page.drawText(`Commission rate: ${Math.round(summary.commissionRate * 100)}%`, { x: margin, y, size: 10, font, color: GREY })
    y -= 15
  }
  page.drawText(`${summary.appointmentCount} completed appointments`, { x: margin, y, size: 10, font, color: GREY })
  y -= 15
  // How clients paid: cash and off-Square income still counts toward the
  // 1099 — shown separately so the records are complete.
  const pm = summary.serviceRevenueByMethod
  page.drawText(`Paid by card: $${fmt(pm.square)}  ·  Cash: $${fmt(pm.cash)}  ·  Other: $${fmt(pm.other)}`, { x: margin, y, size: 9, font, color: GREY })
  y -= 13

  // --- Box 4: withholding (ChairOS never withholds; shown for 1099 parity) ---
  page.drawText('Box 4 — Federal income tax withheld', { x: margin, y, size: 10, font: boldFont, color: CHARCOAL })
  y -= 15
  page.drawText('$0.00  (ChairOS does not withhold taxes)', { x: margin, y, size: 10, font, color: GREY })
  y -= 28

  // --- Booth rent paid: the other half of a renter's tax picture ---
  if (summary.compensationType === 'booth_rent') {
    page.drawRectangle({
      x: margin, y: y - 58, width: width - margin * 2, height: 58,
      borderColor: rgb(0.75, 0.75, 0.75), borderWidth: 1,
    })
    page.drawText('Booth rent paid', { x: margin + 12, y: y - 20, size: 10, font, color: GREY })
    page.drawText(`$${fmt(summary.boothRentPaid)}`, { x: margin + 12, y: y - 44, size: 20, font: boldFont, color: CHARCOAL })
    y -= 74
    page.drawText('Rent paid is generally a deductible business expense — keep this with your records.', {
      x: margin, y, size: 10, font, color: GREY,
    })
    y -= 28
  }

  // --- Footer ---
  page.drawText(`Period covered: ${startDate} through ${endDate}`, { x: margin, y, size: 10, font, color: GREY })
  y -= 16
  page.drawText(`Generated on ${now.toISOString().slice(0, 10)}`, { x: margin, y, size: 10, font, color: GREY })
  y -= 16
  page.drawText('Questions about these amounts? Contact the shop directly.', { x: margin, y, size: 10, font, color: GREY })
  y -= 40
  const poweredBy = 'Powered by ChairOS'
  const poweredByW = font.widthOfTextAtSize(poweredBy, 10)
  page.drawText(poweredBy, { x: (width - poweredByW) / 2, y, size: 10, font: boldFont, color: OLIVE })

  const bytes = await pdfDoc.save()

  return new NextResponse(Buffer.from(bytes), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="chairos-earnings-summary-${startDate}-to-${endDate}.pdf"`,
    },
  })
}
