// Dependency-free structured (JSON-line) logging. Plain console.log/error
// with a stable shape rather than a logging library -- it needs to run
// unmodified in Next.js Edge/Node routes and in Trigger.dev's Node
// runtime, and Vercel's log viewer already ingests console output as-is,
// so JSON lines become queryable there with zero extra infra.

type LogFields = Record<string, unknown>

function emit(level: 'info' | 'warn' | 'error', event: string, fields?: LogFields) {
  const line = JSON.stringify({ level, event, ...fields, ts: new Date().toISOString() })
  if (level === 'error') console.error(line)
  else if (level === 'warn') console.warn(line)
  else console.log(line)
}

export const logger = {
  info: (event: string, fields?: LogFields) => emit('info', event, fields),
  warn: (event: string, fields?: LogFields) => emit('warn', event, fields),
  error: (event: string, fields?: LogFields) => emit('error', event, fields),
}
