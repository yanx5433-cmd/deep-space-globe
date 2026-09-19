import { useEffect, useState } from 'react'
import { CITIES } from '../data/cities'
import { fmtCoord } from '../lib/geo'
import { useStore, type GestureKind } from '../state/store'
import { telemetry } from '../state/telemetry'

const GESTURE_LABEL: Record<GestureKind, string> = {
  none: '—',
  open: '张开手掌',
  pinch: '双指张合',
  point: '食指指向',
  fist: '握拳',
}

interface Snap {
  fps: number
  lon: number
  lat: number
  zoom: number
  particles: number
}

/** 左上角极简透明 HUD，低频轮询遥测数据 */
export function HUD() {
  const selectedId = useStore((s) => s.selectedCityId)
  const gesture = useStore((s) => s.gesture)
  const tracking = useStore((s) => s.tracking)
  const engineStatus = useStore((s) => s.engineStatus)
  const [snap, setSnap] = useState<Snap>({ fps: 0, lon: 105, lat: 24, zoom: 1, particles: 0 })

  useEffect(() => {
    const id = window.setInterval(() => {
      setSnap({
        fps: telemetry.fps,
        lon: telemetry.lon,
        lat: telemetry.lat,
        zoom: telemetry.zoomMult,
        particles: telemetry.particles,
      })
    }, 220)
    return () => window.clearInterval(id)
  }, [])

  const city = selectedId ? CITIES.find((c) => c.id === selectedId) : undefined

  let trackLabel = '离线'
  let trackTone = 'dim'
  if (engineStatus === 'loading') {
    trackLabel = '初始化'
    trackTone = 'warm'
  } else if (engineStatus === 'ready') {
    if (tracking) {
      trackLabel = '已锁定'
      trackTone = 'good'
    } else {
      trackLabel = '搜索手部…'
      trackTone = 'warm'
    }
  } else if (engineStatus === 'error') {
    trackLabel = '不可用'
    trackTone = 'bad'
  }

  const gestureLabel = engineStatus === 'ready' ? (tracking ? GESTURE_LABEL[gesture] : '未检测') : '未启用'

  return (
    <div className="hud">
      <div className="hud-title">深空制图仪</div>
      <div className="hud-sub">手势控制 · 实时追踪</div>
      <div className="hud-en">DEEP-SPACE CARTOGRAPHER</div>
      <div className="hud-sep" />
      <div className="hud-row">
        <span className="hud-k">经度</span>
        <span className="hud-v">
          {Math.abs(snap.lon).toFixed(1)}°{snap.lon >= 0 ? 'E' : 'W'}
        </span>
      </div>
      <div className="hud-row">
        <span className="hud-k">纬度</span>
        <span className="hud-v">
          {Math.abs(snap.lat).toFixed(1)}°{snap.lat >= 0 ? 'N' : 'S'}
        </span>
      </div>
      <div className="hud-row">
        <span className="hud-k">缩放</span>
        <span className="hud-v">{snap.zoom.toFixed(2)}×</span>
      </div>
      <div className="hud-row">
        <span className="hud-k">手势</span>
        <span className="hud-v">{gestureLabel}</span>
      </div>
      <div className="hud-row">
        <span className="hud-k">追踪</span>
        <span className={`hud-v tone-${trackTone}`}>{trackLabel}</span>
      </div>
      <div className="hud-row">
        <span className="hud-k">FPS</span>
        <span className={`hud-v ${snap.fps < 30 ? 'tone-bad' : snap.fps < 50 ? 'tone-warm' : ''}`}>{snap.fps || '—'}</span>
      </div>
      <div className="hud-sep" />
      <div className="hud-row">
        <span className="hud-k">地表粒子</span>
        <span className="hud-v">{snap.particles.toLocaleString()}</span>
      </div>
      <div className="hud-row">
        <span className="hud-k">城市节点</span>
        <span className="hud-v">{telemetry.cities}</span>
      </div>
      <div className="hud-row">
        <span className="hud-k">航线</span>
        <span className="hud-v">{telemetry.routes}</span>
      </div>
      <div className="hud-row">
        <span className="hud-k">聚焦</span>
        <span className="hud-v gold">{city ? city.zh : '——'}</span>
      </div>
      {city && <div className="hud-focus-coord">{fmtCoord(city.lat, city.lon)}</div>}
    </div>
  )
}
