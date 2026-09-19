import { useEffect, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { buildContinentPoints, type ContinentBuild } from '../lib/landParticles'
import { perspFactor } from '../lib/mathf'
import { useStore } from '../state/store'
import { telemetry } from '../state/telemetry'

/** 数万颗蓝白发光粒子组成的大陆点阵（数据本地打包，带程序化备用回退） */
export function ContinentParticles() {
  const reduced = useStore((s) => s.reducedMotion)
  const [built, setBuilt] = useState<ContinentBuild | null>(null)

  useEffect(() => {
    let dead = false
    // 稍作延迟，让首帧先渲染出来
    const id = window.setTimeout(() => {
      const b = buildContinentPoints(reduced ? 26000 : 54000)
      if (dead) {
        b.dispose()
        return
      }
      telemetry.particles = b.count
      setBuilt((prev) => {
        prev?.dispose()
        return b
      })
    }, 30)
    return () => {
      dead = true
      window.clearTimeout(id)
    }
  }, [reduced])

  useFrame((state) => {
    if (!built) return
    const mat = built.points.material as THREE.ShaderMaterial
    mat.uniforms.uTime.value = state.clock.elapsedTime
    const cam = state.camera as THREE.PerspectiveCamera
    mat.uniforms.uPersp.value = perspFactor(state.size.height, state.viewport.dpr, cam.fov)
  })

  if (!built) return null
  return <primitive object={built.points} dispose={null} />
}
