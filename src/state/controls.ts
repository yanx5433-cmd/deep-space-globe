import { CITIES } from '../data/cities'
import { DEG2RAD, clamp, easeInOutCubic, shortestAngle } from '../lib/mathf'

export const ZOOM_MIN = 1.55
export const ZOOM_MAX = 7.4
export const ZOOM_DEFAULT = 4.6
export const TILT_MIN = -1.15
export const TILT_MAX = 1.15
/** 自动旋转的空闲阈值（毫秒） */
export const IDLE_RESUME_MS = 2400

export interface Flight {
  t: number
  dur: number
  fromX: number
  fromY: number
  toX: number
  toY: number
  fromZ: number
  toZ: number
}

/**
 * 相机/地球旋转控制核心（非 React 状态）。
 * 所有输入源（手势、鼠标、触控）都写入这里，渲染主循环每帧积分：
 * 惯性 → 阻尼 → 自动旋转恢复 → 城市飞行。
 */
export const controls = {
  rotX: 0.42,
  rotY: -1.83,
  targetX: 0.42,
  targetY: -1.83,
  /** 惯性角速度（rad/s） */
  velX: 0,
  velY: 0,
  zoom: ZOOM_DEFAULT,
  zoomTarget: ZOOM_DEFAULT,
  /** 拖拽进行中（拖拽期间不施加惯性） */
  dragging: false,
  /** 最近一次输入时间戳 */
  lastInputAt: 0,
  flight: null as Flight | null,
  selectedCityId: null as string | null,
  /** 与 UI 设置同步 */
  autoRotate: true,
  /** 自动旋转恢复的缓入系数 0..1 */
  autoRamp: 0,
  /** 由 App 与 reduced-motion 设置同步 */
  reduced: false,
}

const now = () => performance.now()

function flightPos(f: Flight, p01: number) {
  const e = easeInOutCubic(p01)
  return {
    x: f.fromX + (f.toX - f.fromX) * e,
    y: f.fromY + (f.toY - f.fromY) * e,
    z: f.fromZ + (f.toZ - f.fromZ) * e,
  }
}

/** 手动输入打断飞行时，把当前状态固化，避免跳变 */
export function cancelFlight(): void {
  const f = controls.flight
  if (!f) return
  const p = flightPos(f, Math.min(f.t / f.dur, 1))
  controls.rotX = controls.targetX = p.x
  controls.rotY = controls.targetY = p.y
  controls.zoom = controls.zoomTarget = p.z
  controls.flight = null
}

export function markInput(): void {
  controls.lastInputAt = now()
}

/** 旋转输入。dx/dy 为弧度增量，dtSec 为距上次输入的时间（用于惯性估计） */
export function inputRotate(dx: number, dy: number, dtSec: number): void {
  cancelFlight()
  markInput()
  const inv = dtSec > 0 ? 1 / Math.max(dtSec, 0.006) : 0
  controls.velY = controls.velY + (dx * inv - controls.velY) * 0.4
  controls.velX = controls.velX + (dy * inv - controls.velX) * 0.4
  controls.targetY += dx
  controls.targetX = clamp(controls.targetX + dy, TILT_MIN, TILT_MAX)
}

export function beginDrag(): void {
  controls.dragging = true
}

export function endDrag(): void {
  controls.dragging = false
  markInput()
}

/** 滚轮 / 双指：指数缩放增量 */
export function inputZoomDelta(deltaLog: number): void {
  cancelFlight()
  markInput()
  controls.zoomTarget = clamp(controls.zoomTarget * Math.exp(deltaLog), ZOOM_MIN, ZOOM_MAX)
}

/** 双指张合手势：绝对标定后的连续缩放（已含 EMA 与标定） */
export function setPinchZoom(zoom: number): void {
  cancelFlight()
  markInput()
  controls.zoomTarget = clamp(zoom, ZOOM_MIN, ZOOM_MAX)
}

export function flyToCity(id: string): void {
  const city = CITIES.find((c) => c.id === id)
  if (!city) return
  controls.velX = 0
  controls.velY = 0
  controls.dragging = false
  const toX = clamp(city.lat * DEG2RAD, TILT_MIN, TILT_MAX)
  const toYRaw = -city.lon * DEG2RAD
  const dy = shortestAngle(toYRaw - controls.rotY)
  controls.flight = {
    t: 0,
    dur: controls.reduced ? 0.6 : 1.25,
    fromX: controls.rotX,
    fromY: controls.rotY,
    toX,
    toY: controls.rotY + dy,
    fromZ: controls.zoom,
    toZ: 2.1,
  }
  markInput()
}

export function flyToOverview(): void {
  controls.velX = 0
  controls.velY = 0
  controls.dragging = false
  controls.flight = {
    t: 0,
    dur: controls.reduced ? 0.5 : 1.0,
    fromX: controls.rotX,
    fromY: controls.rotY,
    toX: 0.35,
    toY: controls.rotY,
    fromZ: controls.zoom,
    toZ: ZOOM_DEFAULT,
  }
  markInput()
}
