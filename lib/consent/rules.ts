// ChairOS consent-form builder — state rules engine.
// Legal information for a form template, NOT legal advice.
// Sourced from docs/consent-state-law-research.md (researched 2026-10-02).
// Anything unverified in the research is phrased cautiously here.

export type Vertical = 'tattoo' | 'barber' | 'salon'

export interface StateOption {
  code: string
  name: string
}

export const STATES: StateOption[] = [
  { code: 'AL', name: 'Alabama' }, { code: 'AK', name: 'Alaska' },
  { code: 'AZ', name: 'Arizona' }, { code: 'AR', name: 'Arkansas' },
  { code: 'CA', name: 'California' }, { code: 'CO', name: 'Colorado' },
  { code: 'CT', name: 'Connecticut' }, { code: 'DE', name: 'Delaware' },
  { code: 'DC', name: 'District of Columbia' }, { code: 'FL', name: 'Florida' },
  { code: 'GA', name: 'Georgia' }, { code: 'HI', name: 'Hawaii' },
  { code: 'ID', name: 'Idaho' }, { code: 'IL', name: 'Illinois' },
  { code: 'IN', name: 'Indiana' }, { code: 'IA', name: 'Iowa' },
  { code: 'KS', name: 'Kansas' }, { code: 'KY', name: 'Kentucky' },
  { code: 'LA', name: 'Louisiana' }, { code: 'ME', name: 'Maine' },
  { code: 'MD', name: 'Maryland' }, { code: 'MA', name: 'Massachusetts' },
  { code: 'MI', name: 'Michigan' }, { code: 'MN', name: 'Minnesota' },
  { code: 'MS', name: 'Mississippi' }, { code: 'MO', name: 'Missouri' },
  { code: 'MT', name: 'Montana' }, { code: 'NE', name: 'Nebraska' },
  { code: 'NV', name: 'Nevada' }, { code: 'NH', name: 'New Hampshire' },
  { code: 'NJ', name: 'New Jersey' }, { code: 'NM', name: 'New Mexico' },
  { code: 'NY', name: 'New York' }, { code: 'NC', name: 'North Carolina' },
  { code: 'ND', name: 'North Dakota' }, { code: 'OH', name: 'Ohio' },
  { code: 'OK', name: 'Oklahoma' }, { code: 'OR', name: 'Oregon' },
  { code: 'PA', name: 'Pennsylvania' }, { code: 'RI', name: 'Rhode Island' },
  { code: 'SC', name: 'South Carolina' }, { code: 'SD', name: 'South Dakota' },
  { code: 'TN', name: 'Tennessee' }, { code: 'TX', name: 'Texas' },
  { code: 'UT', name: 'Utah' }, { code: 'VT', name: 'Vermont' },
  { code: 'VA', name: 'Virginia' }, { code: 'WA', name: 'Washington' },
  { code: 'WV', name: 'West Virginia' }, { code: 'WI', name: 'Wisconsin' },
  { code: 'WY', name: 'Wyoming' },
]

export type MinorPolicy = 'ban' | 'consent-route' | 'local' | 'none-found'

export interface TattooRule {
  /** Minimum age to be tattooed. null = no statutory floor found. */
  minAge: number | null
  minorPolicy: MinorPolicy
  /** How parental consent must work, '' when n/a. */
  mechanics: string
  /** Human-readable retention requirement. */
  retention: string
  /** State-mandated written items for the consent form. */
  disclosures: string[]
  citations: string
}

