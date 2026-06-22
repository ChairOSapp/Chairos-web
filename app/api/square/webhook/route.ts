import { NextRequest, NextResponse } from 'next/server'
import { createHmac } from 'crypto'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function verifySignature(body: string, signature: string, key: string, url: string): boolean {
  const hash = createHmac('sha256', key)
    .update(url + body)
    .digest('base64')
  return hash === signature
}

export async function POST(req: NextRequest) {
  const body = await req.text()
  const signature = req.headers.get('x-square-hmacsha256-signature') || ''
  const webhookKey = process.env.SQUARE_WEBHOOK_SIGNATURE_KEY

  if (webhookKey) {
    const url = req.url
    if (!verifySignature(body, signature, webhookKey, url)) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
    }
  }

  let event: any
  try {
    event = JSON.parse(body)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (event.type === 'payment.updated') {
    const payment = event.data?.object?.payment
    if (!payment?.id || !payment?.reference_id) {
      return NextResponse.json({ received: true })
    }

    const paymentStatus = payment.status === 'COMPLETED' ? 'paid'
      : payment.status === 'FAILED' ? 'failed'
      : null

    if (paymentStatus) {
      await supabase
        .from('appointments')
        .update({
          payment_status: paymentStatus,
          square_payment_id: payment.id,
          amount_paid: paymentStatus === 'paid'
            ? (payment.amount_money?.amount ? Number(payment.amount_money.amount) / 100 : null)
            : null,
        })
        .eq('id', payment.reference_id)
    }
  }

  return NextResponse.json({ received: true })
}
