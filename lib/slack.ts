export async function notifySlack(message: string, source: string) {
  const url = process.env.SLACK_WEBHOOK_URL
  if (!url) {
    console.log(`[${source}] SLACK_WEBHOOK_URL is not set — skipping Slack notification`)
    return
  }
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: message }),
    })
    if (!res.ok) {
      console.error(`[${source}] Slack fetch failed: ${res.status} ${await res.text()}`)
    }
  } catch (err: any) {
    console.error(`[${source}] Slack fetch threw:`, err.message)
  }
}