export const TATTOO_RULES: Record<string, TattooRule> = {
  AL: { minAge: null, minorPolicy: 'consent-route', mechanics: 'Written consent given in person to the operator at the time of the procedure.', retention: 'Permanent', disclosures: ['14-condition Disclosure Statement (posted in shop)', 'Written site-care sheet with shop info', 'See a physician at the first sign of infection'], citations: 'Ala. Code §§ 22-17A-2, 22-17A-3; Admin. Code 420-3-23-.07, -.15' },
  AK: { minAge: 18, minorPolicy: 'ban', mechanics: '', retention: '3 years (piercing consents; tattoo-aftercare duration not specified at state level)', disclosures: ['Board-approved educational information in writing before the procedure', 'Written aftercare after (physician direction, shop info), signed and dated by both'], citations: 'AS §§ 08.13.215, 08.13.217' },
  AZ: { minAge: 18, minorPolicy: 'consent-route', mechanics: 'Parent or legal guardian physically present.', retention: 'Not specified at state level (county rules apply)', disclosures: [], citations: 'A.R.S. § 13-3721' },
  AR: { minAge: 18, minorPolicy: 'consent-route', mechanics: 'Written consent on Dept. forms + parent present + parent photo ID + written attestation.', retention: '2 years (rule says 1, statute says 2 for ID & PMU records — keep 2)', disclosures: ['Written cautionary notice that tattoos are permanent (surgical-removal warning), signed and filed', 'Oral + written Dept.-approved aftercare'], citations: 'Ark. Code § 20-27-1502(a); DOH Rules 10.1, 10.3' },
  CA: { minAge: 18, minorPolicy: 'ban', mechanics: '', retention: 'Not specified at state level (2 years in county practice)', disclosures: ['Informed consent: procedure description, expectations and complications', 'Permanence statement', 'FDA non-approval notice for tattoo inks', 'Postprocedure instructions', 'Mandated health questionnaire'], citations: 'Penal Code § 653; H&S §§ 119302(a), 119303(a)-(c)' },
  CO: { minAge: null, minorPolicy: 'local', mechanics: 'Age rules set at county level — check local rules.', retention: '3 years', disclosures: ['Written + verbal: risks, expected outcome, aftercare (shop/artist info, physician direction, site care, permanence, side effects)', 'Mandated health-condition questions'], citations: '6 CCR 1010-22 §§ 4-401, 4-402, 4-403' },
  CT: { minAge: 18, minorPolicy: 'consent-route', mechanics: '"Permission" — no writing, notary, or presence required by state rule.', retention: 'Not specified at state level (local rules apply)', disclosures: [], citations: 'Conn. Gen. Stat. § 20-266p(6)' },
  DE: { minAge: 18, minorPolicy: 'consent-route', mechanics: 'Prior written NOTARIZED consent to the specific act; presence recorded.', retention: '3 years', disclosures: ['Full health questionnaire (12 conditions) + signed Release Form', 'Oral + written Division-approved educational info and aftercare, signed and dated by client'], citations: '11 Del. C. § 1114; 16 Del. Admin. Code 4451 §§ 6.1.1–6.3' },
  DC: { minAge: 16, minorPolicy: 'consent-route', mechanics: 'Written consent for ages 16–17; parent presence not required. (2024 statute vs 2017 DC Health rules conflict — verify.)', retention: '3 years', disclosures: ['Verbal + written aftercare (see a doctor if something goes wrong + shop contact)', 'Pre-work doctor-visit reminder', 'Posted FDA pigment warning'], citations: 'D.C. Code §§ 47-2853.76d, 47-2853.76e(b)' },
  FL: { minAge: 16, minorPolicy: 'consent-route', mechanics: 'Ages 16–17: parent present + government photo IDs for both + NOTARIZED DH 4146 consent + proof of parentage; licensed artist only.', retention: '2 years', disclosures: ['Full customer record (artist, name/age/DOB, design/location, signatures, dates)', 'Aftercare given verbally + in writing'], citations: 'Fla. Stat. § 381.00787; Fla. Admin. Code 64E-28.009, 64E-28.007(21)' },
  GA: { minAge: 18, minorPolicy: 'ban', mechanics: '', retention: '3 years (1 year on site)', disclosures: ['Written + verbal aftercare', 'Informed consent on file', 'Sobriety attestation on file'], citations: 'O.C.G.A. § 16-5-71; GA DPH Body Art Rules (7)(d), (8)' },
  HI: { minAge: 18, minorPolicy: 'consent-route', mechanics: 'Written parental consent.', retention: '2 years', disclosures: [], citations: 'HRS § 321-379; HAR 11-17-7, 11-17-14' },
  ID: { minAge: 14, minorPolicy: 'consent-route', mechanics: 'Ages 14–17: prior written informed consent executed in the performer\'s presence; no notary required.', retention: 'Not specified at state level', disclosures: [], citations: 'Idaho Code § 18-1523' },
  IL: { minAge: 18, minorPolicy: 'ban', mechanics: '', retention: 'Not specified at state level (unverified)', disclosures: ['IDPH educational discussion: permanence, bloodborne diseases, infections, granulomas, scars/keloids, allergy, MRI warning', 'Health screening (8+ conditions)', 'Aftercare instructions'], citations: '720 ILCS 5/12C-35; 410 ILCS 54' },
  IN: { minAge: 18, minorPolicy: 'consent-route', mechanics: 'Parent present + written permission at the time of the tattoo.', retention: '2 years', disclosures: [], citations: 'IC § 35-45-21-4; 410 IAC 1-5-28' },
  IA: { minAge: 18, minorPolicy: 'ban', mechanics: '', retention: '3 years', disclosures: ['Printed aftercare + direction to consult a physician'], citations: 'Iowa Code § 135.37(2); 641 IAC 22.6(10), 22.15' },
  KS: { minAge: 18, minorPolicy: 'consent-route', mechanics: 'Written + NOTARIZED consent; parent present.', retention: '3–5 years (statute/regulation conflict — keep 5)', disclosures: ['Written preservice info: reactions, side effects, complications + 14 special-condition instructions', 'Verbal + written aftercare after every service'], citations: 'K.S.A. §§ 65-1953, 65-1941; K.A.R. 69-15-15' },
  KY: { minAge: 16, minorPolicy: 'consent-route', mechanics: 'Ages 16–17: written NOTARIZED consent (parent + minor signatures, IDs, notary seal).', retention: '2 years', disclosures: ['Written: infection risk, permanence, removal scarring', 'Aftercare (written/verbal/electronic): site care, side effects, restrictions, infection signs, physician direction'], citations: 'KRS 211.760; 902 KAR 45:065 § 8' },
  LA: { minAge: 18, minorPolicy: 'consent-route', mechanics: 'Parent present + consent + proper ID.', retention: '3 years', disclosures: ['FDA ink-status statement (prominent)', 'Aftercare verbal + written (see a physician/professional at first sign of trouble)', '8-condition health history should be requested'], citations: 'La. R.S. 14:93.2; LAC tit. 51 § XXVIII-107' },
  ME: { minAge: 18, minorPolicy: 'ban', mechanics: '', retention: '2 years', disclosures: ['Complications advisory (especially diabetes/skin infections)', 'Latex-allergy question', 'Aftercare out loud + in writing, signed copy kept'], citations: '32 M.R.S. §§ 4203, 4204' },
  MD: { minAge: null, minorPolicy: 'consent-route', mechanics: 'Written client consent; parent consent for a minor (no age floor, notary, or presence in state rule).', retention: '3 years', disclosures: ['Risks disclosed + written consent', 'Written aftercare'], citations: 'COMAR 10.06.01.06H' },
  MA: { minAge: 18, minorPolicy: 'ban', mechanics: '', retention: '3 years', disclosures: ['Risk conditions verbal + written (diabetes, hemophilia, skin disease, pigment allergies, epilepsy, blood thinners, hepatitis, HIV, latex)', 'Signed confirmation block', 'Verbal + written aftercare'], citations: 'MGL ch. 111 § 31; DPH Model Regs' },
  MI: { minAge: 18, minorPolicy: 'consent-route', mechanics: 'Prior written informed consent + proof of authority, executed in licensee/agent presence.', retention: '3 years', disclosures: ['Dept. Disclosure Statement + complaint notice', 'Verbal + written aftercare (site care, infection signs, medical-attention recommendation, blood-donation deferral)', 'Health questionnaire; client-signed receipt'], citations: 'MCL § 333.13102; MDHHS Body Art Facility Requirements' },
  MN: { minAge: 18, minorPolicy: 'ban', mechanics: '', retention: '3 years', disclosures: ['VERBATIM permanence disclosure: "This tattoo is permanent and may only be removed with a surgical procedure that may leave scarring."', 'Health screening (6+ conditions)', 'Verbal + written aftercare'], citations: 'Minn. Stat. § 146B.07 subds. 1–5' },
  MS: { minAge: 18, minorPolicy: 'ban', mechanics: '', retention: '2 years', disclosures: ['Risk acknowledgment + aftercare-receipt acknowledgment', 'Diabetes/HIV/ESRD warning + cardiac warning', 'Printed aftercare before procedure'], citations: 'MSDH Tit. 15 Pt. 19 Subpt. 60 Ch. 11' },
  MO: { minAge: 18, minorPolicy: 'consent-route', mechanics: 'Prior written informed consent executed in performer/agent presence.', retention: '2 years', disclosures: ['VERBATIM permanence disclosure: "A tattoo should be considered permanent, and can only be removed or repaired with a surgical procedure that may leave permanent scarring and disfigurement."', '5 risk conditions in person + in writing', 'Practitioner signature attesting'], citations: 'Mo. Rev. Stat. § 324.520(2); 20 CSR 2267-5.010' },
  MT: { minAge: null, minorPolicy: 'consent-route', mechanics: 'Explicit in-person consent; parent signs in person and stays present throughout.', retention: '3 years (unverified)', disclosures: ['Complications list (10+)', 'Infection symptoms + consult-provider instruction', 'Permanence statement', 'Written + verbal aftercare receipt statement; client signs before each procedure'], citations: 'MCA § 45-5-623; ARM 37.112.142–.158' },
  NE: { minAge: 18, minorPolicy: 'consent-route', mechanics: 'Written consent + parent present; consent copy kept 5 years.', retention: '3 years (adults) / 5 years (minor records + consent)', disclosures: ['Aftercare pamphlets provided/posted'], citations: 'Neb. Rev. Stat. § 38-10,165' },
  NV: { minAge: 18, minorPolicy: 'consent-route', mechanics: 'Parent consent + proper ID (county rules).', retention: '2 years (county)', disclosures: ['Release form stating permanence', 'Written aftercare (shop + artist info, physician direction, infection/allergy signs)'], citations: 'County health district rules (e.g., CNHD 030.009–.025)' },
  NH: { minAge: 18, minorPolicy: 'ban', mechanics: '', retention: '7 years', disclosures: ['Health risks/adverse effects disclosed before procedure', 'Written + oral aftercare'], citations: 'RSA 314-A:8, I; RSA 314-A:6, I' },
  NJ: { minAge: 18, minorPolicy: 'consent-route', mechanics: 'Written consent + parent accompanies + both IDs photocopied.', retention: '3 years', disclosures: ['Consent form reviewed verbally: risks, alternatives, generally accepted results, aftercare plan; signed acceptance naming the artist', 'Medical health-history form (diabetes, allergies, skin, meds)', 'Signed aftercare copy'], citations: 'N.J.A.C. 8:27-4.2, 8:27-7.5(a)' },
  NM: { minAge: null, minorPolicy: 'consent-route', mechanics: 'Written proof of parent presence + consent.', retention: '3 years (then shred)', disclosures: ['Verbal + written: 7 risk conditions', 'Client signs confirmation (info provided, no disqualifying condition, consent, aftercare received)', 'Written aftercare'], citations: '16.36.5.11 NMAC' },
  NY: { minAge: 18, minorPolicy: 'ban', mechanics: '', retention: '2 years (NYC; county-level varies)', disclosures: ['Written aftercare (NYC)'], citations: 'Penal Law § 260.21(2); NYC Health Code Ch. 22' },
  NC: { minAge: 18, minorPolicy: 'ban', mechanics: '', retention: 'Not specified at state level (unverified)', disclosures: [], citations: 'N.C.G.S. § 14-400(a)' },
  ND: { minAge: 18, minorPolicy: 'consent-route', mechanics: 'Written consent + parent present.', retention: 'Not specified under 2026 rules (was 3)', disclosures: ['Risk notification (infection, allergy, scarring)', 'Evaluation questionnaire with 10 health questions', 'Dept.-approved aftercare with shop info', 'Consent statement (voluntary, understands, aftercare received)'], citations: 'N.D. Cent. Code § 12.1-31-13 (eff. 10/1/2026)' },
  OH: { minAge: 18, minorPolicy: 'consent-route', mechanics: 'Parent appears in person + signs procedure/aftercare document.', retention: 'Not specified at state level (unverified)', disclosures: ['Minor document: procedure method + post-care', 'Pigment color/manufacturer/lot records'], citations: 'ORC §§ 3730.06, 3730.07, 3730.09(A)' },
  OK: { minAge: 18, minorPolicy: 'ban', mechanics: '', retention: '3 years (then shred)', disclosures: ['8 health questions (diabetes, hemophilia/bleeding, skin, allergies, epilepsy/seizures/fainting, anticoagulants, pregnant/nursing, last ate)', 'Verbal + written aftercare'], citations: '21 O.S. § 842.1(A); OAC 310:233-3-6.1' },
  OR: { minAge: 18, minorPolicy: 'ban', mechanics: '', retention: '3 years', disclosures: ['Client signature acknowledging verbal + written: procedure explanation, risks, complications/side effects, adverse outcomes, restrictions, aftercare', 'Medical/skin condition + bleeding-history documentation'], citations: 'ORS § 690.360; OAR 331-915-0085' },
  PA: { minAge: 18, minorPolicy: 'consent-route', mechanics: 'Consent + parent present (not required in writing).', retention: 'Not specified at state level (local: 2)', disclosures: [], citations: '18 Pa.C.S. § 6311' },
  RI: { minAge: 18, minorPolicy: 'ban', mechanics: 'Medical exception only: parent present + both gov photo IDs + notarized parental consent (Dept. form) + proof of parentage + notarized physician consent + licensed artist.', retention: '5 years (bound book, pre-numbered pages)', disclosures: ['Aftercare verbal + written (consult physician at first sign of infection)'], citations: 'R.I. Gen. Laws § 11-9-15' },
  SC: { minAge: 18, minorPolicy: 'ban', mechanics: '', retention: '6 years', disclosures: ['Signed informed consent: blood-donation-disqualification notice + aftercare suggestions', 'Risks/adverse effects/consequences', 'Procedures + charges in writing, signed pre-procedure'], citations: 'S.C. Code §§ 44-34-60, 44-34-100' },
  SD: { minAge: 18, minorPolicy: 'consent-route', mechanics: 'Signed parental consent form.', retention: 'Not specified at state level (unverified)', disclosures: ['Signed consent from every patron (state)'], citations: 'SDCL § 26-10-19' },
  TN: { minAge: 18, minorPolicy: 'consent-route', mechanics: 'Ages 16–17 COVER-UP ONLY: written consent + proof of guardianship + parent present + report acknowledgment.', retention: '2 years', disclosures: ['Written aftercare after each tattoo (bandaging, cleaning, sun, scratching, clothing)'], citations: 'TCA § 62-38-207' },
  TX: { minAge: 18, minorPolicy: 'consent-route', mechanics: 'Cover-up ONLY: parent present + affidavit of parentage + evidence of identities + description/photo of tattoo to cover.', retention: '2 years (from last entry)', disclosures: ['Verbal + written before tattoo: pain, permanence, infection risk, allergy risk', 'Statement client received/read/understood written care instructions', 'Ink colors + manufacturer recorded'], citations: 'Tex. H&S §§ 146.012, 146.013; 25 TAC 229.406' },
  UT: { minAge: 18, minorPolicy: 'consent-route', mechanics: 'Parent present + identity/familial-relationship proof + written signed permission.', retention: 'Not specified at state level', disclosures: [], citations: 'Utah Code § 76-10-2201' },
  VT: { minAge: null, minorPolicy: 'consent-route', mechanics: 'Written consent signed in tattooist\'s presence, under pains and penalties of perjury; tattooist discloses to parent first; minor + parent + tattooist sign.', retention: '2 years (from first treatment)', disclosures: ['Procedure explanation; permanence; removal-scarring warning; complications list', '8+ mandated health questions', 'Written + verbal aftercare'], citations: '26 V.S.A. §§ 4102, 4108' },
  VA: { minAge: 18, minorPolicy: 'consent-route', mechanics: 'Parent present (or licensed medical personnel).', retention: '2 years (from last entry)', disclosures: ['Board form A450-12TDIS verbally + in writing: invasive/penetrates skin; infection incl. bloodborne (HIV, hep B/C); dye/pigment/metal allergy; pain, no legal anesthesia; permanence; removal risks', 'Client + tattooer signatures'], citations: 'Va. Code § 18.2-371.3; 18VAC41-50-410' },
  WA: { minAge: 18, minorPolicy: 'ban', mechanics: '', retention: '2 years', disclosures: [], citations: 'RCW § 26.28.085; WAC 308-22-070' },
  WV: { minAge: 18, minorPolicy: 'consent-route', mechanics: 'Prior written consent of one parent/guardian.', retention: '5 years', disclosures: ['Risk discussion incl. MRI interference', 'Dept.-prepared written complication info acknowledged in writing', 'Printed skin-care instructions to each patron'], citations: 'W. Va. Code § 16-38-3' },
  WI: { minAge: 18, minorPolicy: 'ban', mechanics: '', retention: 'Not specified at state level (unverified)', disclosures: [], citations: 'Wis. Stat. § 948.70' },
  WY: { minAge: 18, minorPolicy: 'consent-route', mechanics: 'Parent/guardian consent present at time of procedure.', retention: 'Not specified at state level', disclosures: [], citations: 'Wyo. Stat. § 14-3-107' },
}

