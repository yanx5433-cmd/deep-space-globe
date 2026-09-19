import { useEffect, useState } from 'react'
import { getGestureEngine } from '../gestures/GestureEngine'
import { useStore } from '../state/store'

/** 首次进入的启动覆盖层：启用手势控制 / 仅使用鼠标 */
export function StartupOverlay() {
  const overlayOpen = useStore((s) => s.overlayOpen)
  const bootError = useStore((s) => s.bootError)
  const setOverlayOpen = useStore((s) => s.setOverlayOpen)
  const setBootError = useStore((s) => s.setBootError)
  const engineStatus = useStore((s) => s.engineStatus)
  const [render, setRender] = useState(overlayOpen)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (overlayOpen) {
      setRender(true)
      return
    }
    const t = window.setTimeout(() => setRender(false), 700)
    return () => window.clearTimeout(t)
  }, [overlayOpen])

  // 引擎就绪后自动关闭覆盖层
  useEffect(() => {
    if (engineStatus === 'ready' && overlayOpen) setOverlayOpen(false)
  }, [engineStatus, overlayOpen, setOverlayOpen])

  if (!render) return null

  const enableGestures = async () => {
    if (busy) return
    setBusy(true)
    setBootError(null)
    const res = await getGestureEngine().enable()
    setBusy(false)
    if (!res.ok) setBootError(res.reason)
  }

  const mouseOnly = () => {
    setOverlayOpen(false)
  }

  return (
    <div className={`overlay ${overlayOpen ? '' : 'closing'}`}>
      <div className="overlay-panel">
        <div className="overlay-eyebrow">DEEP-SPACE CARTOGRAPHER</div>
        <div className="overlay-title">启动深空制图仪</div>
        <div className="overlay-desc">启用摄像头后可使用手势控制，也可以使用鼠标操作</div>
        <div className="overlay-list">
          <div>移动手掌 —— 旋转地球</div>
          <div>手掌推近 / 拉远 —— 放大 / 缩小</div>
          <div>握拳 —— 持续拉远，保持 2 秒重置视角</div>
          <div>食指指向热点并停留 —— 聚焦城市</div>
        </div>
        <div className="overlay-actions">
          <button className="btn-primary" onClick={enableGestures} disabled={busy}>
            {busy ? '正在初始化…' : '启用手势控制'}
          </button>
          <button className="btn-ghost" onClick={mouseOnly}>
            仅使用鼠标
          </button>
        </div>
        {busy && <div className="overlay-status">正在请求摄像头权限并加载手势引擎…</div>}
        {bootError && !busy && <div className="overlay-error">{bootError}</div>}
        <div className="overlay-note">摄像头画面仅在本地浏览器内处理，不会上传任何数据</div>
      </div>
    </div>
  )
}
