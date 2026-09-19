import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { useStore } from '../state/store'

/** 半透明线框侦察卫星 + 倾斜轨道线，缓慢绕行 */
export function Satellite() {
  const reduced = useStore((s) => s.reducedMotion)
  const reducedRef = useRef(reduced)
  reducedRef.current = reduced

  const built = useMemo(() => {
    const group = new THREE.Group()
    group.rotation.x = 0.52
    group.rotation.z = 0.16

    // 轨道线
    const orbitPts: THREE.Vector3[] = []
    for (let i = 0; i <= 128; i++) {
      const a = (i / 128) * Math.PI * 2
      orbitPts.push(new THREE.Vector3(Math.cos(a) * 1.78, Math.sin(a) * 1.78, 0))
    }
    const orbitGeo = new THREE.BufferGeometry().setFromPoints(orbitPts)
    const orbitMat = new THREE.LineBasicMaterial({
      color: '#7fd0ff',
      transparent: true,
      opacity: 0.1,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
    const orbit = new THREE.Line(orbitGeo, orbitMat)
    orbit.renderOrder = 6
    group.add(orbit)

    // 卫星本体
    const sat = new THREE.Group()
    const lineMat = new THREE.LineBasicMaterial({
      color: '#9fd8ff',
      transparent: true,
      opacity: 0.65,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
    const body = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.OctahedronGeometry(0.028)),
      lineMat,
    )
    sat.add(body)
    const panelMat = new THREE.LineBasicMaterial({
      color: '#ffd28a',
      transparent: true,
      opacity: 0.4,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
    const panelGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(0.075, 0.022, 0.004))
    const panelL = new THREE.LineSegments(panelGeo, panelMat)
    panelL.position.x = 0.07
    const panelR = new THREE.LineSegments(panelGeo.clone(), panelMat)
    panelR.position.x = -0.07
    sat.add(panelL, panelR)

    const beaconMat = new THREE.MeshBasicMaterial({
      color: '#ffd28a',
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.005, 8, 8), beaconMat)
    sat.add(beacon)

    group.add(sat)
    return {
      group,
      sat,
      beaconMat,
      orbitMat,
      dispose: () => {
        orbitGeo.dispose()
        orbitMat.dispose()
        body.geometry.dispose()
        panelGeo.dispose()
        panelL.geometry.dispose()
        panelR.geometry.dispose()
        panelMat.dispose()
        lineMat.dispose()
        beacon.geometry.dispose()
        beaconMat.dispose()
      },
    }
  }, [])

  useEffect(() => () => built.dispose(), [built])

  useFrame((state) => {
    const t = state.clock.elapsedTime
    const speed = reducedRef.current ? 0.5 : 1
    const a = t * ((Math.PI * 2) / 44) * speed + 1.2
    built.sat.position.set(Math.cos(a) * 1.78, Math.sin(a) * 1.78, 0)
    built.sat.rotation.y = t * 0.4
    built.beaconMat.opacity = 0.4 + 0.6 * Math.max(0, Math.sin(t * 3.2)) ** 3
  })

  return <primitive object={built.group} dispose={null} />
}