// ── Form section model + assembler ─────────────────────────────────

export interface ConsentSection {
  id: string
  title: string
  /** State-mandated: always included, can't be unchecked. */
  locked: boolean
  paragraphs: string[]
  checkboxes?: string[]
  fields?: string[]
  /** When true, the signing form requires every checkbox in this section checked. */
  attestation?: boolean
}

export interface BuilderOptions {
  photoRelease: boolean
  chemicalServices: boolean
  straightRazor: boolean
}

export const VERTICAL_LABELS: Record<Vertical, string> = {
  tattoo: 'Tattoo',
  barber: 'Barbershop',
  salon: 'Salon',
}

/**
 * Canonical field names for builder-generated forms.
 * The contract between the PDF generator, the native signing form,
 * and the sign-consent-form edge function.
 */
export const SIGNING_FIELDS = {
  clientName: 'ClientName',
  clientDOB: 'ClientDOB',
  clientPhone: 'ClientPhone',
  clientEmail: 'ClientEmail',
  clientAddress: 'ClientAddress',
  clientSignature: 'ClientSignature',
  clientDate: 'ClientDate',
  artistName: 'ArtistName',
  artistSignature: 'ArtistSignature',
  artistDate: 'ArtistDate',
} as const

/**
 * Map a fill-in label to its canonical signing field name.
 * Shared by the PDF renderer and the native signing form so both agree
 * on which input fills which spot. Returns null for plain (unmapped) lines.
 * `prevName` disambiguates bare "Date:" labels (client vs artist date).
 */
