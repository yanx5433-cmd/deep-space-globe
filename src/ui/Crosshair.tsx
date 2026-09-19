import { useEffect, useRef } from 'react'
import { uiRegistry } from '../state/uiRegistry'

/** 食指指向准星：由手势引擎直接 DOM 更新（低延迟） */
export function Crosshair() {
  const ref = useRef<HTMLDivElement>(null)
  const progRef = useRef<SVGCircleElement>(null)
  const labelRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    uiRegistry.crosshair = ref.current
    uiRegistry.crosshairProgress = progRef.current
    uiRegistry.crosshairLabel = labelRef.current
    return () => {
      uiRegistry.crosshair = null
      uiRegistry.crosshairProgress = null
      uiRegistry.crosshairLabel = null
    }
  }, [])

  return (
    <div className="crosshair" ref={ref}>
      <div className="ch-ring" />
      <div className="ch-dot" />
      <svg viewBox="0 0 44 44">
        <circle ref={progRef} cx="22" cy="22" r="19" />
      </svg>
      <span className="ch-label" ref={labelRef} />
    </div>
  )
}
