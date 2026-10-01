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
    const { appointmentId, templateId, signingToken, typedName, signatureImageDataUrl, signedDate, artistName, artistSignatureImageDataUrl } = body as {
      appointmentId?: string;
      templateId?: string;
      signingToken?: string;
      typedName?: string;
      signatureImageDataUrl?: string;
      signedDate?: string;
      artistName?: string;
      artistSignatureImageDataUrl?: string;
    };

    if (!appointmentId || !templateId || !signingToken || !typedName?.trim() || !signatureImageDataUrl || !signedDate) {
      return jsonResponse({ error: "Missing required fields" }, 400);
    }

    // Validate the single-use signing token. This is the authentication
    // for this endpoint — bare appointment UUIDs are not trusted.
    const { data: tokenRow, error: tokenErr } = await supabase
      .from("consent_signing_tokens")
      .select("id, appointment_id, template_id, expires_at, used_at")
      .eq("token", signingToken)
      .maybeSingle();
    if (tokenErr || !tokenRow) {
      return jsonResponse({ error: "Invalid signing token" }, 401);
    }
    if (tokenRow.used_at) {
      return jsonResponse({ error: "This signing link has already been used" }, 401);
    }
    if (new Date(tokenRow.expires_at) < new Date()) {
      return jsonResponse({ error: "This signing link has expired" }, 401);
    }
    if (tokenRow.appointment_id !== appointmentId || tokenRow.template_id !== templateId) {
      return jsonResponse({ error: "Signing token does not match this request" }, 401);
    }

    // Mark the token as used (single-use).
    const { error: useErr } = await supabase
      .from("consent_signing_tokens")
      .update({ used_at: new Date().toISOString() })
      .eq("id", tokenRow.id)
      .is("used_at", null);
    if (useErr) {
      return jsonResponse({ error: "Could not validate signing token" }, 500);
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

    // Try to fill AcroForm fields if the PDF has them
    let formFilled = false;
    try {
      const form = pdfDoc.getForm();
      const fields = form.getFields();
      const fieldNames = fields.map(f => f.getName());

      // Fill text fields
      const fillText = (name: string, value: string) => {
        if (fieldNames.includes(name)) {
          try {
            const tf = form.getTextField(name);
            tf.setText(value);
            formFilled = true;
          } catch {}
        }
      };
      fillText('ClientName', typedName.trim());
      fillText('ClientDate', signedDate);
      if (artistName?.trim()) fillText('ArtistName', artistName.trim());

      // For signature images: draw at the field's position
      const drawSigAtField = async (fieldName: string, img: any) => {
        if (!fieldNames.includes(fieldName)) return false;
        try {
          const field = form.getTextField(fieldName);
          const widgets = field.acroField.getWidgets();
          if (widgets.length === 0) return false;
          const widget = widgets[0];
          const rect = widget.getRectangle();
          const page = pdfDoc.getPages().find(p => p.ref === widget.P()?.get('P')) || pdfDoc.getPages()[0];
          // rect is {x, y, width, height} in PDF coords (y from bottom)
          const maxW = rect.width;
          const scale = Math.min(1, maxW / img.width);
          const dw = img.width * scale;
          const dh = img.height * scale;
          // Center vertically in the field
          const dx = rect.x + (rect.width - dw) / 2;
          const dy = rect.y + (rect.height - dh) / 2;
          page.drawImage(img, { x: dx, y: dy, width: dw, height: dh });
          // Remove the field so it doesn't overlay the image
          form.removeField(field);
          return true;
        } catch { return false; }
      };

      const clientSigDrawn = await drawSigAtField('ClientSignature', signatureImage);
      if (clientSigDrawn) formFilled = true;

      if (artistSignatureImageDataUrl) {
        const artistPngMatch = artistSignatureImageDataUrl.match(/^data:image\/png;base64,(.+)$/);
        if (artistPngMatch) {
          const artistBytes = Uint8Array.from(atob(artistPngMatch[1]), (c) => c.charCodeAt(0));
          const artistImg = await pdfDoc.embedPng(artistBytes);
          const artistSigDrawn = await drawSigAtField('ArtistSignature', artistImg);
          if (artistSigDrawn) formFilled = true;
          if (artistName?.trim()) {
            // Fill ArtistDate if exists
            fillText('ArtistDate', signedDate);
          }
        }
      }

      // Flatten the form so fields are not editable
      if (formFilled) form.flatten();
    } catch (e) {
      // No form fields or error — fall back to append-at-bottom
      console.log('Form fill failed, using fallback:', e);
    }

    const lastPage = pdfDoc.getPages().at(-1);
    const pageWidth = lastPage ? lastPage.getWidth() : 612;

    // If form fields were filled, skip the appended confirmation page.
    // Otherwise, add it as a fallback.
    if (!formFilled) {
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

      if (artistName?.trim() && artistSignatureImageDataUrl) {
        sigPage.drawText(`Artist: ${artistName.trim()}`, { x: 50, y, size: 12, font });
        y -= 30;
        const artistPngMatch = artistSignatureImageDataUrl.match(/^data:image\/png;base64,(.+)$/);
        if (artistPngMatch) {
          const artistBytes = Uint8Array.from(atob(artistPngMatch[1]), (c) => c.charCodeAt(0));
          const artistImg = await pdfDoc.embedPng(artistBytes);
          const aScale = Math.min(1, maxSigWidth / artistImg.width);
          const aW = artistImg.width * aScale;
          const aH = artistImg.height * aScale;
          sigPage.drawImage(artistImg, { x: 50, y: y - aH, width: aW, height: aH });
          y -= aH + 20;
        }
      }

      sigPage.drawText(
        "This document was signed electronically. A record of this signature, including the signer's IP address and timestamp, is retained by ChairOS.",
        { x: 50, y, size: 8, font, color: rgb(0.4, 0.4, 0.4), maxWidth: pageWidth - 100 }
      );
    }

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