export function signingFieldFor(label: string, prevName: string | null): string | null {
  const l = label.toLowerCase().replace(/:$/, '').trim()
  if (l === 'full legal name' || l === 'printed name') return SIGNING_FIELDS.clientName
  if (l === 'date of birth') return SIGNING_FIELDS.clientDOB
  if (l === 'phone') return SIGNING_FIELDS.clientPhone
  if (l === 'address') return SIGNING_FIELDS.clientAddress
  if (l === 'email') return SIGNING_FIELDS.clientEmail
  if (l === 'client signature') return SIGNING_FIELDS.clientSignature
  if (l === 'artist name') return SIGNING_FIELDS.artistName
  if (l === 'artist signature' || l === 'provider / witness' || l === 'barber / witness') return SIGNING_FIELDS.artistSignature
  if (l === 'date') {
    if (prevName === SIGNING_FIELDS.clientSignature) return SIGNING_FIELDS.clientDate
    if (prevName === SIGNING_FIELDS.artistSignature) return SIGNING_FIELDS.artistDate
    return null
  }
  return null
}

/**
 * Stable input keys for a fill-in field string. Canonical signing-field
 * name when the label maps to one, otherwise the raw label text.
 * The native signing form and the PDF renderer both use this, so answers
 * land in the right spots.
 */
