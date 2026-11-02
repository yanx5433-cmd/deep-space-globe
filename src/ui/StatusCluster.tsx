import { useEffect, useRef, useState } from 'react'
import { useStore, type CameraStatus, type EngineStatus } from '../state/store'
import { getGestureEngine } from '../gestures/GestureEngine'

const CAM_LABEL: Record<CameraStatus, { text: string; tone: string }> = {
  off: { text: '摄像头 关', tone: 'off' },
  requesting: { text: '摄像头 请求中', tone: 'requesting' },
  online: { text: '摄像头 在线', tone: 'online' },
  denied: { text: '摄像头 已拒绝', tone: 'error' },
  missing: { text: '摄像头 未找到', tone: 'error' },
  busy: { text: '摄像头 被占用', tone: 'error' },
  insecure: { text: '摄像头 需安全环境', tone: 'error' },
  error: { text: '摄像头 异常', tone: 'error' },
}

const ENGINE_LABEL: Record<EngineStatus, { text: string; tone: string }> = {
  off: { text: '手势 未启用', tone: 'off' },
  loading: { text: '手势 加载中', tone: 'requesting' },
  ready: { text: '手势 运行中', tone: 'online' },
  error: { text: '手势 失败', tone: 'error' },
}

/** 右上角状态区：摄像头状态 / 手势识别状态 / 自动旋转开关 / 设置 */
export function StatusCluster() {
  const cameraStatus = useStore((s) => s.cameraStatus)
  const engineStatus = useStore((s) => s.engineStatus)
  const settings = useStore((s) => s.settings)
  const patchSettings = useStore((s) => s.patchSettings)
  const pushToast = useStore((s) => s.pushToast)
  const [menuOpen, setMenuOpen] = useState(false)
  const [starting, setStarting] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    const onDown = (e: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    window.addEventListener('pointerdown', onDown)
    return () => window.removeEventListener('pointerdown', onDown)
  }, [menuOpen])

  const cam = CAM_LABEL[cameraStatus]
  const eng = ENGINE_LABEL[engineStatus]

  const restartGesture = async () => {
    if (starting) return
    setStarting(true)
    const res = await getGestureEngine().enable()
    setStarting(false)
    if (!res.ok) pushToast(res.reason, 'error')
    else {
      setMenuOpen(false)
      pushToast('手势控制已启动', 'info')
    }
  }

  return (
    <div className="status-cluster">
      <div className="chip">
        <span className={`dot ${cam.tone}`} />
        {cam.text}
      </div>
      <div className="chip">
        <span className={`dot ${eng.tone}`} />
        {eng.text}
      </div>
      <button
        className={`chip chip-btn ${settings.autoRotate ? 'on' : ''}`}
        onClick={() => patchSettings({ autoRotate: !settings.autoRotate })}
        title="切换自动旋转"
      >
        自动旋转 {settings.autoRotate ? '开' : '关'}
      </button>
      <div className="menu-anchor" ref={menuRef}>
        <button className={`chip chip-btn ${menuOpen ? 'on' : ''}`} onClick={() => setMenuOpen((v) => !v)}>
          设置 ▾
        </button>
        {menuOpen && (
          <div className="popover">
            <div className="pop-row">
              <span>灵敏度</span>
              <div className="seg">
                {(['low', 'standard', 'high'] as const).map((lv) => (
                  <button
                    key={lv}
                    className={`seg-btn ${settings.sensitivity === lv ? 'on' : ''}`}
                    onClick={() => patchSettings({ sensitivity: lv })}
                  >
                    {lv === 'low' ? '低' : lv === 'standard' ? '标准' : '高'}
                  </button>
                ))}
              </div>
            </div>
            <div className="pop-row">
              <span>显示调试画面</span>
              <span
                className={`switch ${settings.debugVideo ? 'on' : ''}`}
                onClick={() => patchSettings({ debugVideo: !settings.debugVideo })}
              />
            </div>
            <div className="pop-row">
              <span>环境音效</span>
              <span
                className={`switch ${settings.sound ? 'on' : ''}`}
                onClick={() => patchSettings({ sound: !settings.sound })}
              />
            </div>
            {(engineStatus === 'off' || engineStatus === 'error') && (
              <button className="pop-btn" onClick={restartGesture} disabled={starting}>
                {starting ? '启动中…' : '启用手势控制'}
              </button>
            )}
            <div className="pop-note">摄像头画面仅在本地处理，不会上传</div>
          </div>
        )}
      </div>
    </div>
  )
}
