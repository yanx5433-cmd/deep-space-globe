/** 低频 DOM 注册表：手势引擎直接操作，避免每帧 React 状态更新 */
export const uiRegistry: {
  crosshair: HTMLDivElement | null
  crosshairProgress: SVGCircleElement | null
  crosshairLabel: HTMLSpanElement | null
  debugCanvas: HTMLCanvasElement | null
  debugCtx: CanvasRenderingContext2D | null
} = {
  crosshair: null,
  crosshairProgress: null,
  crosshairLabel: null,
  debugCanvas: null,
  debugCtx: null,
}

const CIRC = 2 * Math.PI * 19

export function updateCrosshair(
  x: number,
  y: number,
  visible: boolean,
  progress: number,
  label: string,
  active: boolean,
): void {
  const el = uiRegistry.crosshair
  if (!el) return
  el.style.opacity = visible ? '1' : '0'
  el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`
  if (uiRegistry.crosshairProgress) {
    uiRegistry.crosshairProgress.style.strokeDashoffset = String(CIRC * (1 - Math.max(0, Math.min(1, progress))))
  }
  el.classList.toggle('active', active)
  if (uiRegistry.crosshairLabel) uiRegistry.crosshairLabel.textContent = label
}
