import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'

/**
 * 深蓝透明海洋球 + Fresnel 边缘光。depthWrite 开启：
 * 背面城市/航线被球体遮挡，形成克制的实体感，同时保持半透明蓝色。
 */
const OCEAN_VERT = /* glsl */ `
  varying vec3 vNormalW;
  varying vec3 vWorld;
  void main() {
    vNormalW = normalize(mat3(modelMatrix) * normal);
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorld = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`

const OCEAN_FRAG = /* glsl */ `
  uniform vec3 uBase;
  uniform vec3 uRim;
  varying vec3 vNormalW;
  varying vec3 vWorld;
  void main() {
    vec3 V = normalize(cameraPosition - vWorld);
    float fres = pow(1.0 - max(dot(normalize(vNormalW), V), 0.0), 2.6);
    vec3 col = uBase + uRim * fres * 0.9;
    float alpha = 0.42 + fres * 0.5;
    gl_FragColor = vec4(col, alpha);
  }
`

export function OceanSphere() {
  const mesh = useMemo(() => {
    const geo = new THREE.SphereGeometry(0.996, 96, 64)
    const mat = new THREE.ShaderMaterial({
      vertexShader: OCEAN_VERT,
      fragmentShader: OCEAN_FRAG,
      uniforms: {
        uBase: { value: new THREE.Color('#030d1d') },
        uRim: { value: new THREE.Color('#3f8fff') },
      },
      transparent: true,
      depthWrite: true,
    })
    const m = new THREE.Mesh(geo, mat)
    m.renderOrder = 2
    return m
  }, [])

  useEffect(() => () => {
    mesh.geometry.dispose()
    ;(mesh.material as THREE.Material).dispose()
  }, [mesh])

  return <primitive object={mesh} dispose={null} />
}

/** 极淡的经纬网格，增加"制图仪"仪器感 */
export function Graticule() {
  const lines = useMemo(() => {
    const pos: number[] = []
    const push = (a: THREE.Vector3, b: THREE.Vector3) => pos.push(a.x, a.y, a.z, b.x, b.y, b.z)
    const v1 = new THREE.Vector3()
    const v2 = new THREE.Vector3()
    const SEG = 72
    // 纬线
    for (let lat = -75; lat <= 75; lat += 15) {
      for (let i = 0; i < SEG; i++) {
        const l1 = -180 + (360 * i) / SEG
        const l2 = -180 + (360 * (i + 1)) / SEG
        push(latLonTmp(lat, l1, v1), latLonTmp(lat, l2, v2))
      }
    }
    // 经线（半圆，两两成对）
    for (let lon = -180; lon < 180; lon += 15) {
      for (let i = 0; i < SEG / 2; i++) {
        const a1 = -90 + (180 * i) / (SEG / 2)
        const a2 = -90 + (180 * (i + 1)) / (SEG / 2)
        push(latLonTmp(a1, lon, v1), latLonTmp(a2, lon, v2))
      }
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    const mat = new THREE.LineBasicMaterial({
      color: '#3f6fa8',
      transparent: true,
      opacity: 0.055,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
    const seg = new THREE.LineSegments(geo, mat)
    seg.renderOrder = 2
    return seg
  }, [])

  useEffect(() => () => {
    lines.geometry.dispose()
    ;(lines.material as THREE.Material).dispose()
  }, [lines])

  return <primitive object={lines} dispose={null} />
}

function latLonTmp(lat: number, lon: number, out: THREE.Vector3): THREE.Vector3 {
  const DEG = Math.PI / 180
  const phi = lat * DEG
  const lam = lon * DEG
  return out.set(Math.cos(phi) * Math.sin(lam), Math.sin(phi), Math.cos(phi) * Math.cos(lam)).multiplyScalar(1.0)
}

/**
 * 三层淡蓝色大气辉光（BackSide 外壳）。
 * 强度按 |dot(n, view)| 标定：在内缘（地球轮廓处）最亮，向外缘柔和衰减到 0。
 */
interface ShellSpec {
  radius: number
  color: string
  strength: number
  falloff: number
}

const SHELLS: ShellSpec[] = [
  { radius: 1.13, color: '#3f8fff', strength: 1.0, falloff: 2.1 },
  { radius: 1.3, color: '#2f6fdf', strength: 0.42, falloff: 2.5 },
  { radius: 1.55, color: '#1f4fa8', strength: 0.2, falloff: 2.9 },
]

const ATMO_VERT = /* glsl */ `
  varying vec3 vNormalV;
  void main() {
    vNormalV = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const ATMO_FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform float uStrength;
  uniform float uMuInner;
  uniform float uFalloff;
  varying vec3 vNormalV;
  void main() {
    float mu = abs(dot(normalize(vNormalV), vec3(0.0, 0.0, 1.0)));
    float t = clamp(mu / uMuInner, 0.0, 1.0);
    float intensity = pow(t, uFalloff) * uStrength;
    gl_FragColor = vec4(uColor * intensity, 1.0);
  }
`

export function Atmosphere() {
  const group = useMemo(() => {
    const g = new THREE.Group()
    for (const s of SHELLS) {
      const geo = new THREE.SphereGeometry(s.radius, 64, 48)
      const muInner = Math.sqrt(Math.max(1 - (1.0 / s.radius) ** 2, 0.0001))
      const mat = new THREE.ShaderMaterial({
        vertexShader: ATMO_VERT,
        fragmentShader: ATMO_FRAG,
        uniforms: {
          uColor: { value: new THREE.Color(s.color) },
          uStrength: { value: s.strength },
          uMuInner: { value: muInner },
          uFalloff: { value: s.falloff },
        },
        side: THREE.BackSide,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      })
      const mesh = new THREE.Mesh(geo, mat)
      mesh.renderOrder = 7
      g.add(mesh)
    }
    return g
  }, [])

  useEffect(() => () => {
    group.children.forEach((c) => {
      const m = c as THREE.Mesh
      m.geometry.dispose()
      ;(m.material as THREE.Material).dispose()
    })
  }, [group])

  return <primitive object={group} dispose={null} />
}
