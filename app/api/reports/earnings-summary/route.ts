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

const NOT_PROVIDED_PAYER = 'Not provided — enter in Shop Settings'
const NOT_PROVIDED_RECIPIENT = 'Not provided — ask this person to enter it in their profile'

function fmt(n: number) {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
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
  let y = 740

  // Disclaimer banner
  page.drawRectangle({ x: margin, y: y - 44, width: width - margin * 2, height: 54, color: rgb(0.98, 0.95, 0.85), borderColor: rgb(0.7, 0.55, 0.1), borderWidth: 1 })
  page.drawText('UNOFFICIAL EARNINGS SUMMARY — NOT A FILED TAX DOCUMENT', {
    x: margin + 10, y: y - 14, size: 11, font: boldFont, color: rgb(0.4, 0.28, 0.05),
  })
  page.drawText('Provided for reference only. Consult a licensed accountant or tax preparer before filing.', {
    x: margin + 10, y: y - 30, size: 9, font, color: rgb(0.4, 0.28, 0.05), maxWidth: width - margin * 2 - 20,
  })
  y -= 80

  page.drawText('Nonemployee Compensation — Reference Summary', { x: margin, y, size: 16, font: boldFont })
  y -= 30

  // Payer section
  page.drawText('PAYER', { x: margin, y, size: 10, font: boldFont, color: rgb(0.4, 0.4, 0.4) })
  y -= 16
  page.drawText(shop?.legal_business_name || `${shop?.name ?? 'Unknown shop'} (${NOT_PROVIDED_PAYER})`, { x: margin, y, size: 11, font })
  y -= 15
  page.drawText(shop?.business_address || NOT_PROVIDED_PAYER, { x: margin, y, size: 11, font })
  y -= 15
  page.drawText(`EIN: ${shop?.ein || NOT_PROVIDED_PAYER}`, { x: margin, y, size: 11, font })
  y -= 32

  // Recipient section
  const displayName = taxInfo?.legal_name || shopBarber?.barber_name || shopBarber?.alias || 'Unknown recipient'
  page.drawText('RECIPIENT', { x: margin, y, size: 10, font: boldFont, color: rgb(0.4, 0.4, 0.4) })
  y -= 16
  page.drawText(displayName, { x: margin, y, size: 11, font })
  y -= 15
  page.drawText(taxInfo?.address || NOT_PROVIDED_RECIPIENT, { x: margin, y, size: 11, font })
  y -= 15
  page.drawText(`TIN: ${taxInfo?.tin || NOT_PROVIDED_RECIPIENT}`, { x: margin, y, size: 11, font })
  y -= 40

  // Box 1
  page.drawRectangle({ x: margin, y: y - 50, width: width - margin * 2, height: 50, borderColor: rgb(0, 0, 0), borderWidth: 1 })
  page.drawText('Box 1 — Nonemployee compensation', { x: margin + 10, y: y - 20, size: 10, font, color: rgb(0.3, 0.3, 0.3) })
  page.drawText(`$${fmt(summary.compensation)}`, { x: margin + 10, y: y - 40, size: 18, font: boldFont })
  y -= 80

  page.drawText(`Period covered: ${startDate} through ${endDate}`, { x: margin, y, size: 10, font, color: rgb(0.3, 0.3, 0.3) })
  y -= 16
  page.drawText(`Generated on: ${now.toISOString().slice(0, 10)}`, { x: margin, y, size: 10, font, color: rgb(0.3, 0.3, 0.3) })

  const bytes = await pdfDoc.save()

  return new NextResponse(Buffer.from(bytes), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="unofficial-1099-${startDate}-to-${endDate}.pdf"`,
    },
  })
}
