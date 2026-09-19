import { useEffect, useState } from 'react'
import { CITIES, type City } from '../data/cities'
import { fmtCoord } from '../lib/geo'
import { useStore } from '../state/store'

/** 底部中央电影字幕：淡入上浮 → 停留 → 淡出 */
export function CityCaption() {
  const selectedId = useStore((s) => s.selectedCityId)
  const [city, setCity] = useState<City | null>(null)
  const [phase, setPhase] = useState<'hidden' | 'show' | 'out'>('hidden')

  useEffect(() => {
    if (!selectedId) {
      setPhase((p) => (p === 'show' ? 'out' : p))
      return
    }
    const c = CITIES.find((x) => x.id === selectedId)
    if (!c) return
    setCity(c)
    setPhase('show')
    const t = window.setTimeout(() => setPhase('out'), 4800)
    return () => window.clearTimeout(t)
  }, [selectedId])

  useEffect(() => {
    if (phase !== 'out') return
    const t = window.setTimeout(() => setPhase('hidden'), 900)
    return () => window.clearTimeout(t)
  }, [phase])

  if (phase === 'hidden' || !city) return null

  return (
    <div key={city.id} className={`caption ${phase}`}>
      <div className="caption-zh">{city.zh}</div>
      <div className="caption-line" />
      <div className="caption-en">
        {city.en.toUpperCase()} · {fmtCoord(city.lat, city.lon)}
      </div>
    </div>
  )
}
