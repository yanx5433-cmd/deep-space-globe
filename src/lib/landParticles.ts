/**
 * 陆地掩码解码 + 大陆点阵粒子构建。
 * 数据源：src/data/landMask.ts（本地打包的 0.5° 陆地栅格，无任何网络请求）。
 * 若解码失败则回退为程序化备用点云（保证永不白屏）。
 */
import * as THREE from 'three'
import { MASK_W, MASK_H, LAND_BITS_B64 } from '../data/landMask'
import { latLonToVec3 } from './geo'

const LAND_VERT = /* glsl */ `
  uniform float uTime;
  uniform float uPersp;
  attribute float aSize;
  attribute float aPhase;
  attribute float aMix;
  varying float vMix;
  varying float vAlpha;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    vec3 nDir = normalize(mat3(modelMatrix) * normalize(position));
    float facing = dot(nDir, normalize(cameraPosition));
    float shimmer = 0.82 + 0.28 * sin(uTime * 1.6 + aPhase);
    // 背面半球粒子大幅减淡，形成"半透明全息"层次
    vAlpha = shimmer * mix(0.16, 1.0, smoothstep(-0.1, 0.35, facing));
    vMix = aMix;
    gl_PointSize = clamp(aSize * uPersp / max(-mv.z, 0.1), 1.0, 24.0);
  }
`

const LAND_FRAG = /* glsl */ `
  uniform float uOpacity;
  varying float vMix;
  varying float vAlpha;
  void main() {
    vec2 uv = gl_PointCoord - 0.5;
    float d = length(uv);
    float a = smoothstep(0.5, 0.08, d);
    vec3 col = mix(vec3(0.13, 0.42, 0.95), vec3(0.82, 0.93, 1.0), vMix);
    gl_FragColor = vec4(col * a * vAlpha * uOpacity, 1.0);
  }
`

/** 确定性 RNG，保证每次加载视觉效果一致 */
function mulberry32(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function decodeLandMask(): Uint8Array {
  const raw = atob(LAND_BITS_B64)
  const bytes = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i)
  const n = MASK_W * MASK_H
  const mask = new Uint8Array(n)
  for (let i = 0; i < n; i++) mask[i] = (bytes[i >> 3] >> (i & 7)) & 1
  return mask
}

export interface ContinentBuild {
  points: THREE.Points
  count: number
  dispose: () => void
}

function makePoints(
  positions: Float32Array,
  sizes: Float32Array,
  mixes: Float32Array,
  phases: Float32Array,
  count: number,
): ContinentBuild {
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1))
  geo.setAttribute('aMix', new THREE.BufferAttribute(mixes, 1))
  geo.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1))
  const mat = new THREE.ShaderMaterial({
    vertexShader: LAND_VERT,
    fragmentShader: LAND_FRAG,
    uniforms: {
      uTime: { value: 0 },
      uPersp: { value: 1400 },
      uOpacity: { value: 0.78 },
    },
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.AdditiveBlending,
  })
  const points = new THREE.Points(geo, mat)
  points.frustumCulled = false
  points.renderOrder = 3
  return {
    points,
    count,
    dispose: () => {
      geo.dispose()
      mat.dispose()
    },
  }
}

/** 主路径：陆地掩码点阵 */
function buildFromMask(budget: number): ContinentBuild {
  const mask = decodeLandMask()
  const cells: number[] = []
  for (let i = 0; i < MASK_W * MASK_H; i++) if (mask[i]) cells.push(i)

  const keep = Math.min(budget, cells.length)
  const rnd = mulberry32(20260919)
  const positions = new Float32Array(keep * 3)
  const sizes = new Float32Array(keep)
  const mixes = new Float32Array(keep)
  const phases = new Float32Array(keep)
  const v = new THREE.Vector3()

  for (let k = 0; k < keep; k++) {
    // 等距抽样到预算数量
    const cell = cells[Math.floor((k * cells.length) / keep)]
    const col = cell % MASK_W
    const row = (cell / MASK_W) | 0
    const lon = -179.75 + col * 0.5 + (rnd() - 0.5) * 0.22
    const lat = 89.75 - row * 0.5 + (rnd() - 0.5) * 0.22
    const r = 1.002 + rnd() * 0.005
    latLonToVec3(lat, lon, r, v)
    positions[k * 3] = v.x
    positions[k * 3 + 1] = v.y
    positions[k * 3 + 2] = v.z
    sizes[k] = 0.0052 + rnd() * 0.005
    mixes[k] = Math.abs(lat) > 62 ? 0.55 + rnd() * 0.45 : 0.12 + rnd() * 0.42
    phases[k] = rnd() * Math.PI * 2
  }
  return makePoints(positions, sizes, mixes, phases, keep)
}

/** 备用路径：掩码不可用时生成均匀点云，保证地球可见不白屏 */
function buildFallback(): ContinentBuild {
  const N = 9000
  const rnd = mulberry32(7)
  const positions = new Float32Array(N * 3)
  const sizes = new Float32Array(N)
  const mixes = new Float32Array(N)
  const phases = new Float32Array(N)
  for (let i = 0; i < N; i++) {
    const z = 2 * rnd() - 1
    const phi = rnd() * Math.PI * 2
    const s = Math.sqrt(1 - z * z)
    positions[i * 3] = s * Math.cos(phi) * 1.004
    positions[i * 3 + 1] = z * 1.004
    positions[i * 3 + 2] = s * Math.sin(phi) * 1.004
    sizes[i] = 0.004 + rnd() * 0.004
    mixes[i] = rnd() * 0.5
    phases[i] = rnd() * Math.PI * 2
  }
  return makePoints(positions, sizes, mixes, phases, N)
}

export function buildContinentPoints(budget: number): ContinentBuild {
  try {
    const built = buildFromMask(budget)
    if (built.count > 1000) return built
    built.dispose()
  } catch (e) {
    console.warn('[globe] 陆地掩码构建失败，使用备用点云', e)
  }
  return buildFallback()
}
