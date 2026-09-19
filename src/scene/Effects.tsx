import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'

/**
 * Bloom 后期：阈值高、强度克制，只让城市光点/数据包/大气边缘轻微泛光。
 * 接管渲染循环（priority 1），MSAA + HalfFloat 渲染目标保证画质。
 */
export function Effects() {
  const { gl, scene, camera, size } = useThree()

  const composer = useMemo(() => {
    const rt = new THREE.WebGLRenderTarget(1, 1, {
      type: THREE.HalfFloatType,
      samples: 4,
    })
    const c = new EffectComposer(gl, rt)
    c.addPass(new RenderPass(scene, camera))
    const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.42, 0.55, 0.82)
    c.addPass(bloom)
    c.addPass(new OutputPass())
    return c
  }, [gl, scene, camera])

  useEffect(() => {
    composer.setSize(size.width, size.height)
  }, [composer, size])

  useEffect(() => {
    return () => {
      composer.dispose()
    }
  }, [composer])

  useFrame((_, dt) => {
    composer.render(dt)
  }, 1)

  return null
}
