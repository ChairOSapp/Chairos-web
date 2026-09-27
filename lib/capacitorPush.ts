import { Capacitor } from '@capacitor/core'

let started = false

// Registers the device for push notifications when running inside the
// native iOS wrapper. No-ops on the plain website. Safe to call multiple
// times; safe to call before sign-in (registration is per-device, and the
// token is only linked to a user when /api/push/register succeeds with a
// session cookie present).
export async function initPushNotifications(): Promise<void> {
  if (started) return
  started = true

  try {
    if (!Capacitor.isNativePlatform()) return

    const { PushNotifications } = await import('@capacitor/push-notifications')

    const perm = await PushNotifications.requestPermissions()
    if (perm.receive !== 'granted') return

    await PushNotifications.register()

    PushNotifications.addListener('registration', async ({ value }) => {
      try {
        try { localStorage.setItem('chairos_push_token', value) } catch {}
        await fetch('/api/push/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: value, platform: Capacitor.getPlatform() }),
        })
      } catch {
        // Best-effort: the next app launch retries registration.
      }
    })

    PushNotifications.addListener('registrationError', (err) => {
      console.warn('[push] registration error', err)
    })

    // Tapping a notification deep-links inside the app instead of opening Safari.
    PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
      const url = action.notification.data?.url
      if (typeof url === 'string' && url.startsWith('/')) {
        window.location.href = url
      }
    })
  } catch (err) {
    console.warn('[push] init failed', err)
  }
}

// Call on sign-out so this device stops receiving the user's pushes.
export async function unregisterPushNotifications(): Promise<void> {
  try {
    let token: string | null = null
    try { token = localStorage.getItem('chairos_push_token') } catch {}
    if (token) {
      await fetch('/api/push/register', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      }).catch(() => {})
      try { localStorage.removeItem('chairos_push_token') } catch {}
    }
    started = false
  } catch {
    // ignore
  }
}
