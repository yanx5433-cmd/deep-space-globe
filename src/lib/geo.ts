import * as THREE from 'three'
import { CITIES } from '../data/cities'

const DEG = Math.PI / 180

/**
 * 经纬度 → 单位球坐标。
 * 约定：lon=0 位于 +Z（面向摄像机），东经为 +X 方向，北纬为 +Y。
 */
export function latLonToVec3(lat: number, lon: number, r = 1, out = new THREE.Vector3()): THREE.Vector3 {
  const phi = lat * DEG
  const lambda = lon * DEG
  return out.set(r * Math.cos(phi) * Math.sin(lambda), r * Math.sin(phi), r * Math.cos(phi) * Math.cos(lambda))
}

/** 城市渲染半径（略高于海洋球面与陆地粒子层） */
export const CITY_RADIUS = 1.012

/** 所有城市的局部球坐标（r = CITY_RADIUS），模块加载时构建一次。 */
export const CITY_POS: Float32Array = (() => {
  const arr = new Float32Array(CITIES.length * 3)
  const v = new THREE.Vector3()
  CITIES.forEach((c, i) => {
    latLonToVec3(c.lat, c.lon, CITY_RADIUS, v)
    arr[i * 3] = v.x
    arr[i * 3 + 1] = v.y
    arr[i * 3 + 2] = v.z
  })
  return arr
})()

export const CITY_COUNT = CITIES.length

/** 格式化坐标文本，如 31.2°N 121.5°E */
export function fmtCoord(lat: number, lon: number): string {
  return `${Math.abs(lat).toFixed(1)}°${lat >= 0 ? 'N' : 'S'} ${Math.abs(lon).toFixed(1)}°${lon >= 0 ? 'E' : 'W'}`
}
