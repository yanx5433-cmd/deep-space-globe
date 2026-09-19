import { useMemo, useRef, useEffect } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { CITIES } from '../data/cities'
import { CITY_POS, CITY_RADIUS } from '../lib/geo'
import { clamp, easeInOutCubic, perspFactor, RAD2DEG, wrapDeg } from '../lib/mathf'
import { IDLE_RESUME_MS, controls, TILT_MAX, TILT_MIN, ZOOM_DEFAULT } from '../state/controls'
import { telemetry } from '../state/telemetry'
import { useStore } from '../state/store'
import { StarField } from './StarField'
import { Satellite } from './Satellite'
import { Atmosphere, Graticule, OceanSphere } from './OceanSphere'
import { ContinentParticles } from './ContinentParticles'
import { CityNodes } from './CityNodes'
import { RouteArcs } from './RouteArcs'
import { Effects } from './Effects'

const TILT_MIN_V = TILT_MIN
const TILT_MAX_V = TILT_MAX

/**
 * 场景主组件 + 渲染主循环：
 * 飞行插值 → 惯性 → 自动旋转恢复 → 阻尼积分 → 遥测/城市屏幕投影。
 */
export function Scene() {
  const globeRef = useRef<THREE.Group>(null!)
  const reduced = useStore((s) => s.reducedMotion)
  const reducedRef = useRef(reduced)
  reducedRef.current = reduced
  const lastHover = useRef<string | null>(null)
  const tmpV = useMemo(() => new THREE.Vector3(), [])

  // 仅开发模式（?force-frames）：隐藏页面中 ResizeObserver 不触发，直接提供画布尺寸
  const gl = useThree((s) => s.gl)
  const camera = useThree((s) => s.camera)
  const setSize = useThree((s) => s.setSize)
  const invalidate = useThree((s) => s.invalidate)
  useEffect(() => {
    ;(window as unknown as Record<string, unknown>).__sceneMounted = true
    if (!import.meta.env.DEV) return
    if (!new URLSearchParams(location.search).has('force-frames')) return
    ;(window as unknown as Record<string, unknown>).__sizeHookRan = true
    const apply = () => {
      const w = window.innerWidth
      const h = window.innerHeight
      setSize(w, h)
      gl.setSize(w, h, false)
      const cam = camera as THREE.PerspectiveCamera
      cam.aspect = w / h
      cam.updateProjectionMatrix()
      invalidate()
    }
    apply()
    const iv = window.setInterval(apply, 800)
    return () => window.clearInterval(iv)
  }, [gl, camera, setSize, invalidate])

  useFrame((state, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05)
    const c = controls

    if (c.flight) {
      const f = c.flight
      f.t += dt
      const p = Math.min(f.t / f.dur, 1)
      const e = easeInOutCubic(p)
      c.rotX = f.fromX + (f.toX - f.fromX) * e
      c.rotY = f.fromY + (f.toY - f.fromY) * e
      c.zoom = f.fromZ + (f.toZ - f.fromZ) * e
      c.targetX = c.rotX
      c.targetY = c.rotY
      c.zoomTarget = c.zoom
      if (p >= 1) c.flight = null
    } else {
      // 惯性
      if (!c.dragging) {
        c.targetY += c.velY * dt
        c.targetX = clamp(c.targetX + c.velX * dt, TILT_MIN_V, TILT_MAX_V)
        const decay = Math.exp(-3.1 * dt)
        c.velX *= decay
        c.velY *= decay
        if (Math.abs(c.velX) < 1e-4) c.velX = 0
        if (Math.abs(c.velY) < 1e-4) c.velY = 0
      }
      // 自动旋转（空闲后缓入恢复）
      const idleFor = performance.now() - c.lastInputAt
      const canAuto =
        c.autoRotate && !c.selectedCityId && idleFor > IDLE_RESUME_MS && Math.abs(c.velY) < 0.06 && !c.dragging
      if (canAuto) c.autoRamp = Math.min(c.autoRamp + dt / 1.6, 1)
      else c.autoRamp = Math.max(c.autoRamp - dt / 0.6, 0)
      if (canAuto && c.autoRamp > 0) {
        c.targetY += 0.034 * Math.sin((c.autoRamp * Math.PI) / 2) * dt * (reducedRef.current ? 0.45 : 1)
      }
      // 阻尼
      const kR = 1 - Math.exp(-7.5 * dt)
      c.rotX += (c.targetX - c.rotX) * kR
      c.rotY += (c.targetY - c.rotY) * kR
      const kZ = 1 - Math.exp(-6.5 * dt)
      c.zoom += (c.zoomTarget - c.zoom) * kZ
    }

    // 角度防溢出
    if (c.rotY > Math.PI * 2) {
      c.rotY -= Math.PI * 2
      c.targetY -= Math.PI * 2
    } else if (c.rotY < -Math.PI * 2) {
      c.rotY += Math.PI * 2
      c.targetY += Math.PI * 2
    }

    const g = globeRef.current
    g.rotation.set(c.rotX, c.rotY, 0)
    state.camera.position.set(0, 0, c.zoom)
    state.camera.lookAt(0, 0, 0)
    state.camera.updateMatrixWorld()

    // 遥测
    const fps = 1 / Math.max(dt, 1e-3)
    telemetry.fps = Math.round(clamp(telemetry.fps + (fps - telemetry.fps) * 0.08, 1, 240))
    telemetry.lon = wrapDeg(-c.rotY * RAD2DEG)
    telemetry.lat = clamp(c.rotX * RAD2DEG, -90, 90)
    telemetry.zoomMult = ZOOM_DEFAULT / c.zoom

    // 城市屏幕投影（供指向手势 dwell 与鼠标点选）
    const w = state.size.width
    const h = state.size.height
    const cam = state.camera
    void perspFactor // 保持引用
    for (let i = 0; i < CITIES.length; i++) {
      tmpV.set(CITY_POS[i * 3], CITY_POS[i * 3 + 1], CITY_POS[i * 3 + 2]).applyEuler(g.rotation)
      const facing = tmpV.z / tmpV.length()
      if (facing > 0.08) {
        tmpV.project(cam)
        telemetry.cityScreen[i * 2] = (tmpV.x * 0.5 + 0.5) * w
        telemetry.cityScreen[i * 2 + 1] = (-tmpV.y * 0.5 + 0.5) * h
        telemetry.cityVisible[i] = 1
      } else {
        telemetry.cityVisible[i] = 0
      }
    }

    // 悬停检测
    if (telemetry.mouse.active) {
      let best = -1
      let bestD = 30 * 30
      for (let i = 0; i < CITIES.length; i++) {
        if (!telemetry.cityVisible[i]) continue
        const dx = telemetry.cityScreen[i * 2] - telemetry.mouse.x
        const dy = telemetry.cityScreen[i * 2 + 1] - telemetry.mouse.y
        const d2 = dx * dx + dy * dy
        if (d2 < bestD) {
          bestD = d2
          best = i
        }
      }
      const id = best >= 0 ? CITIES[best].id : null
      if (id !== lastHover.current) {
        lastHover.current = id
        useStore.getState().setHover(id)
      }
    } else if (lastHover.current) {
      lastHover.current = null
      useStore.getState().setHover(null)
    }
  })

  return (
    <>
      <color attach="background" args={['#010309']} />
      <StarField />
      <Satellite />
      <group ref={globeRef}>
        <Graticule />
        <OceanSphere />
        <ContinentParticles />
        <CityNodes />
        <RouteArcs />
        <Atmosphere />
      </group>
      <Effects />
    </>
  )
}

void CITY_RADIUS
