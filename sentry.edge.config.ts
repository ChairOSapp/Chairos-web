import * as Sentry from '@sentry/nextjs'

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: 0.1,
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
