import twilio from 'twilio'

const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)

export async function sendSMS(to: string, message: string) {
  try {
    const digitsOnly = (to || '').replace(/\D/g, '')
    const normalized = digitsOnly.length === 10 ? `+1${digitsOnly}` : `+${digitsOnly}`

    await twilioClient.messages.create({
      body: message,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: normalized,
    })
    return true
  } catch (err) {
    console.error('SMS error:', err)
    return false
  }
}