export function fieldPartKeys(field: string): string[] {
  const parts = field.split(/ {2,}/).map(p => p.trim()).filter(Boolean)
  const canon: (string | null)[] = []
  for (let i = 0; i < parts.length; i++) {
    canon.push(signingFieldFor(parts[i], i > 0 ? canon[i - 1] : null))
  }
  return parts.map((p, i) => canon[i] ?? p)
}

export interface FormInput {
  key: string
  label: string
  type: 'text' | 'date' | 'tel' | 'email'
  signature: boolean
}

const CANONICAL_LABELS: Record<string, string> = {
  [SIGNING_FIELDS.clientName]: 'Full legal name',
  [SIGNING_FIELDS.clientDOB]: 'Date of birth',
  [SIGNING_FIELDS.clientPhone]: 'Phone',
  [SIGNING_FIELDS.clientEmail]: 'Email',
  [SIGNING_FIELDS.clientAddress]: 'Address',
  [SIGNING_FIELDS.clientSignature]: 'Signature',
  [SIGNING_FIELDS.clientDate]: 'Date',
  [SIGNING_FIELDS.artistName]: 'Artist name',
  [SIGNING_FIELDS.artistSignature]: 'Artist signature',
  [SIGNING_FIELDS.artistDate]: 'Date',
}

