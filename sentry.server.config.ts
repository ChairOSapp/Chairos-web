import * as Sentry from '@sentry/nextjs'

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: 0.1,
  // Don't attach IP/cookies/headers automatically -- PII (client names,
  // phone numbers, payment details) flows through request bodies on the
  // booking/kiosk/payment/SMS routes, so scrub at the source instead of
  // relying on this alone.
  sendDefaultPii: false,
  beforeSend(event) {
    if (event.request) {
      delete event.request.data
      delete event.request.cookies
      if (event.request.headers) delete event.request.headers['cookie']
    }
    return event
  },
})
