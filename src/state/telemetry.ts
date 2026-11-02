/**
 * 每帧高频数据（非 React 状态）：由渲染主循环与手势引擎直接读写，
 * HUD 以低频轮询方式读取，避免 React 重渲染。
 */
import { CITIES } from '../data/cities'
import { ROUTES } from '../data/routes'

export const telemetry = {
  fps: 0,
  /** 当前视角中心经纬度（度） */
  lon: 105,
  lat: 24,
  /** 相对默认机位的缩放倍数 */
  zoomMult: 1,
  /** 缩放方向反馈：1 放大中 / -1 缩小中 / 0 静止 */
  zoomDir: 0,
  /** 地表粒子数（构建后填充） */
  particles: 0,
  cities: CITIES.length,
  routes: ROUTES.length,
  /** 各城市屏幕坐标与可见性（手势指向 / 鼠标点选用） */
  cityScreen: new Float32Array(CITIES.length * 2),
  cityVisible: new Uint8Array(CITIES.length),
  /** 鼠标当前位置（仅 mouse 指针更新） */
  mouse: { x: 0, y: 0, active: false },
}
