import { VerticalProvider } from '@/lib/VerticalContext'
import { NotificationsProvider } from '@/src/context/NotificationsContext'
import { RouteFade } from '@/components/motion'
import DesktopSidebar from '@/components/DesktopSidebar'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <VerticalProvider>
      <NotificationsProvider>
        <DesktopSidebar />
        <div className="md:pl-64">
          <RouteFade>{children}</RouteFade>
        </div>
      </NotificationsProvider>
    </VerticalProvider>
  )
}
