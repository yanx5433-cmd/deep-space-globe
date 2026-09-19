import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { CITIES } from '../data/cities'
import { CITY_POS, CITY_RADIUS } from '../lib/geo'
import { perspFactor } from '../lib/mathf'
import { useStore } from '../state/store'
import { telemetry } from '../state/telemetry'

/**
 * 城市节点：暖金发光点 + 呼吸 + 光晕 + 精灵内扩散波纹。
 * aState: 0 常态 / 1 悬停 / 2 选中。
 */
const CITY_VERT = /* glsl */ `
  uniform float uTime;
  uniform float uPersp;
  attribute float aSize;
  attribute float aPhase;
  attribute float aState;
  varying float vState;
  varying float vPhase;
  varying float vFade;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    vec3 nDir = normalize(mat3(modelMatrix) * normalize(position));
    float facing = dot(nDir, normalize(cameraPosition));
    vFade = mix(0.18, 1.0, smoothstep(-0.05, 0.3, facing));
    vState = aState;
    vPhase = aPhase;
    float breathe = 1.0 + 0.14 * sin(uTime * 1.9 + aPhase);
    float sizeMul = breathe * (1.0 + 0.5 * aState);
    gl_PointSize = clamp(aSize * sizeMul * uPersp / max(-mv.z, 0.1), 2.0, 170.0);
  }
`

const CITY_FRAG = /* glsl */ `
  uniform float uTime;
  varying float vState;
  varying float vPhase;
  varying float vFade;
  void main() {
    vec2 uv = gl_PointCoord * 2.0 - 1.0;
    float d = length(uv);
    float core = exp(-d * d * 14.0);
    float halo = exp(-d * d * 3.2) * 0.4;
    // 精灵内周期扩散波纹
    float ringT = fract(uTime * (0.4 + 0.3 * vState) + vPhase);
    float rr = ringT * 0.92;
    float ring = smoothstep(0.10, 0.0, abs(d - rr)) * (1.0 - ringT) * (0.35 + 0.65 * vState);
    float intensity = (core * 1.5 + halo + ring * 0.55) * vFade * (1.0 + 0.9 * vState);
    vec3 col = mix(vec3(1.0, 0.78, 0.42), vec3(1.0, 0.96, 0.86), core);
    gl_FragColor = vec4(col * intensity, 1.0);
  }
`

const SIZE_BY_RANK: Record<number, number> = { 1: 0.086, 2: 0.068, 3: 0.056 }

function buildCityPoints(): { points: THREE.Points; stateAttr: THREE.BufferAttribute; mat: THREE.ShaderMaterial; dispose: () => void } {
  const n = CITIES.length
  const positions = new Float32Array(CITY_POS)
  const sizes = new Float32Array(n)
  const phases = new Float32Array(n)
  const states = new Float32Array(n)
  CITIES.forEach((c, i) => {
    sizes[i] = SIZE_BY_RANK[c.rank] ?? 0.06
    phases[i] = (i * 2.399) % (Math.PI * 2)
  })
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1))
  geo.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1))
  const stateAttr = new THREE.BufferAttribute(states, 1)
  geo.setAttribute('aState', stateAttr)
  const mat = new THREE.ShaderMaterial({
    vertexShader: CITY_VERT,
    fragmentShader: CITY_FRAG,
    uniforms: { uTime: { value: 0 }, uPersp: { value: 1400 } },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  })
  const points = new THREE.Points(geo, mat)
  points.frustumCulled = false
  points.renderOrder = 4
  return {
    points,
    stateAttr,
    mat,
    dispose: () => {
      geo.dispose()
      mat.dispose()
    },
  }
}

const Z_AXIS = new THREE.Vector3(0, 0, 1)

