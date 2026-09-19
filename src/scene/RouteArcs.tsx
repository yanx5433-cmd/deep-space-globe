import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { CITIES, CITY_INDEX } from '../data/cities'
import { ROUTES } from '../data/routes'
import { CITY_POS, CITY_RADIUS } from '../lib/geo'
import { perspFactor } from '../lib/mathf'
import { useStore } from '../state/store'
import { telemetry } from '../state/telemetry'

/**
 * 航线弧 + 数据包光点。
 * - 每条弧独立材质：选中城市后相关航线 0.8s 内依次点亮（金色），无关航线减淡。
 * - 光点沿预采样曲线流动，带占空比（出现→扫过→消失）。
 */

const ICE = new THREE.Color('#5aa8ff')
const GOLD = new THREE.Color('#ffcf7a')

const PACKET_VERT = /* glsl */ `
  uniform float uPersp;
  attribute float aSize;
  attribute float aAlpha;
  varying float vA;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = clamp(aSize * uPersp / max(-mv.z, 0.1), 1.0, 18.0);
    vA = aAlpha;
  }
`

const PACKET_FRAG = /* glsl */ `
  varying float vA;
  void main() {
    vec2 uv = gl_PointCoord - 0.5;
    float d = length(uv);
    float a = smoothstep(0.5, 0.05, d);
    gl_FragColor = vec4(vec3(0.75, 0.88, 1.0) * a * vA * 1.5, 1.0);
  }
`

interface ArcAnim {
  t: number
  delay: number
  target: number
  boost: number
}

interface Packet {
  arc: number
  offset: number
  cycle: number
  sweep: number
}

