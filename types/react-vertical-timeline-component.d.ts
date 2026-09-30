declare module 'react-vertical-timeline-component' {
  import * as React from 'react'
  export interface VerticalTimelineProps {
    layout?: '1-column-left' | '1-column-right' | '2-columns'
    animate?: boolean
    className?: string
    children?: React.ReactNode
  }
  export interface VerticalTimelineElementProps {
    date?: string
    icon?: React.ReactNode
    iconStyle?: React.CSSProperties
    contentStyle?: React.CSSProperties
    contentArrowStyle?: React.CSSProperties
    className?: string
    children?: React.ReactNode
  }
  export const VerticalTimeline: React.FC<VerticalTimelineProps>
  export const VerticalTimelineElement: React.FC<VerticalTimelineElementProps>
}