/** 选中城市的常驻脉冲光环 */
function SelectedRing() {
  const selectedId = useStore((s) => s.selectedCityId)
  const idx = selectedId ? CITIES.findIndex((c) => c.id === selectedId) : -1
  const groupRef = useRef<THREE.Group>(null!)

  useFrame((state) => {
    const g = groupRef.current
    if (!g || idx < 0) return
    const t = state.clock.elapsedTime
    const pulse = 1 + 0.1 * Math.sin(t * 2.6)
    g.scale.setScalar(pulse)
    g.children.forEach((child) => {
      const m = child as THREE.Mesh
      const mat = m.material as THREE.MeshBasicMaterial
      mat.opacity = (0.32 + 0.22 * (0.5 + 0.5 * Math.sin(t * 2.6))) * (m.userData.dim ? 0.45 : 1)
    })
  })

  if (idx < 0) return null
  const dir = new THREE.Vector3(CITY_POS[idx * 3], CITY_POS[idx * 3 + 1], CITY_POS[idx * 3 + 2]).normalize()
  const q = new THREE.Quaternion().setFromUnitVectors(Z_AXIS, dir)
  return (
    <group ref={groupRef} position={dir.clone().multiplyScalar(CITY_RADIUS + 0.004)} quaternion={q}>
      <mesh renderOrder={4}>
        <ringGeometry args={[0.05, 0.056, 64]} />
        <meshBasicMaterial
          color="#ffd28a"
          transparent
          opacity={0.6}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          side={THREE.DoubleSide}
        />
      </mesh>
      <mesh renderOrder={4} userData={{ dim: true }}>
        <ringGeometry args={[0.082, 0.085, 64]} />
        <meshBasicMaterial
          color="#ffd28a"
          transparent
          opacity={0.2}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          side={THREE.DoubleSide}
        />
      </mesh>
    </group>
  )
}

const RIPPLE_N = 4
/** 城市选中时的扩散波纹池 */
function Ripples() {
  const reduced = useStore((s) => s.reducedMotion)
  const reducedRef = useRef(reduced)
  reducedRef.current = reduced
  const groupRef = useRef<THREE.Group>(null!)
  const anims = useRef(
    Array.from({ length: RIPPLE_N }, () => ({ t: 1e9, idx: -1, placed: false })),
  )

  useEffect(
    () =>
      useStore.subscribe((s, prev) => {
        if (s.selectedCityId && s.selectedCityId !== prev.selectedCityId && !s.reducedMotion) {
          const slot = anims.current.find((r) => r.t >= 1.5) ?? anims.current[0]
          slot.t = 0
          slot.idx = CITIES.findIndex((c) => c.id === s.selectedCityId)
          slot.placed = false
        }
      }),
    [],
  )

  useFrame((_, dt) => {
    const group = groupRef.current
    if (!group) return
    for (let i = 0; i < RIPPLE_N; i++) {
      const a = anims.current[i]
      const mesh = group.children[i] as THREE.Mesh | undefined
      if (!mesh) continue
      if (a.t > 1.5) {
        mesh.visible = false
        continue
      }
      a.t += dt
      if (!a.placed && a.idx >= 0) {
        const dir = new THREE.Vector3(CITY_POS[a.idx * 3], CITY_POS[a.idx * 3 + 1], CITY_POS[a.idx * 3 + 2])
        const n = dir.clone().normalize()
        mesh.position.copy(n).multiplyScalar(CITY_RADIUS + 0.002)
        mesh.quaternion.setFromUnitVectors(Z_AXIS, n)
        a.placed = true
      }
      const p = Math.min(a.t / 1.5, 1)
      mesh.visible = true
      mesh.scale.setScalar(0.03 + 0.4 * (1 - Math.pow(1 - p, 3)))
      ;(mesh.material as THREE.MeshBasicMaterial).opacity = 0.85 * (1 - p)
    }
  })

  return (
    <group ref={groupRef}>
      {Array.from({ length: RIPPLE_N }, (_, i) => (
        <mesh key={i} visible={false} renderOrder={5}>
          <ringGeometry args={[0.82, 1.0, 64]} />
          <meshBasicMaterial
            color="#ffd28a"
            transparent
            opacity={0.8}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
            side={THREE.DoubleSide}
          />
        </mesh>
      ))}
    </group>
  )
}

export function CityNodes() {
  const selectedId = useStore((s) => s.selectedCityId)
  const hoverId = useStore((s) => s.hoverCityId)
  const built = useMemo(() => buildCityPoints(), [])

  useEffect(() => () => built.dispose(), [built])

  useEffect(() => {
    const arr = built.stateAttr.array as Float32Array
    for (let i = 0; i < CITIES.length; i++) {
      arr[i] = CITIES[i].id === selectedId ? 2 : CITIES[i].id === hoverId ? 1 : 0
    }
    built.stateAttr.needsUpdate = true
  }, [selectedId, hoverId, built])

  useFrame((state) => {
    built.mat.uniforms.uTime.value = state.clock.elapsedTime
    const cam = state.camera as THREE.PerspectiveCamera
    built.mat.uniforms.uPersp.value = perspFactor(state.size.height, state.viewport.dpr, cam.fov)
  })

  return (
    <>
      <primitive object={built.points} dispose={null} />
      <SelectedRing />
      <Ripples />
    </>
  )
}

// 保持遥测引用（HUD 粒子/城市数在此模块链路初始化）
void telemetry
