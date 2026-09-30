import { VerticalProvider } from '@/lib/VerticalContext'
import { NotificationsProvider } from '@/src/context/NotificationsContext'
import { PageFade } from '@/components/motion'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <VerticalProvider>
      <NotificationsProvider>
        <PageFade>{children}</PageFade>
      </NotificationsProvider>
    </VerticalProvider>
  )
}
