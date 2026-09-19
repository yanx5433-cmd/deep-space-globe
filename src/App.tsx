import { Component, useEffect, useRef, type ReactNode } from 'react'
import { Canvas } from '@react-three/fiber'
import { Scene } from './scene/Scene'
import { HUD } from './ui/HUD'
import { StatusCluster } from './ui/StatusCluster'
import { Hints } from './ui/Hints'
import { CityCaption } from './ui/CityCaption'
import { Crosshair } from './ui/Crosshair'
import { DebugPanel } from './ui/DebugPanel'
import { StartupOverlay } from './ui/StartupOverlay'
import { Toasts } from './ui/Toasts'
import { usePointerControls } from './ui/pointer'
import { useStore } from './state/store'
import { controls } from './state/controls'
import { telemetry } from './state/telemetry'
import { setSoundEnabled } from './lib/audio'

class SceneBoundary extends Component<{ children: ReactNode }, { err: Error | null }> {
  state = { err: null as Error | null }
  static getDerivedStateFromError(err: Error) {
    return { err }
  }
  componentDidCatch(err: Error, info: React.ErrorInfo) {
    console.error('[globe] 场景渲染失败', err, info.componentStack)
    ;(window as unknown as Record<string, unknown>).__sceneErr = String(err?.stack ?? err)
  }
  render() {
    if (this.state.err) {
      return (
        <div className="gl-fallback">
          <div>3D 渲染初始化失败</div>
          <div className="dim">请确认浏览器支持 WebGL，或更换 Chrome / Edge 后重试</div>
        </div>
      )
    }
    return this.props.children
  }
}

export default function App() {
  const holderRef = useRef<HTMLDivElement>(null)
  usePointerControls(holderRef)

  // prefers-reduced-motion 同步
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const apply = () => useStore.getState().setReducedMotion(mq.matches)
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [])

  // 自动旋转设置 → 控制核心
  const autoRotate = useStore((s) => s.settings.autoRotate)
  useEffect(() => {
    controls.autoRotate = autoRotate
  }, [autoRotate])

  // 声音设置
  const sound = useStore((s) => s.settings.sound)
  useEffect(() => {
    setSoundEnabled(sound)
    return () => setSoundEnabled(false)
  }, [sound])

  // ESC 复位
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') useStore.getState().selectCity(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const reduced = useStore((s) => s.reducedMotion)

  // 开发调试句柄
  useEffect(() => {
    if (import.meta.env.DEV) {
      ;(window as unknown as Record<string, unknown>).__globe = {
        controls,
        telemetry,
        store: useStore,
      }
    }
  }, [])

  return (
    <div className="app-root" data-reduced={reduced ? 'true' : 'false'}>
      <div className="scene-holder" ref={holderRef}>
        <SceneBoundary>
          <Canvas
            dpr={[1, 2]}
            camera={{ fov: 42, near: 0.05, far: 400, position: [0, 0, 4.6] }}
            gl={{ antialias: true, powerPreference: 'high-performance' }}
          >
            <Scene />
          </Canvas>
        </SceneBoundary>
      </div>
      <div className="vignette" />
      <Crosshair />
      <HUD />
      <StatusCluster />
      <Hints />
      <CityCaption />
      <DebugPanel />
      <Toasts />
      <StartupOverlay />
    </div>
  )
}
