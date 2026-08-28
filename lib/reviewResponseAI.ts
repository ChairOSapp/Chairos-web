import Anthropic from '@anthropic-ai/sdk'

const BUSINESS_TYPE: Record<string, string> = { barbershop: 'barbershop', salon: 'hair salon', tattoo: 'tattoo studio' }
const STAFF_TERM: Record<string, string> = { barbershop: 'barber', salon: 'stylist', tattoo: 'artist' }

export async function generateReviewResponseDraft(opts: {
  shopName: string
  vertical: string | null
  reviewerName: string
  rating: number
  body: string | null
  staffName?: string | null
}): Promise<string> {
  const vertical = opts.vertical || 'barbershop'
  const businessType = BUSINESS_TYPE[vertical] || 'barbershop'
  const staffTerm = STAFF_TERM[vertical] || 'barber'
  const tone = opts.rating >= 4 ? 'positive' : opts.rating <= 2 ? 'negative' : 'mixed/neutral'

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 300,
    system: `You are drafting a public reply from the owner of ${opts.shopName}, a ${businessType}, to a customer review. This business's staff are called "${staffTerm}s" — always use "${staffTerm}" (e.g. "your ${staffTerm}") when referring to the person who provided the service, never any other staff term. Match the reply's tone to the review, which is ${tone}. For a positive review: be warm and specific, thank them by name, invite them back. For a negative review: be calm and non-defensive, acknowledge the specific issue raised, do not make excuses or argue, offer to make it right, invite them to reach out directly rather than continuing the conversation publicly. Keep it under 60 words. Return ONLY the reply text — no preamble, no quotation marks, no signature line.`,
    messages: [{
      role: 'user',
      content: `Reviewer: ${opts.reviewerName}\nRating: ${opts.rating}/5\nReview: ${opts.body || '(no text provided)'}${opts.staffName ? `\nStaff member involved: ${opts.staffName}` : ''}`,
    }],
  })
  const block = response.content[0] as Anthropic.TextBlock
  return block.text.trim()
}
