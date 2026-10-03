import { redirect } from 'next/navigation'

// Consent moved into Shop Settings as a tab. This keeps old deep links
// (notification inbox, consent builder back buttons) working.
export default function ConsentRedirectPage() {
  redirect('/dashboard/settings?tab=consent')
}
