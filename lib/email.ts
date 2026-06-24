import { createClient } from '@supabase/supabase-js'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

/** Returns true only if the client has explicitly consented to email and has an email on file. */
export async function canEmailClient(clientPhone: string): Promise<boolean> {
  const supabase = getSupabase()
  const cleanPhone = clientPhone.replace(/\D/g, '')
  const { data } = await supabase
    .from('clients')
    .select('email_consent, email')
    .eq('phone', cleanPhone)
    .maybeSingle()
  return !!(data?.email_consent && data?.email)
}
