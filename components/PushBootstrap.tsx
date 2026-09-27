'use client'

import { useEffect } from 'react'
import { initPushNotifications } from '@/lib/capacitorPush'

// Mount once inside the authenticated shell (OwnerNav / StaffNav). On the
// plain website this renders nothing and does nothing; inside the iOS
// wrapper it requests notification permission and registers the APNs
// device token with the server.
export default function PushBootstrap() {
  useEffect(() => {
    initPushNotifications()
  }, [])
  return null
}
