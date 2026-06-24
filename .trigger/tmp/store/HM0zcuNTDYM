import {
  require_jsonwebtoken,
  require_lib
} from "../../../chunk-JTKOGOCR.mjs";
import {
  createClient,
  dist_exports
} from "../../../chunk-7QJFYOPV.mjs";
import {
  task,
  wait
} from "../../../chunk-LFG4CZDZ.mjs";
import "../../../chunk-LRCAKVPT.mjs";
import {
  __name,
  __toESM,
  init_esm
} from "../../../chunk-XR26Y4P7.mjs";

// src/trigger/campaignSend.ts
init_esm();
var import_twilio = __toESM(require_lib());

// lib/emailTemplates.ts
init_esm();
function buildEmailTemplate(body, unsubscribeUrl) {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    body { font-family: sans-serif; background: #0a0a0a; color: #ffffff; margin: 0; padding: 0; }
    .container { max-width: 600px; margin: 0 auto; padding: 40px 20px; }
    .logo { color: #0d9488; font-size: 24px; font-weight: bold; margin-bottom: 32px; }
    .body { font-size: 16px; line-height: 1.6; color: #e5e5e5; }
    .footer { margin-top: 48px; font-size: 12px; color: #666; }
    .unsubscribe { color: #666; text-decoration: underline; }
  </style>
</head>
<body>
  <div class="container">
    <div class="logo">ChairOS</div>
    <div class="body">${body.replace(/\n/g, "<br>")}</div>
    <div class="footer">
      You're receiving this because you opted in at booking.<br>
      <a href="${unsubscribeUrl}" class="unsubscribe">Unsubscribe</a>
    </div>
  </div>
</body>
</html>`;
}
__name(buildEmailTemplate, "buildEmailTemplate");

// lib/unsubscribeToken.ts
init_esm();
var import_jsonwebtoken = __toESM(require_jsonwebtoken());
var SECRET = process.env.SUPABASE_JWT_SECRET;
function generateUnsubscribeToken(clientId) {
  return import_jsonwebtoken.default.sign({ sub: clientId, purpose: "email_unsubscribe" }, SECRET, { expiresIn: "365d" });
}
__name(generateUnsubscribeToken, "generateUnsubscribeToken");

// src/trigger/campaignSend.ts
function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}
__name(getSupabase, "getSupabase");
function appendStop(message) {
  const suffix = " Reply STOP to unsubscribe.";
  if (message.toLowerCase().includes("reply stop")) return message;
  if ((message + suffix).length <= 160) return message + suffix;
  return message;
}
__name(appendStop, "appendStop");
var campaignSend = task({
  id: "campaign-send",
  run: /* @__PURE__ */ __name(async ({ campaignId }) => {
    const supabase = getSupabase();
    const { data: campaign } = await supabase.from("campaigns").select("*").eq("id", campaignId).maybeSingle();
    if (!campaign) throw new Error(`Campaign ${campaignId} not found`);
    const { data: recipients } = await supabase.from("campaign_recipients").select("*").eq("campaign_id", campaignId).or("sms_status.eq.pending,email_status.eq.pending");
    if (!recipients || recipients.length === 0) {
      await supabase.from("campaigns").update({ status: "sent", updated_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("id", campaignId);
      return { sent: 0, failed: 0 };
    }
    const twilioClient = (0, import_twilio.default)(
      process.env.TWILIO_ACCOUNT_SID,
      process.env.TWILIO_AUTH_TOKEN
    );
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://chairos.cc";
    const BATCH = 50;
    let totalSent = 0;
    let totalFailed = 0;
    for (let i = 0; i < recipients.length; i += BATCH) {
      const batch = recipients.slice(i, i + BATCH);
      for (const recipient of batch) {
        if (campaign.channel === "sms" || campaign.channel === "both") {
          if (recipient.sms_status === "pending" && recipient.phone) {
            const { data: client } = await supabase.from("clients").select("sms_consent").eq("id", recipient.client_id).maybeSingle();
            if (!client?.sms_consent) {
              await supabase.from("campaign_recipients").update({ sms_status: "skipped" }).eq("id", recipient.id);
              continue;
            }
            const smsBody = appendStop(campaign.sms_message ?? "");
            let smsStatus = "failed";
            let errMsg = null;
            try {
              await twilioClient.messages.create({
                body: smsBody,
                from: process.env.TWILIO_PHONE_NUMBER,
                to: recipient.phone
              });
              smsStatus = "sent";
              totalSent++;
            } catch (err) {
              errMsg = err.message;
              totalFailed++;
            }
            await supabase.from("campaign_recipients").update({
              sms_status: smsStatus,
              sent_at: smsStatus === "sent" ? (/* @__PURE__ */ new Date()).toISOString() : null,
              error: errMsg
            }).eq("id", recipient.id);
          }
        }
        if (campaign.channel === "email" || campaign.channel === "both") {
          if (recipient.email_status === "pending" && recipient.email) {
            const { data: client } = await supabase.from("clients").select("email_consent").eq("id", recipient.client_id).maybeSingle();
            if (!client?.email_consent) {
              await supabase.from("campaign_recipients").update({ email_status: "skipped" }).eq("id", recipient.id);
              continue;
            }
            const unsubToken = generateUnsubscribeToken(recipient.client_id);
            const unsubUrl = `${siteUrl}/api/email/unsubscribe?token=${unsubToken}`;
            const html = buildEmailTemplate(campaign.email_body ?? "", unsubUrl);
            let emailStatus = "failed";
            let errMsg = null;
            try {
              const { error } = await resend.emails.send({
                from: process.env.RESEND_FROM_EMAIL,
                to: recipient.email,
                subject: campaign.email_subject ?? "",
                html
              });
              if (error) throw new Error(error.message);
              emailStatus = "sent";
              totalSent++;
            } catch (err) {
              errMsg = err.message;
              totalFailed++;
            }
            await supabase.from("campaign_recipients").update({
              email_status: emailStatus,
              sent_at: emailStatus === "sent" ? (/* @__PURE__ */ new Date()).toISOString() : null,
              error: errMsg
            }).eq("id", recipient.id);
          }
        }
      }
      if (i + BATCH < recipients.length) {
        await wait.for({ seconds: 1 });
      }
    }
    await supabase.from("campaigns").update({
      sent_count: totalSent,
      failed_count: totalFailed,
      status: "sent",
      updated_at: (/* @__PURE__ */ new Date()).toISOString()
    }).eq("id", campaignId);
    await supabase.from("campaign_runs").insert({
      campaign_id: campaignId,
      recipients_count: recipients.length,
      sent_count: totalSent,
      failed_count: totalFailed,
      trigger_type: "manual"
    });
    console.log(`[campaign-send] campaign ${campaignId}: sent=${totalSent}, failed=${totalFailed}`);
    return { sent: totalSent, failed: totalFailed };
  }, "run")
});
export {
  campaignSend
};
//# sourceMappingURL=campaignSend.mjs.map
