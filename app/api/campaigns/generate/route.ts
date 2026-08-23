import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import Anthropic from '@anthropic-ai/sdk'

export async function POST(req: NextRequest) {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).maybeSingle()
  if (profile?.role !== 'owner') return NextResponse.json({ error: 'Owner only' }, { status: 403 })

  const { data: shop } = await admin.from('shops').select('vertical').eq('owner_id', user.id).maybeSingle()
  const vertical = shop?.vertical || 'barbershop'
  const BUSINESS_TYPE: Record<string, string> = { barbershop: 'barbershop', salon: 'hair salon', tattoo: 'tattoo studio' }
  const businessType = BUSINESS_TYPE[vertical] || 'barbershop'

  const { intent, channel, audienceType, audienceFilters, shopName } = await req.json()

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 600,
    system: `You are a marketing copywriter for a ${businessType}. Write campaign messages that feel personal, not corporate. Use ${businessType}-specific language. Never use generic phrases like 'valued customer'. Always address the client directly. For SMS: under 160 characters, no emojis unless they add meaning, end with a clear action. For email: subject line under 50 characters, body under 150 words, conversational tone, one clear call to action. Return only JSON with keys: sms_message, email_subject, email_body. No preamble.`,
    messages: [{
      role: 'user',
      content: `Shop: ${shopName}. Campaign intent: ${intent}. Audience: ${audienceType}. Filters: ${JSON.stringify(audienceFilters ?? {})}.\nWrite both an SMS and email version.`,
    }],
  })

  try {
    const raw = (response.content[0] as Anthropic.TextBlock).text.trim()
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
    const parsed = JSON.parse(cleaned)
    return NextResponse.json({ ...parsed, ai_generated: true })
  } catch {
    const raw = (response.content[0] as Anthropic.TextBlock)?.text ?? ''
    return NextResponse.json({ error: 'Failed to parse AI response', raw }, { status: 500 })
  }
}
