import { task, wait } from "@trigger.dev/sdk"
import { createClient } from "@supabase/supabase-js"
import Anthropic from "@anthropic-ai/sdk"
import twilio from "twilio"

type Payload = {
  bookingSessionId: string
  clientPhone: string
  clientName: string
  shopName: string
  barberId: string
  barberName: string
}

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export const abandonedBookingRecovery = task({
  id: "abandoned-booking-recovery",

  run: async (payload: Payload) => {
    // Wait 15 minutes before checking — gives the client time to complete the booking
    await wait.for({ minutes: 15 })

    const supabase = getSupabase()

    // Confirm the session is still abandoned (not completed during the wait)
    const { data: session } = await supabase
      .from('booking_sessions')
      .select('status')
      .eq('session_id', payload.bookingSessionId)
      .maybeSingle()

    if (!session || session.status !== 'abandoned') {
      console.log('[abandoned-booking-recovery] session was completed during wait, skipping SMS')
      return { sent: false, reason: 'booking_completed' }
    }

    // Generate personalized recovery SMS via Claude
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 100,
      system:
        'You are writing an SMS from a barbershop to a client who started booking but did not finish. Write a single warm, friendly message under 160 characters encouraging them to complete their booking. Use the client name, shop name, and barber name naturally. Do not sound automated or promotional. Return only the SMS text, nothing else.',
      messages: [
        {
          role: 'user',
          content: `Client: ${payload.clientName}. Shop: ${payload.shopName}. Barber: ${payload.barberName}.`,
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
      type: 'abandoned_booking_recovery',
      payload,
      result,
    })

    console.log(`[abandoned-booking-recovery] ${result}`)
    return { sent: result.startsWith('sent'), result }
  },
})