function buildArcs() {
  const group = new THREE.Group()
  const mats: THREE.LineBasicMaterial[] = []
  const samples: Float32Array[] = []
  const anims: ArcAnim[] = []
  const geos: THREE.BufferGeometry[] = []
  const packets: Packet[] = []
  const tmp1 = new THREE.Vector3()
  const tmp2 = new THREE.Vector3()
  const mid = new THREE.Vector3()

  ROUTES.forEach(([aId, bId]) => {
    const ia = CITY_INDEX[aId]
    const ib = CITY_INDEX[bId]
    if (ia === undefined || ib === undefined) {
      console.warn(`[globe] 航线包含未知城市 id: ${aId} - ${bId}，已跳过`)
      return
    }
    tmp1.set(CITY_POS[ia * 3], CITY_POS[ia * 3 + 1], CITY_POS[ia * 3 + 2]).multiplyScalar(CITY_RADIUS / 1.012)
    tmp2.set(CITY_POS[ib * 3], CITY_POS[ib * 3 + 1], CITY_POS[ib * 3 + 2]).multiplyScalar(CITY_RADIUS / 1.012)
    const angle = tmp1.angleTo(tmp2)
    const alt = 0.14 + 0.42 * (angle / Math.PI)
    mid.copy(tmp1).add(tmp2).normalize().multiplyScalar(1 + alt)
    const curve = new THREE.QuadraticBezierCurve3(tmp1.clone(), mid.clone(), tmp2.clone())
    const pts = curve.getPoints(48)

    const positions = new Float32Array(49 * 3)
    const colors = new Float32Array(49 * 3)
    for (let i = 0; i <= 48; i++) {
      const t = i / 48
      const p = pts[i]
      positions[i * 3] = p.x
      positions[i * 3 + 1] = p.y
      positions[i * 3 + 2] = p.z
      // 端点暗、中段亮，形成能量弧
      const b = 0.08 + 0.92 * Math.pow(Math.sin(t * Math.PI), 1.4)
      colors[i * 3] = b
      colors[i * 3 + 1] = b
      colors[i * 3 + 2] = b
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    const mat = new THREE.LineBasicMaterial({
      vertexColors: true,
      color: ICE,
      transparent: true,
      opacity: 0.3,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
    const line = new THREE.Line(geo, mat)
    line.renderOrder = 5
    line.frustumCulled = false
    group.add(line)
    mats.push(mat)
    geos.push(geo)
    samples.push(positions)
    anims.push({ t: 999, delay: 0, target: 0, boost: 0 })

    // 主要枢纽航线双光点
    const nP = CITIES[ia].rank === 1 || CITIES[ib].rank === 1 ? 2 : 1
    for (let k = 0; k < nP; k++) {
      packets.push({
        arc: anims.length - 1,
        offset: Math.random(),
        cycle: 4.5 + Math.random() * 5.5,
        sweep: 0.3 + Math.random() * 0.3,
      })
    }
  })

  // 数据包 Points
  const P = packets.length
  const pPos = new Float32Array(P * 3)
  const pAlpha = new Float32Array(P)
  const pSize = new Float32Array(P)
  for (let i = 0; i < P; i++) pSize[i] = 0.02 + Math.random() * 0.012
  const pGeo = new THREE.BufferGeometry()
  pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3))
  const alphaAttr = new THREE.BufferAttribute(pAlpha, 1)
  pGeo.setAttribute('aAlpha', alphaAttr)
  pGeo.setAttribute('aSize', new THREE.BufferAttribute(pSize, 1))
  const pMat = new THREE.ShaderMaterial({
    vertexShader: PACKET_VERT,
    fragmentShader: PACKET_FRAG,
    uniforms: { uPersp: { value: 1400 } },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  })
  const packetPoints = new THREE.Points(pGeo, pMat)
  packetPoints.frustumCulled = false
  packetPoints.renderOrder = 6
  group.add(packetPoints)

  return {
    group,
    mats,
    samples,
    anims,
    packets,
    pPos,
    pAlpha,
    alphaAttr,
    pPosAttr: pGeo.getAttribute('position') as THREE.BufferAttribute,
    pMat,
    dispose: () => {
      geos.forEach((g) => g.dispose())
      mats.forEach((m) => m.dispose())
      pGeo.dispose()
      pMat.dispose()
    },
  }
}

export function RouteArcs() {
  const selectedId = useStore((s) => s.selectedCityId)
  const reduced = useStore((s) => s.reducedMotion)
  const built = useMemo(() => buildArcs(), [])
  const selectedRef = useRef(selectedId)
  selectedRef.current = selectedId
  const reducedRef = useRef(reduced)
  reducedRef.current = reduced

  useEffect(() => () => built.dispose(), [built])

  // 选中变化：相关航线依次点亮
  useEffect(() => {
    const sel = selectedId
    let hi = 0
    for (let i = 0; i < ROUTES.length; i++) {
      const anim = built.anims[i]
      if (!anim) continue
      const [a, b] = ROUTES[i]
      const conn = !!sel && (a === sel || b === sel)
      if (conn) {
        anim.delay = hi++ * 0.06
        if (anim.t < anim.delay) anim.t = anim.delay
        anim.target = 1
      } else {
        anim.target = 0
      }
    }
  }, [selectedId, built])

  useFrame((state, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05)
    const t = state.clock.elapsedTime
    const sel = selectedRef.current
    const reducedNow = reducedRef.current

    // 弧亮度动画
    for (let i = 0; i < built.mats.length; i++) {
      const anim = built.anims[i]
      const mat = built.mats[i]
      if (anim.target > 0) {
        anim.t += dt
        const raw = Math.min(Math.max((anim.t - anim.delay) / 0.35, 0), 1)
        anim.boost = raw * raw * (3 - 2 * raw)
      } else {
        anim.boost += (0 - anim.boost) * Math.min(1, dt * 5)
      }
      if (sel) {
        mat.opacity = anim.target === 1 ? 0.15 + 0.72 * anim.boost : 0.07
      } else {
        mat.opacity = 0.3 + anim.boost * 0.15
      }
      mat.color.copy(ICE).lerp(GOLD, anim.boost * 0.85)
    }

    // 数据包
    const cam = state.camera as THREE.PerspectiveCamera
    built.pMat.uniforms.uPersp.value = perspFactor(state.size.height, state.viewport.dpr, cam.fov)
    const speedK = reducedNow ? 2 : 1
    const alphaK = reducedNow ? 0.7 : 1.15
    for (let i = 0; i < built.packets.length; i++) {
      const p = built.packets[i]
      const cycleT = (t / (p.cycle * speedK) + p.offset) % 1
      if (cycleT > p.sweep) {
        built.pAlpha[i] = 0
        continue
      }
      const travel = cycleT / p.sweep
      const f = travel * 48
      const i0 = Math.floor(f)
      const frac = f - i0
      const s = built.samples[p.arc]
      const a3 = i0 * 3
      const b3 = Math.min(i0 + 1, 48) * 3
      built.pPos[i * 3] = s[a3] + (s[b3] - s[a3]) * frac
      built.pPos[i * 3 + 1] = s[a3 + 1] + (s[b3 + 1] - s[a3 + 1]) * frac
      built.pPos[i * 3 + 2] = s[a3 + 2] + (s[b3 + 2] - s[a3 + 2]) * frac
      built.pAlpha[i] = Math.pow(Math.sin(travel * Math.PI), 0.7) * alphaK
    }
    built.alphaAttr.needsUpdate = true
    built.pPosAttr.needsUpdate = true
  })
  return <primitive object={built.group} dispose={null} />
}

// telemetry.routes 在模块链路中已初始化
void telemetry
