import { tasks } from "@trigger.dev/sdk"
import * as Sentry from "@sentry/node"
import { logger } from "@/lib/logger"

// A plain side-effect file inside dirs (trigger.config.ts) runs at worker
// startup, same as how task registration itself works -- this doesn't
// need to be imported anywhere. tasks.onFailure() (no task-id argument)
// registers globally, applying to every task in src/trigger/, so
// individual job files don't each need their own try/catch + capture --
// Trigger.dev's own retry/failure UI still sees the failure regardless,
// since this hook observes rather than swallows it.

if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    tracesSampleRate: 0.1,
    sendDefaultPii: false,
  })
}

tasks.onFailure(({ task, error, ctx }) => {
  const message = error instanceof Error ? error.message : String(error)
  logger.error('trigger_job_failed', { task, message, runId: ctx?.run?.id })
  Sentry.captureException(error, { tags: { job: task }, extra: { runId: ctx?.run?.id } })
})
