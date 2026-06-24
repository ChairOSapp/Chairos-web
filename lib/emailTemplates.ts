export function buildEmailTemplate(body: string, unsubscribeUrl: string): string {
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
    .footer { margin-top: 48px; font-size: 12px; color: #666; }
    .unsubscribe { color: #666; text-decoration: underline; }
  </style>
</head>
<body>
  <div class="container">
    <div class="logo">ChairOS</div>
    <div class="body">${body.replace(/\n/g, '<br>')}</div>
    <div class="footer">
      You're receiving this because you opted in at booking.<br>
      <a href="${unsubscribeUrl}" class="unsubscribe">Unsubscribe</a>
    </div>
  </div>
</body>
</html>`
}
