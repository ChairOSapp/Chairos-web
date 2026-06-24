import {
  Anthropic
} from "../../../chunk-FFOXCDS5.mjs";
import {
  require_lib
} from "../../../chunk-JTKOGOCR.mjs";
import "../../../chunk-PJKBXNLM.mjs";
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

// src/trigger/abandonedBookingRecovery.ts
init_esm();
var import_twilio = __toESM(require_lib());
function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}
__name(getSupabase, "getSupabase");
var abandonedBookingRecovery = task({
  id: "abandoned-booking-recovery",
  run: /* @__PURE__ */ __name(async (payload) => {
    await wait.for({ minutes: 15 });
    const supabase = getSupabase();
    const { data: session } = await supabase.from("booking_sessions").select("status").eq("session_id", payload.bookingSessionId).maybeSingle();
    if (!session || session.status !== "abandoned") {
      console.log("[abandoned-booking-recovery] session was completed during wait, skipping SMS");
      return { sent: false, reason: "booking_completed" };
    }
    const cleanPhone = payload.clientPhone.replace(/\D/g, "");
    const { data: clientConsent } = await supabase.from("clients").select("sms_consent").eq("phone", cleanPhone).maybeSingle();
    if (!clientConsent?.sms_consent) {
      console.log("[abandoned-booking-recovery] no SMS consent, skipping");
      return { sent: false, reason: "no_consent" };
    }
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 100,
      system: "You are writing an SMS from a barbershop to a client who started booking but did not finish. Write a single warm, friendly message under 160 characters encouraging them to complete their booking. Use the client name, shop name, and barber name naturally. Do not sound automated or promotional. Return only the SMS text, nothing else.",
      messages: [
        {
          role: "user",
          content: `Client: ${payload.clientName}. Shop: ${payload.shopName}. Barber: ${payload.barberName}.`
        }
      ]
    });
    const smsText = response.content[0].text;
    const phone = payload.clientPhone;
    const digitsOnly = (phone || "").replace(/\D/g, "");
    const normalized = digitsOnly.length === 10 ? `+1${digitsOnly}` : `+${digitsOnly}`;
    if (!/^\+1\d{10}$/.test(normalized)) {
      console.warn("[abandonedBookingRecovery] Invalid phone, skipping:", phone);
      await supabase.from("automation_logs").insert({
        type: "abandoned_booking_recovery",
        payload,
        result: `skipped:invalid_phone:${phone}`
      });
      return { sent: false, reason: "invalid_phone" };
    }
    const twilioClient = (0, import_twilio.default)(
      process.env.TWILIO_ACCOUNT_SID,
      process.env.TWILIO_AUTH_TOKEN
    );
    let result;
    try {
      const msg = await twilioClient.messages.create({
        body: smsText,
        from: process.env.TWILIO_PHONE_NUMBER,
        to: normalized
      });
      result = `sent:${msg.sid}`;
    } catch (err) {
      result = `twilio_error:${err.message}`;
    }
    await supabase.from("automation_logs").insert({
      type: "abandoned_booking_recovery",
      payload,
      result
    });
    console.log(`[abandoned-booking-recovery] ${result}`);
    return { sent: result.startsWith("sent"), result };
  }, "run")
});
export {
  abandonedBookingRecovery
};
//# sourceMappingURL=abandonedBookingRecovery.mjs.map