/** Describe the inputs for a fill-in field string (native signing form). */
export function fieldInputs(field: string): FormInput[] {
  const parts = field.split(/ {2,}/).map(p => p.trim()).filter(Boolean)
  const keys = fieldPartKeys(field)
  return parts.map((part, i) => {
    const key = keys[i]
    const signature =
      key === SIGNING_FIELDS.clientSignature || key === SIGNING_FIELDS.artistSignature
    let type: FormInput['type'] = 'text'
    if (key === SIGNING_FIELDS.clientDOB) type = 'date'
    else if (key === SIGNING_FIELDS.clientPhone) type = 'tel'
    else if (key === SIGNING_FIELDS.clientEmail) type = 'email'
    const label = CANONICAL_LABELS[key] ?? part.replace(/:$/, '')
    return { key, label, type, signature }
  })
}

/** Is this input key one of the signature pads? */
export function isSignatureKey(key: string): boolean {
  return key === SIGNING_FIELDS.clientSignature || key === SIGNING_FIELDS.artistSignature
}

/** Is this input key the client's signature? (vs the artist's) */
export function isClientSignatureKey(key: string): boolean {
  return key === SIGNING_FIELDS.clientSignature
}


const NOT_LEGAL_ADVICE =
  'This form was generated from a legal-information reference, not legal advice, and may not satisfy every requirement for your specific services. Have it reviewed by counsel before use.'

function ageLine(rule: TattooRule): string {
  if (rule.minAge === null) {
    return rule.minorPolicy === 'consent-route'
      ? 'I affirm I am of legal age, or I am a minor with the required parental consent described below.'
      : 'I affirm I am of legal age to receive this procedure.'
  }
  if (rule.minorPolicy === 'ban') {
    return `I affirm I am ${rule.minAge} years of age or older. No one under ${rule.minAge} may be tattooed in this state, with or without parental consent.`
  }
  return `I affirm I am ${rule.minAge} years of age or older, or I am a minor with the parental consent described below.`
}

