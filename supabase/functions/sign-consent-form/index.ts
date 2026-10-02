// Signs a consent form on a client's behalf. This is the ONLY place
// server-side PDF rendering and IP capture happen — the client-side
// signing page never touches either, per the "non-negotiable" requirement.
//
// Two modes:
// - builder: the client filled out the native form; the finished PDF is
//   rendered fresh here from their answers + drawn signatures.
// - legacy: shop-uploaded PDFs; AcroForm fill if the PDF has fields,
//   otherwise a signature-confirmation page is appended.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { PDFDocument, StandardFonts, rgb } from "npm:pdf-lib@1.17.1";
import { buildConsentSections } from "./rules.ts";
import { generateConsentPdf } from "./generatePdf.ts";

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
  // Prefer Cloudflare's connecting IP (can't be spoofed by the client).
  // x-forwarded-for is client-controlled and only used as a fallback.
  return req.headers.get("cf-connecting-ip") || req.headers.get("x-real-ip") || "unknown";
}

// Max 2MB for a signature PNG data URL (base64 inflates ~33%).
const MAX_SIGNATURE_DATA_URL_LENGTH = 2 * 1024 * 1024 * 1.4;

function decodePngDataUrl(dataUrl: unknown): Uint8Array | null {
  if (typeof dataUrl !== "string") return null;
  if (dataUrl.length > MAX_SIGNATURE_DATA_URL_LENGTH) return null;
  const m = dataUrl.match(/^data:image\/png;base64,(.+)$/);
  if (!m) return null;
  try {
    return Uint8Array.from(atob(m[1]), (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

async function releaseToken(supabase: any, tokenId: string) {
  await supabase.from("consent_signing_tokens").update({ used_at: null }).eq("id", tokenId);
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
    const {
      appointmentId, templateId, signingToken, signedDate, mode,
      builderSpec, answers, checkedLabels,
      clientSignatureImageDataUrl, artistSignatureImageDataUrl,
      // legacy fields
      typedName, clientInfo, signatureImageDataUrl, artistName,
    } = body as {
      appointmentId?: string;
      templateId?: string;
      signingToken?: string;
      signedDate?: string;
      mode?: string;
      builderSpec?: { stateCode?: string; vertical?: string; options?: { photoRelease?: boolean; chemicalServices?: boolean; straightRazor?: boolean } };
      answers?: Record<string, unknown>;
      checkedLabels?: unknown;
      clientSignatureImageDataUrl?: string;
      artistSignatureImageDataUrl?: string;
      typedName?: string;
      clientInfo?: { dob?: string; phone?: string; email?: string };
      signatureImageDataUrl?: string;
      artistName?: string;
    };

    if (!appointmentId || !templateId || !signingToken || !signedDate) {
      return jsonResponse({ error: "Missing required fields" }, 400);
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(signedDate)) {
      return jsonResponse({ error: "Invalid signed date" }, 400);
    }

    // Validate the single-use signing token. This is the authentication
    // for this endpoint — bare appointment UUIDs are not trusted.
    // Atomic claim: only one concurrent request can win the UPDATE.
    const claimedAt = new Date().toISOString();
    const { data: tokenRow, error: tokenErr } = await supabase
      .from("consent_signing_tokens")
      .update({ used_at: claimedAt })
      .eq("token", signingToken)
      .is("used_at", null)
      .gt("expires_at", new Date().toISOString())
      .select("id, appointment_id, template_id")
      .maybeSingle();
    if (tokenErr || !tokenRow) {
      const { data: existing } = await supabase
        .from("consent_signing_tokens")
        .select("used_at, expires_at")
        .eq("token", signingToken)
        .maybeSingle();
      if (existing?.used_at) {
        return jsonResponse({ error: "This signing link has already been used" }, 401);
      }
      if (existing && new Date(existing.expires_at) < new Date()) {
        return jsonResponse({ error: "This signing link has expired" }, 401);
      }
      return jsonResponse({ error: "Invalid signing token" }, 401);
    }
    if (tokenRow.appointment_id !== appointmentId || tokenRow.template_id !== templateId) {
      await releaseToken(supabase, tokenRow.id);
      return jsonResponse({ error: "Signing token does not match this request" }, 401);
    }

    const { data: appointment, error: apptErr } = await supabase
      .from("appointments")
      .select("id, shop_id, client_id, client_name")
      .eq("id", appointmentId)
      .maybeSingle();
    if (apptErr || !appointment) {
      await releaseToken(supabase, tokenRow.id);
      return jsonResponse({ error: "Appointment not found" }, 404);
    }
    if (!appointment.client_id) {
      await releaseToken(supabase, tokenRow.id);
      return jsonResponse({ error: "Appointment has no linked client record" }, 400);
    }

    const { data: template, error: templateErr } = await supabase
      .from("consent_form_templates")
      .select("id, shop_id, file_path, version, is_active, builder_spec")
      .eq("id", templateId)
      .maybeSingle();
    if (templateErr || !template) {
      await releaseToken(supabase, tokenRow.id);
      return jsonResponse({ error: "Consent form template not found" }, 404);
    }
    if (template.shop_id !== appointment.shop_id) {
      await releaseToken(supabase, tokenRow.id);
      return jsonResponse({ error: "Template does not belong to this appointment's shop" }, 400);
    }
    if (!template.is_active) {
      await releaseToken(supabase, tokenRow.id);
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

    // Builder mode needs the spec (from the request or the template row).
    const spec = builderSpec ?? (template as any).builder_spec ?? null;
    const useBuilder =
      mode === "builder" &&
      spec && typeof spec.stateCode === "string" &&
      (spec.vertical === "tattoo" || spec.vertical === "barber" || spec.vertical === "salon");

    let flattenedBytes: Uint8Array;
    let recordData: Record<string, unknown>;

    if (useBuilder) {
      // ── Builder mode: render the finished PDF from the answers. ──
      if (!answers || typeof answers !== "object" || Array.isArray(answers)) {
        await releaseToken(supabase, tokenRow.id);
        return jsonResponse({ error: "Missing form answers" }, 400);
      }
      const get = (k: string) => {
        const v = (answers as Record<string, unknown>)[k];
        return typeof v === "string" ? v.trim() : "";
      };
      const clientName = get("ClientName");
      if (!clientName) {
        await releaseToken(supabase, tokenRow.id);
        return jsonResponse({ error: "Full legal name is required" }, 400);
      }
      if (clientName.length > 200) {
        await releaseToken(supabase, tokenRow.id);
        return jsonResponse({ error: "Name is too long" }, 400);
      }
      const dob = get("ClientDOB");
      if (spec.vertical === "tattoo" && !/^\d{4}-\d{2}-\d{2}$/.test(dob)) {
        await releaseToken(supabase, tokenRow.id);
        return jsonResponse({ error: "A valid date of birth is required for tattoo consent" }, 400);
      }

      const clientSigBytes = decodePngDataUrl(clientSignatureImageDataUrl);
      if (!clientSigBytes) {
        await releaseToken(supabase, tokenRow.id);
        return jsonResponse({ error: "A valid client signature is required" }, 400);
      }
      const artistSigBytes = artistSignatureImageDataUrl
        ? decodePngDataUrl(artistSignatureImageDataUrl)
        : null;
      if (artistSignatureImageDataUrl && !artistSigBytes) {
        await releaseToken(supabase, tokenRow.id);
        return jsonResponse({ error: "Artist signature image is invalid" }, 400);
      }

      const checks = Array.isArray(checkedLabels)
        ? checkedLabels.filter((s): s is string => typeof s === "string" && s.length > 0 && s.length <= 500).slice(0, 200)
        : [];

      // Sanitize answers: bounded keys and values.
      const values: Record<string, string> = {};
      for (const [k, v] of Object.entries(answers)) {
        if (typeof k === "string" && typeof v === "string" && k.length > 0 && k.length <= 200) {
          values[k] = v.slice(0, 500);
        }
      }
      values["ClientDate"] = signedDate;
      if (artistSigBytes) values["ArtistDate"] = signedDate;

      const sections = buildConsentSections(spec.stateCode, spec.vertical, {
        photoRelease: spec.options?.photoRelease === true,
        chemicalServices: spec.options?.chemicalServices === true,
        straightRazor: spec.options?.straightRazor === true,
      });
      const { data: shop } = await supabase
        .from("shops")
        .select("name")
        .eq("id", appointment.shop_id)
        .maybeSingle();

      try {
        flattenedBytes = await generateConsentPdf({
          shopName: (shop as any)?.name || "Consent Form",
          stateCode: spec.stateCode,
          vertical: spec.vertical,
          sections,
          values,
          checkedLabels: checks,
          clientSignaturePng: clientSigBytes,
          artistSignaturePng: artistSigBytes ?? undefined,
        });
      } catch (e) {
        console.log("Builder render failed:", e);
        await releaseToken(supabase, tokenRow.id);
        return jsonResponse({ error: "Could not generate the signed document" }, 500);
      }

      recordData = {
        typed_name: clientName,
        signed_date: signedDate,
        dob: dob || null,
        phone: get("ClientPhone") || null,
        email: get("ClientEmail") || null,
        has_drawn_signature: true,
        mode: "builder",
      };
    } else {
      // ── Legacy mode: shop-uploaded PDF. ──
      const dob = typeof clientInfo?.dob === "string" ? clientInfo.dob.trim() : "";
      const clientPhone = typeof clientInfo?.phone === "string" ? clientInfo.phone.trim() : "";
      const clientEmail = typeof clientInfo?.email === "string" ? clientInfo.email.trim() : "";
      if (!typedName?.trim() || !signatureImageDataUrl) {
        await releaseToken(supabase, tokenRow.id);
        return jsonResponse({ error: "Missing required fields" }, 400);
      }
      if (dob && !/^\d{4}-\d{2}-\d{2}$/.test(dob)) {
        await releaseToken(supabase, tokenRow.id);
        return jsonResponse({ error: "Invalid date of birth" }, 400);
      }
      if (clientPhone.length > 30 || clientEmail.length > 200 || typedName.length > 200 ||
          (artistName && artistName.length > 200)) {
        await releaseToken(supabase, tokenRow.id);
        return jsonResponse({ error: "Field too long" }, 400);
      }

      const { data: fileBlob, error: downloadErr } = await supabase.storage
        .from("consent-templates")
        .download(template.file_path);
      if (downloadErr || !fileBlob) {
        await releaseToken(supabase, tokenRow.id);
        return jsonResponse({ error: "Could not load the consent form template" }, 500);
      }

      const pdfDoc = await PDFDocument.load(await fileBlob.arrayBuffer());
      const signatureBytes = decodePngDataUrl(signatureImageDataUrl);
      if (!signatureBytes) {
        await releaseToken(supabase, tokenRow.id);
        return jsonResponse({ error: "Signature image must be a PNG data URL" }, 400);
      }
      const signatureImage = await pdfDoc.embedPng(signatureBytes);

      // Try to fill AcroForm fields if the PDF has them.
      let formFilled = false;
      try {
        const form = pdfDoc.getForm();
        const fields = form.getFields();
        const fieldNames = fields.map(f => f.getName());
        const fillText = (name: string, value: string) => {
          if (fieldNames.includes(name)) {
            try {
              form.getTextField(name).setText(value);
              formFilled = true;
            } catch {}
          }
        };
        fillText("ClientName", typedName.trim());
        fillText("ClientDate", signedDate);
        if (dob) fillText("ClientDOB", dob);
        if (clientPhone) fillText("ClientPhone", clientPhone);
        if (clientEmail) fillText("ClientEmail", clientEmail);
        if (artistName?.trim()) {
          fillText("ArtistName", artistName.trim());
          fillText("ArtistDate", signedDate);
        }

        const drawSigAtField = async (fieldName: string, img: any) => {
          if (!fieldNames.includes(fieldName)) return false;
          try {
            const field = form.getTextField(fieldName);
            const widgets = field.acroField.getWidgets();
            if (widgets.length === 0) return false;
            const widget = widgets[0];
            const rect = widget.getRectangle();
            const pages = pdfDoc.getPages();
            let page = pages[pages.length - 1];
            try {
              const pref: any = widget.P();
              const found = pages.find(p => (p.ref as any)?.objectNumber === pref?.objectNumber);
              if (found) page = found;
            } catch {}
            const scale = Math.min(1, rect.width / img.width, rect.height / img.height);
            const dw = img.width * scale;
            const dh = img.height * scale;
            page.drawImage(img, {
              x: rect.x + (rect.width - dw) / 2,
              y: rect.y + (rect.height - dh) / 2,
              width: dw, height: dh,
            });
            form.removeField(field);
            return true;
          } catch { return false; }
        };

        if (await drawSigAtField("ClientSignature", signatureImage)) formFilled = true;
        if (artistSignatureImageDataUrl) {
          const artistBytes = decodePngDataUrl(artistSignatureImageDataUrl);
          if (artistBytes) {
            const artistImg = await pdfDoc.embedPng(artistBytes);
            if (await drawSigAtField("ArtistSignature", artistImg)) formFilled = true;
          }
        }
        if (formFilled) {
          const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
          form.updateFieldAppearances(font);
          form.flatten();
        }
      } catch (e) {
        console.log("Form fill failed, using fallback:", e);
      }

      if (!formFilled) {
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
        const dw = signatureImage.width * scale;
        const dh = signatureImage.height * scale;
        sigPage.drawImage(signatureImage, { x: 50, y: y - dh, width: dw, height: dh });
        y -= dh + 20;
        if (artistName?.trim() && artistSignatureImageDataUrl) {
          sigPage.drawText(`Artist: ${artistName.trim()}`, { x: 50, y, size: 12, font });
          y -= 30;
          const artistBytes = decodePngDataUrl(artistSignatureImageDataUrl);
          if (artistBytes) {
            const artistImg = await pdfDoc.embedPng(artistBytes);
            const aScale = Math.min(1, maxSigWidth / artistImg.width);
            sigPage.drawImage(artistImg, {
              x: 50, y: y - artistImg.height * aScale,
              width: artistImg.width * aScale, height: artistImg.height * aScale,
            });
          }
        }
        sigPage.drawText(
          "This document was signed electronically. A record of this signature, including the signer's IP address and timestamp, is retained by ChairOS.",
          { x: 50, y, size: 8, font, color: rgb(0.4, 0.4, 0.4), maxWidth: pageWidth - 100 }
        );
      }

      flattenedBytes = await pdfDoc.save();
      recordData = {
        typed_name: typedName.trim(),
        signed_date: signedDate,
        dob: dob || null,
        phone: clientPhone || null,
        email: clientEmail || null,
        has_drawn_signature: true,
        mode: "legacy",
      };
    }

    const signatureId = crypto.randomUUID();
    const signedPdfPath = `${appointment.shop_id}/${signatureId}.pdf`;

    const { error: uploadErr } = await supabase.storage
      .from("consent-signed")
      .upload(signedPdfPath, flattenedBytes, { contentType: "application/pdf" });
    if (uploadErr) {
      await releaseToken(supabase, tokenRow.id);
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
        signature_data: recordData,
        signed_pdf_path: signedPdfPath,
        ip_address: ipAddress,
      })
      .select("id, access_token")
      .single();
    if (insertErr || !signature) {
      await supabase.storage.from("consent-signed").remove([signedPdfPath]);
      await releaseToken(supabase, tokenRow.id);
      return jsonResponse({ error: `Failed to record signature: ${insertErr?.message}` }, 500);
    }

    return jsonResponse({ success: true, signatureId: signature.id, accessToken: signature.access_token });
  } catch (err) {
    return jsonResponse({ error: err instanceof Error ? err.message : "Unexpected error" }, 500);
  }
});
