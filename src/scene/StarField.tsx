import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { useFrame, useStore as useR3FStore } from '@react-three/fiber'
import { useStore } from '../state/store'

/**
 * 三层远近星场：不同半径的球壳 + 不同漂移速度 + 逐星闪烁。
 * 颜色以冷白/冰蓝为主，少量暖星点缀。
 */
const STAR_VERT = /* glsl */ `
  uniform float uTime;
  uniform float uDpr;
  uniform float uAmp;
  attribute float aSize;
  attribute float aPhase;
  attribute float aFreq;
  attribute vec3 aColor;
  varying vec3 vColor;
  varying float vA;
  void main() {
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * uDpr;
    vColor = aColor;
    vA = (0.62 + uAmp * 0.38 * sin(uTime * aFreq + aPhase));
  }
`

const STAR_FRAG = /* glsl */ `
  varying vec3 vColor;
  varying float vA;
  void main() {
    vec2 uv = gl_PointCoord - 0.5;
    float d = length(uv);
    float a = smoothstep(0.5, 0.06, d);
    gl_FragColor = vec4(vColor * a * vA, 1.0);
  }
`

interface LayerSpec {
  count: number
  radius: number
  sizeMin: number
  sizeMax: number
  alpha: number
  drift: number
  tiltX: number
  tiltZ: number
  warmRatio: number
}

const LAYERS: LayerSpec[] = [
  { count: 2600, radius: 58, sizeMin: 1.1, sizeMax: 2.5, alpha: 1.0, drift: 0.0042, tiltX: 0.28, tiltZ: -0.12, warmRatio: 0.07 },
  { count: 1900, radius: 80, sizeMin: 0.9, sizeMax: 2.0, alpha: 0.62, drift: -0.0026, tiltX: -0.4, tiltZ: 0.2, warmRatio: 0.05 },
  { count: 1300, radius: 108, sizeMin: 0.8, sizeMax: 1.6, alpha: 0.38, drift: 0.0016, tiltX: 0.6, tiltZ: 0.35, warmRatio: 0.03 },
]

interface Layer {
  group: THREE.Group
  mat: THREE.ShaderMaterial
  drift: number
}

function buildLayer(spec: LayerSpec): Layer {
  const rnd = Math.random
  const n = spec.count
  const positions = new Float32Array(n * 3)
  const sizes = new Float32Array(n)
  const phases = new Float32Array(n)
  const freqs = new Float32Array(n)
  const colors = new Float32Array(n * 3)
  const ice = new THREE.Color('#cfe4ff')
  const white = new THREE.Color('#ffffff')
  const warm = new THREE.Color('#ffe3b8')
  const c = new THREE.Color()

  for (let i = 0; i < n; i++) {
    // 均匀球面分布
    const z = 2 * rnd() - 1
    const phi = rnd() * Math.PI * 2
    const s = Math.sqrt(Math.max(1 - z * z, 0))
    positions[i * 3] = s * Math.cos(phi) * spec.radius
    positions[i * 3 + 1] = z * spec.radius
    positions[i * 3 + 2] = s * Math.sin(phi) * spec.radius
    sizes[i] = spec.sizeMin + rnd() * (spec.sizeMax - spec.sizeMin)
    phases[i] = rnd() * Math.PI * 2
    freqs[i] = 0.4 + rnd() * 1.9
    if (rnd() < spec.warmRatio) c.copy(warm)
    else c.copy(ice).lerp(white, rnd() * 0.8)
    c.multiplyScalar(spec.alpha * (0.75 + rnd() * 0.25))
    colors[i * 3] = c.r
    colors[i * 3 + 1] = c.g
    colors[i * 3 + 2] = c.b
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1))
  geo.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1))
  geo.setAttribute('aFreq', new THREE.BufferAttribute(freqs, 1))
  geo.setAttribute('aColor', new THREE.BufferAttribute(colors, 3))

  const mat = new THREE.ShaderMaterial({
    vertexShader: STAR_VERT,
    fragmentShader: STAR_FRAG,
    uniforms: {
      uTime: { value: 0 },
      uDpr: { value: 1 },
      uAmp: { value: 1 },
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  })

  const points = new THREE.Points(geo, mat)
  points.renderOrder = 1
  points.frustumCulled = false

  const group = new THREE.Group()
  group.rotation.x = spec.tiltX
  group.rotation.z = spec.tiltZ
  group.add(points)

  return { group, mat, drift: spec.drift }
}

export function StarField() {
  const reduced = useStore((s) => s.reducedMotion)
  const layers = useMemo(() => LAYERS.map(buildLayer), [])

  useEffect(
    () => () => {
      for (const l of layers) {
        l.group.traverse((o) => {
          const p = o as THREE.Points
          if (p.geometry) p.geometry.dispose()
        })
        l.mat.dispose()
      }
    },
    [layers],
  )

  useFrame((state, dt) => {
    const dpr = state.viewport.dpr
    const amp = reduced ? 0.3 : 1
    const speed = reduced ? 0.4 : 1
    for (const l of layers) {
      l.group.rotation.y += l.drift * dt * speed
      l.mat.uniforms.uTime.value = state.clock.elapsedTime
      l.mat.uniforms.uDpr.value = dpr
      l.mat.uniforms.uAmp.value = amp
    }
  })

  return (
    <>
      {layers.map((l, i) => (
        <primitive key={i} object={l.group} dispose={null} />
      ))}
    </>
  )
}

// 引用防 tree-shake 误报（useR3FStore 未使用则移除）
void useR3FStore