function tattooSections(stateCode: string, opts: BuilderOptions): ConsentSection[] {
  const rule = TATTOO_RULES[stateCode]
  const sections: ConsentSection[] = [
    {
      id: 'identity', title: 'Client information', locked: true,
      paragraphs: [],
      fields: ['Full legal name:', 'Date of birth:                     Phone:', 'Address:', 'Email:', 'Photo ID type + number (verified at time of procedure):'],
    },
    {
      id: 'procedure', title: 'Procedure details', locked: true,
      paragraphs: [],
      fields: ['Description / design of tattoo:', 'Body location:', 'Date of procedure:', 'Ink colors + manufacturer (if known):', 'Artist name:'],
    },
    {
      id: 'health', title: 'Health screening', locked: true,
      paragraphs: ['Answer honestly. This information is used only to keep you safe. Tell your artist before the procedure if anything below applies to you.'],
      checkboxes: [
        'Allergies (tattoo pigments/inks, latex, metals)',
        'Diabetes',
        'Bleeding disorder, hemophilia, or blood thinners/anticoagulants',
        'Skin condition in or near the area (eczema, psoriasis, cuts, moles, rash, infection)',
        'Epilepsy / seizures / fainting history',
        'Pregnant or nursing',
        'Immune condition, HIV, or hepatitis',
      ],
    },
    {
      id: 'risks', title: 'Risk acknowledgment', locked: true,
      paragraphs: [
        'I understand that tattooing involves risks including: pain; bleeding; swelling; infection, including bloodborne infection; allergic reaction to inks, pigments, or latex; scarring or keloids; and unsatisfactory appearance.',
        ...rule.disclosures,
      ],
    },
    {
      id: 'permanence', title: 'Permanence', locked: true,
      paragraphs: [
        'I understand a tattoo should be considered permanent. Removal or repair requires a surgical or laser procedure that may leave permanent scarring and disfigurement.',
      ],
    },
    {
      id: 'aftercare', title: 'Aftercare', locked: true,
      paragraphs: [
        'I have received written aftercare instructions and they were explained to me verbally. I understand I should keep the area clean, follow the instructions given, watch for signs of infection (increasing redness, swelling, pain, pus, fever), and consult a physician at the first sign of infection or if something goes wrong.',
      ],
      checkboxes: ['I received written aftercare instructions and had them explained to me.'],
    },
  ]

  if (rule.minorPolicy === 'consent-route' && rule.mechanics) {
    sections.push({
      id: 'minor', title: 'Parental / guardian consent (minors)', locked: true,
      paragraphs: [
        `Parental-consent mechanics for this state: ${rule.mechanics}`,
        'The parent or legal guardian must complete this section in person as required above.',
      ],
      fields: ['Parent / guardian full name:', 'Relationship to minor:', 'Parent photo ID type + number:', 'Parent signature:                                    Date:'],
    })
  }

  sections.push(
    {
      id: 'sobriety', title: 'Sobriety & voluntary consent', locked: true,
      paragraphs: [ageLine(rule)],
      checkboxes: [
        'I am not under the influence of drugs or alcohol.',
        'I am giving consent voluntarily and can ask questions or stop the procedure at any time.',
      ],
    },
    {
      id: 'waiver', title: 'Consent, waiver & release', locked: true,
      paragraphs: [
        'I confirm the health information above is accurate. I voluntarily assume the risks of the procedure described above. I release the shop, its owner, and its artists from liability for injuries arising from the procedure, except in cases of gross negligence.',
      ],
    },
  )

  if (opts.photoRelease) {
    sections.push({
      id: 'photo', title: 'Photo / video release (optional)', locked: false,
      paragraphs: ['Optional. You do not have to agree to be tattooed.'],
      checkboxes: ['I give permission for photos/video of my tattoo to be used for shop marketing (portfolio, social media). I can revoke this in writing at any time.'],
    })
  }

  sections.push({
    id: 'signatures', title: 'Signatures', locked: true,
    paragraphs: [],
    fields: ['Client signature:                                                     Date:', 'Printed name:', 'Artist signature:                                                     Date:', `Record retention for this state: ${rule.retention}.`, `Legal basis: ${rule.citations}.`],
  })

  return sections
}

