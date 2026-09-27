import { VerticalProvider } from '@/lib/VerticalContext'
import { PageFade } from '@/components/motion'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <VerticalProvider>
      <PageFade>{children}</PageFade>
    </VerticalProvider>
  )
}
