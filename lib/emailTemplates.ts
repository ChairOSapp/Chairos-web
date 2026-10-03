import DOMPurify from 'isomorphic-dompurify'
import { parseEmailBody, tiptapDocToSafeHtml } from './campaignContent'

// Server-only: builds the outgoing campaign email. The body is rendered from
// the canonical TipTap JSON doc through a strict allowlist renderer, then
// DOMPurify-sanitized as the enforceable layer. No unsanitized campaign
// content ever reaches an outgoing email.
export function buildEmailTemplate(body: string, unsubscribeUrl: string): string {
  const doc = parseEmailBody(body)
  const safeBody = DOMPurify.sanitize(tiptapDocToSafeHtml(doc))
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    body { font-family: sans-serif; background: #0a0a0a; color: #ffffff; margin: 0; padding: 0; }
    .container { max-width: 600px; margin: 0 auto; padding: 40px 20px; }
    .logo { color: #4B5320; font-size: 24px; font-weight: bold; margin-bottom: 32px; }
    .body { font-size: 16px; line-height: 1.6; color: #e5e5e5; }
    .body p { margin: 0 0 12px; }
    .body ul, .body ol { margin: 0 0 12px; padding-left: 24px; }
    .body a { color: #9aa86b; }
    .footer { margin-top: 48px; font-size: 12px; color: #666; }
    .unsubscribe { color: #666; text-decoration: underline; }
  </style>
</head>
<body>
  <div class="container">
    <div class="logo">ChairOS</div>
    <div class="body">${safeBody}</div>
    <div class="footer">
      You're receiving this because you opted in at booking.<br>
      <a href="${unsubscribeUrl}" class="unsubscribe">Unsubscribe</a>
    </div>
  </div>
</body>
</html>`
}
