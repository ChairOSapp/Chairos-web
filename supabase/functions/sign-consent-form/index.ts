// Signs a consent form template on a client's behalf. This is the ONLY
// place server-side flattening and IP capture happen — the client-side
// signing page never touches either, per the "non-negotiable" requirement.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { PDFDocument, StandardFonts, rgb } from "npm:pdf-lib@1.17.1";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

function clientIpFrom(req: Request): string {
  const forwardedFor = req.headers.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0].trim();
  return req.headers.get("cf-connecting-ip") || req.headers.get("x-real-ip") || "unknown";
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    const body = await req.json();
    const { appointmentId, templateId, typedName, signatureImageDataUrl, signedDate } = body as {
      appointmentId?: string;
      templateId?: string;
      typedName?: string;
      signatureImageDataUrl?: string;
      signedDate?: string;
    };

    if (!appointmentId || !templateId || !typedName?.trim() || !signatureImageDataUrl || !signedDate) {
      return jsonResponse({ error: "Missing required fields" }, 400);
    }

    const { data: appointment, error: apptErr } = await supabase
      .from("appointments")
      .select("id, shop_id, client_id, client_name")
      .eq("id", appointmentId)
      .maybeSingle();
    if (apptErr || !appointment) {
      return jsonResponse({ error: "Appointment not found" }, 404);
    }
    if (!appointment.client_id) {
      return jsonResponse({ error: "Appointment has no linked client record" }, 400);
    }

    const { data: template, error: templateErr } = await supabase
      .from("consent_form_templates")
      .select("id, shop_id, file_path, version, is_active")
      .eq("id", templateId)
      .maybeSingle();
    if (templateErr || !template) {
      return jsonResponse({ error: "Consent form template not found" }, 404);
    }
    if (template.shop_id !== appointment.shop_id) {
      return jsonResponse({ error: "Template does not belong to this appointment's shop" }, 400);
    }
    if (!template.is_active) {
      return jsonResponse({ error: "This consent form version is no longer active. Please refresh and try again." }, 409);
    }

    const { data: existing } = await supabase
      .from("consent_form_signatures")
      .select("id")
      .eq("template_id", templateId)
      .eq("client_id", appointment.client_id)
      .maybeSingle();
    if (existing) {
      return jsonResponse({ error: "This consent form has already been signed", signatureId: existing.id }, 409);
    }

    const { data: fileBlob, error: downloadErr } = await supabase.storage
      .from("consent-templates")
      .download(template.file_path);
    if (downloadErr || !fileBlob) {
      return jsonResponse({ error: "Could not load the consent form template" }, 500);
    }

    const pdfDoc = await PDFDocument.load(await fileBlob.arrayBuffer());

    const pngMatch = signatureImageDataUrl.match(/^data:image\/png;base64,(.+)$/);
    if (!pngMatch) {
      return jsonResponse({ error: "Signature image must be a PNG data URL" }, 400);
    }
    const signatureBytes = Uint8Array.from(atob(pngMatch[1]), (c) => c.charCodeAt(0));
    const signatureImage = await pdfDoc.embedPng(signatureBytes);

    const lastPage = pdfDoc.getPages().at(-1);
    const pageWidth = lastPage ? lastPage.getWidth() : 612;
    const sigPage = pdfDoc.addPage([pageWidth, 320]);
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    let y = 280;
    sigPage.drawText("Signature Confirmation", { x: 50, y, size: 16, font: boldFont, color: rgb(0, 0, 0) });
    y -= 30;
    sigPage.drawText(`Signed by: ${typedName}`, { x: 50, y, size: 12, font });
    y -= 20;
    sigPage.drawText(`Date: ${signedDate}`, { x: 50, y, size: 12, font });
    y -= 30;

    const maxSigWidth = 220;
    const scale = Math.min(1, maxSigWidth / signatureImage.width);
    const sigDrawWidth = signatureImage.width * scale;
    const sigDrawHeight = signatureImage.height * scale;
    sigPage.drawImage(signatureImage, { x: 50, y: y - sigDrawHeight, width: sigDrawWidth, height: sigDrawHeight });
    y -= sigDrawHeight + 20;

    sigPage.drawText(
      "This document was signed electronically. A record of this signature, including the signer's IP address and timestamp, is retained by ChairOS.",
      { x: 50, y, size: 8, font, color: rgb(0.4, 0.4, 0.4), maxWidth: pageWidth - 100 }
    );

    const flattenedBytes = await pdfDoc.save();

    const signatureId = crypto.randomUUID();
    const signedPdfPath = `${appointment.shop_id}/${signatureId}.pdf`;

    const { error: uploadErr } = await supabase.storage
      .from("consent-signed")
      .upload(signedPdfPath, flattenedBytes, { contentType: "application/pdf" });
    if (uploadErr) {
      return jsonResponse({ error: `Failed to store signed document: ${uploadErr.message}` }, 500);
    }

    const ipAddress = clientIpFrom(req);

    const { data: signature, error: insertErr } = await supabase
      .from("consent_form_signatures")
      .insert({
        id: signatureId,
        shop_id: appointment.shop_id,
        client_id: appointment.client_id,
        template_id: template.id,
        template_version: template.version,
        signature_data: { typed_name: typedName.trim(), signed_date: signedDate, has_drawn_signature: true },
        signed_pdf_path: signedPdfPath,
        ip_address: ipAddress,
      })
      .select("id, access_token")
      .single();
    if (insertErr || !signature) {
      return jsonResponse({ error: `Failed to record signature: ${insertErr?.message}` }, 500);
    }

    return jsonResponse({ success: true, signatureId: signature.id, accessToken: signature.access_token });
  } catch (err) {
    return jsonResponse({ error: err instanceof Error ? err.message : "Unexpected error" }, 500);
  }
});
