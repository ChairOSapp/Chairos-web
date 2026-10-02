import { VerticalProvider } from '@/lib/VerticalContext'
import { NotificationsProvider } from '@/src/context/NotificationsContext'
import { PageFade } from '@/components/motion'
import DesktopSidebar from '@/components/DesktopSidebar'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <VerticalProvider>
      <NotificationsProvider>
        <DesktopSidebar />
        <div className="md:pl-64">
          <PageFade>{children}</PageFade>
        </div>
      </NotificationsProvider>
    </VerticalProvider>
  )
}
