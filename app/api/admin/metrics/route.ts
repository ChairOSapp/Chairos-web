import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import Stripe from 'stripe'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

const ADMIN_EMAILS = [
  ...(process.env.ADMIN_EMAIL ? [process.env.ADMIN_EMAIL] : []),
  'tbbryant07@gmail.com',
]

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

export async function GET(req: NextRequest) {
  const user = await getRequestUser(req)
  if (!user?.email || !ADMIN_EMAILS.includes(user.email)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const supabase = getAdminSupabase()
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2026-05-27.dahlia' as any })

  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59)

  // Supabase: new signups this month
  const [{ count: newSignups }, { count: totalProfiles }] = await Promise.all([
    supabase.from('profiles')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', startOfMonth.toISOString()),
    supabase.from('profiles')
      .select('*', { count: 'exact', head: true }),
  ])

  // Stripe: active subscriptions for MRR
  let mrr = 0
  let activeShops = 0
  let activeSolo = 0
  let stripeMrrLastMonth = 0

  try {
    // Fetch all active subscriptions (paginate up to 100)
    const activeSubs = await stripe.subscriptions.list({ status: 'active', limit: 100, expand: ['data.items'] })
    for (const sub of activeSubs.data) {
      const monthlyAmount = sub.items.data.reduce((sum, item) => {
        const price = item.price
        const unitAmt = (price.unit_amount ?? 0) / 100
        if (price.recurring?.interval === 'month') return sum + unitAmt
        if (price.recurring?.interval === 'year') return sum + unitAmt / 12
        return sum
      }, 0)
      mrr += monthlyAmount

      const meta = sub.metadata
      if (meta?.plan_type === 'shop' || sub.items.data.some(i => i.price.metadata?.plan_type === 'shop')) {
        activeShops++
      } else {
        activeSolo++
      }
    }

    // Also check trialing
    const trialingSubs = await stripe.subscriptions.list({ status: 'trialing', limit: 100 })
    for (const sub of trialingSubs.data) {
      const meta = sub.metadata
      if (meta?.plan_type === 'shop' || sub.items.data.some(i => i.price.metadata?.plan_type === 'shop')) {
        activeShops++
      } else {
        activeSolo++
      }
    }

    // Last month's MRR (cancelled in last month = churned)
    const cancelledThisMonth = await stripe.subscriptions.list({
      status: 'canceled',
      limit: 100,
    })
    const churned = cancelledThisMonth.data.filter(sub => {
      const cancelledAt = new Date((sub as any).canceled_at * 1000)
      return cancelledAt >= startOfMonth
    })
    const churnedCount = churned.length
    const revenueLostToChurn = churned.reduce((sum, sub) => {
      return sum + sub.items.data.reduce((s, item) => {
        const unitAmt = (item.price.unit_amount ?? 0) / 100
        if (item.price.recurring?.interval === 'month') return s + unitAmt
        if (item.price.recurring?.interval === 'year') return s + unitAmt / 12
        return s
      }, 0)
    }, 0)

    // Estimate last month MRR from Supabase profiles (active last month)
    const { data: lastMonthActive } = await supabase.from('profiles')
      .select('subscription_status, plan_type')
      .eq('subscription_status', 'active')
    stripeMrrLastMonth = mrr + revenueLostToChurn

    const mrrChange = stripeMrrLastMonth > 0 ? ((mrr - stripeMrrLastMonth) / stripeMrrLastMonth) * 100 : null

    return NextResponse.json({
      mrr: Math.round(mrr),
      mrrChange,
      activeShops,
      activeSolo,
      newSignups: newSignups ?? 0,
      churnedCount,
      revenueLostToChurn: Math.round(revenueLostToChurn),
      totalProfiles: totalProfiles ?? 0,
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