function barberSalonSections(vertical: Vertical, stateCode: string, opts: BuilderOptions): ConsentSection[] {
  const isSalon = vertical === 'salon'
  const sections: ConsentSection[] = [
    {
      id: 'identity', title: 'Client information', locked: true,
      paragraphs: [],
      fields: ['Full name:', 'Date of birth:                     Phone:', 'Email:', 'Emergency contact (name & phone):'],
    },
    {
      id: 'services', title: 'Services requested (check all that apply)', locked: true,
      paragraphs: [],
      checkboxes: vertical === 'barber'
        ? ['Haircut', 'Beard trim / sculpt', 'Hot-towel shave (straight razor)', 'Line-up / edge-up', 'Grey blending / color', 'Other: ___________________________']
        : ['Haircut', 'Color / highlights / balayage', 'Relaxer / straightening', 'Perm', 'Blowout / styling', 'Other: ___________________________'],
    },
    {
      id: 'health', title: 'Health & safety disclosures', locked: true,
      paragraphs: ['Please answer honestly. This information stays with your provider and is used only to keep you safe.'],
      checkboxes: [
        'Allergies (fragrances, latex, nickel, PPD / hair color, aftershave)',
        'Skin conditions (eczema, psoriasis, cuts, moles, recent sunburn)',
        'Blood thinners / anticoagulants, hemophilia, or diabetes',
        isSalon ? 'Previous chemical services in the last 6 months' : 'Previous reactions to shaving products',
      ],
    },
  ]

  if (opts.straightRazor && vertical === 'barber') {
    sections.push({
      id: 'razor', title: 'Straight-razor acknowledgment', locked: false,
      paragraphs: ['A straight razor may cause minor nicks or irritation. Tools are disinfected between every client per state barber sanitation rules. If you take blood thinners or have a bleeding disorder, tell your barber before the shave.'],
      checkboxes: ['I understand the above and still want the straight-razor service.'],
    })
  }

  if (opts.chemicalServices && isSalon) {
    const chem: ConsentSection = {
      id: 'chemical', title: 'Chemical services', locked: false,
      paragraphs: ['A patch (allergy) test 24–48 hours before color or chemical services is recommended.'],
      checkboxes: [
        'I was offered a patch test and declined. I accept the risk of an allergic reaction.',
        'I completed a patch test with no reaction.',
        'I understand chemical services can cause irritation, breakage, or allergic reaction.',
      ],
    }
    // State-specific chemical-service mandates (verified)
    if (stateCode === 'IA') {
      chem.locked = true
      chem.paragraphs.unshift('Iowa requires a signed consent form before any service using a certified laser product, IPL device, chemical peel, or microdermabrasion (481 IAC 940.7(157)).')
    }
    if (stateCode === 'CO') {
      chem.paragraphs.push('Colorado requires a patch test 24 hours before a chemical/manual resurfacing exfoliating procedure in defined risk cases (4 CCR 731-1, Rule 1.9(D)).')
    }
    if (stateCode === 'OR') {
      chem.paragraphs.push('Oregon cosmetology rules require documented records for chemical peels and dermaplaning, including an initial-visit signature confirming receipt and understanding.')
    }
    if (stateCode === 'UT') {
      chem.paragraphs.push('Utah requires the licensee to inform you before chemical exfoliants, microneedling, or microdermabrasion that the procedure is cosmetic-only unless under licensed health-care supervision, including benefits and risks (R156-11a).')
    }
    sections.push(chem)
  }

  sections.push({
    id: 'minor', title: 'Clients under 18', locked: true,
    paragraphs: ['A parent or legal guardian must sign below for any client under 18.'],
    fields: ['Parent / guardian name (if under 18):', 'Parent / guardian signature:                                    Date:'],
  })

  if (opts.photoRelease) {
    sections.push({
      id: 'photo', title: 'Photo / video release (optional)', locked: false,
      paragraphs: ['Optional. You do not have to agree to receive services.'],
      checkboxes: ['I give permission for photos/video of my service to be used for shop marketing. I can revoke this in writing at any time.'],
    })
  }

  sections.push(
    {
      id: 'waiver', title: 'Consent, waiver & release', locked: true,
      paragraphs: [
        'I confirm the health information above is accurate. I voluntarily assume the risks of the services checked above, including minor cuts, irritation, or allergic reaction. I release the shop, its owner, and its providers from liability for injuries arising from the services, except in cases of gross negligence. I understand I can ask questions or stop the service at any time.',
      ],
    },
    {
      id: 'signatures', title: 'Signatures', locked: true,
      paragraphs: [],
      fields: ['Client signature:                                                     Date:', 'Printed name:', 'Provider / witness:                                                     Date:'],
    },
  )

  return sections
}

export function buildConsentSections(
  stateCode: string,
  vertical: Vertical,
  opts: BuilderOptions,
): ConsentSection[] {
  if (vertical === 'tattoo') return tattooSections(stateCode, opts)
  return barberSalonSections(vertical, stateCode, opts)
}

export function formTitle(vertical: Vertical): string {
  return vertical === 'tattoo'
    ? 'TATTOO CONSENT & RELEASE FORM'
    : vertical === 'barber'
      ? 'CLIENT CONSENT & RELEASE FORM'
      : 'SALON CLIENT CONSENT & RELEASE FORM'
}

export function legalFooter(vertical: Vertical, stateCode: string): string {
  const state = STATES.find(s => s.code === stateCode)?.name ?? stateCode
  const cite = vertical === 'tattoo' ? ` Legal basis: ${TATTOO_RULES[stateCode]?.citations ?? ''}.` : ''
  return `Generated by ChairOS Consent Builder · ${VERTICAL_LABELS[vertical]} · ${state}.${cite} ${NOT_LEGAL_ADVICE}`
}

/** Human-readable summary of what the state mandates — shown in the builder UI. */
export function stateSummary(stateCode: string, vertical: Vertical): string[] {
  if (vertical !== 'tattoo') {
    const notes: string[] = ['No state mandates written consent content for ordinary barber/salon services.']
    if (stateCode === 'IA') notes.push('Iowa REQUIRES signed consent before laser/IPL/chemical peel/microdermabrasion (481 IAC 940.7(157)).')
    if (stateCode === 'CO') notes.push('Colorado requires a 24-hour patch test in defined risk cases (4 CCR 731-1, Rule 1.9(D)).')
    if (stateCode === 'OR') notes.push('Oregon requires documented records + initial-visit signature for chemical peels/dermaplaning.')
    if (stateCode === 'UT') notes.push('Utah requires a cosmetic-only + benefits/risks disclosure before chemical exfoliants/microneedling/microdermabrasion.')
    return notes
  }
  const r = TATTOO_RULES[stateCode]
  const out: string[] = []
  out.push(r.minAge === null ? 'No statutory minimum age found — check local rules.' : `Minimum age: ${r.minAge}.`)
  out.push(r.minorPolicy === 'ban'
    ? 'Minors cannot be tattooed, even with parental consent.'
    : r.minorPolicy === 'consent-route'
      ? `Parental consent allowed: ${r.mechanics}`
      : 'Age rules set locally — check county/city rules.')
  out.push(`Record retention: ${r.retention}.`)
  return out
}
