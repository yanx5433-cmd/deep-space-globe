import { useEffect, useRef } from 'react'
import { getGestureEngine } from '../gestures/GestureEngine'
import { useStore } from '../state/store'
import { uiRegistry } from '../state/uiRegistry'

/** 右下角摄像头调试画面（镜像视频 + 关键点叠加），默认隐藏 */
export function DebugPanel() {
  const enabled = useStore((s) => s.settings.debugVideo)
  const engineStatus = useStore((s) => s.engineStatus)
  const cameraStatus = useStore((s) => s.cameraStatus)
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (!enabled) {
      uiRegistry.debugCanvas = null
      uiRegistry.debugCtx = null
      return
    }
    uiRegistry.debugCanvas = canvasRef.current
    const v = videoRef.current
    const stream = getGestureEngine().streamForDebug
    if (v && stream) {
      v.srcObject = stream
      v.play().catch(() => undefined)
    }
    return () => {
      uiRegistry.debugCanvas = null
      uiRegistry.debugCtx = null
    }
  }, [enabled, engineStatus, cameraStatus])

  if (!enabled) return null

  return (
    <div className="debug-panel">
      <div className="debug-inner">
        <video ref={videoRef} autoPlay muted playsInline />
        <canvas ref={canvasRef} width={320} height={240} />
      </div>
      <div className="debug-tag">CAMERA · 本地处理 · 手势引擎 {engineStatus === 'ready' ? '运行中' : '未就绪'}</div>
    </div>
  )
}
