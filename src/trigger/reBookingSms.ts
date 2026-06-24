import { task } from "@trigger.dev/sdk"
import { createClient } from "@supabase/supabase-js"
import Anthropic from "@anthropic-ai/sdk"
import twilio from "twilio"

type Payload = {
  clientPhone: string
  clientName: string
  barberName: string
  shopName: string
  daysSinceVisit: number
  lastServiceName: string
}

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export const reBookingSms = task({
  id: "rebooking-sms",

  run: async (payload: Payload) => {
    // Check SMS consent before sending
    const supabase = getSupabase()
    const cleanPhone = payload.clientPhone.replace(/\D/g, '')
    const { data: clientConsent } = await supabase
      .from('clients')
      .select('sms_consent')
      .eq('phone', cleanPhone)
      .maybeSingle()
    if (!clientConsent?.sms_consent) {
      console.log('[rebooking-sms] no SMS consent, skipping')
      return { sent: false, reason: 'no_consent' }
    }

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 100,
      system:
        "You are writing a personalized SMS from a barbershop to a returning client. The message must be under 160 characters, warm and personal (not promotional), reference how long it's been since their last visit, mention the barber by first name, and end with a soft call to action to book again. Never use exclamation points more than once. Return only the SMS text, nothing else.",
      messages: [
        {
          role: 'user',
          content: `Client: ${payload.clientName}. Barber: ${payload.barberName}. Shop: ${payload.shopName}. Days since last visit: ${payload.daysSinceVisit}. Last service: ${payload.lastServiceName}.`,
        },
      ],
    })

    const smsText = (response.content[0] as Anthropic.TextBlock).text

    // Send via Twilio
    const twilioClient = twilio(
      process.env.TWILIO_ACCOUNT_SID!,
      process.env.TWILIO_AUTH_TOKEN!
    )

    let result: string
    try {
      const msg = await twilioClient.messages.create({
        body: smsText,
        from: process.env.TWILIO_PHONE_NUMBER!,
        to: payload.clientPhone,
      })
      result = `sent:${msg.sid}`
    } catch (err: any) {
      result = `twilio_error:${err.message}`
    }

    // Log outcome
    await supabase.from('automation_logs').insert({
      type: 'rebooking_sms',
      payload,
      result,
    })

    console.log(`[rebooking-sms] ${result}`)
    return { sent: result.startsWith('sent'), smsText, result }
  },
})
