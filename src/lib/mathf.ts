export const DEG2RAD = Math.PI / 180
export const RAD2DEG = 180 / Math.PI

export function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

export function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
}

export function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3)
}

/** 归一化到 [-PI, PI] 的最短角差 */
export function shortestAngle(rad: number): number {
  let a = rad % (Math.PI * 2)
  if (a > Math.PI) a -= Math.PI * 2
  if (a < -Math.PI) a += Math.PI * 2
  return a
}

/** 归一化角度到 [-180, 180] */
export function wrapDeg(deg: number): number {
  let d = deg % 360
  if (d > 180) d -= 360
  if (d < -180) d += 360
  return d
}

/** 透视点尺寸系数：世界尺寸 * 该值 / 距离 = 像素尺寸 */
export function perspFactor(heightPx: number, dpr: number, fovDeg: number): number {
  return (heightPx * dpr) / (2 * Math.tan((fovDeg * DEG2RAD) / 2))
}
