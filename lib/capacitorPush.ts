import { Capacitor } from '@capacitor/core'

let started = false
let registrationSettled = false

// Registers the device for push notifications when running inside the
// native iOS wrapper. No-ops on the plain website. Safe to call multiple
// times; safe to call before sign-in (registration is per-device, and the
// token is only linked to a user when /api/push/register succeeds with a
// session cookie present).
export async function initPushNotifications(): Promise<void> {
  if (started) return
  started = true

  // Phone-home probe: every launch attempt logs to push_reg_debug, so a
  // missing token can be traced to "this code never ran" vs a later step.
  const probe = (note: string, extra: Record<string, unknown> = {}) => {
    try {
      fetch('/api/push/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientError: `probe:${note}`, platform: Capacitor.getPlatform(), ...extra }),
      }).catch(() => {})
    } catch { /* ignore */ }
  }

  try {
    const isNative = Capacitor.isNativePlatform()
    probe('init', { isNative })
    if (!isNative) return

    const { PushNotifications } = await import('@capacitor/push-notifications')

    // Does the native side actually have the plugin registered?
    probe('plugin_available_' + Capacitor.isPluginAvailable('PushNotifications'))

    // Attach listeners BEFORE register() so the token event can't be missed.
    PushNotifications.addListener('registration', async ({ value }) => {
      try {
        registrationSettled = true
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
      registrationSettled = true
      // Report native registration failures to the server debug log so
      // they're visible without device console access.
      fetch('/api/push/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientError: String((err as any)?.error || err) }),
      }).catch(() => {})
    })

    probe('pre_permission')
    const perm = await PushNotifications.requestPermissions()
    probe('post_permission_' + perm.receive)
    if (perm.receive !== 'granted') { probe('permission', { receive: perm.receive }); return }

    await PushNotifications.register()
    probe('post_register')
    // If iOS never calls back with a token or an error, the registration
    // event never fires. Surface that silence explicitly.
    setTimeout(() => {
      if (!registrationSettled) probe('register_no_event')
    }, 20000)

    // Tapping a notification deep-links inside the app instead of opening Safari.
    PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
      const url = action.notification.data?.url
      if (typeof url === 'string' && url.startsWith('/')) {
        window.location.href = url
      }
    })
  } catch (err) {
    console.warn('[push] init failed', err)
    probe('init_threw', { error: String((err as any)?.message || err).slice(0, 120) })
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
