export async function sendSMS(to: string, message: string) {
  try {
    const res = await fetch('/api/sms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to, message })
    })
    const data = await res.json()
    if (!data.success) console.error('SMS failed:', data.error)
    return data.success
  } catch (err) {
    console.error('SMS error:', err)
    return false
  }
}