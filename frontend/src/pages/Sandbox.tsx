import { useEffect, useState } from 'react'
import AMapLoader from '@amap/amap-jsapi-loader'
import { AMAP_KEY, AMAP_SECURITY_CODE, storage, TimelineDay } from '../api'

const THEME_COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#8b5cf6', '#ec4899']

type Schedule = Record<string, { name: string; color: string; nodes: { name: string; lnglat: [number, number] }[] }>

export default function Sandbox() {
  const [schedule, setSchedule] = useState<Schedule>({})
  const [activeDay, setActiveDay] = useState('')
  const [mapReady, setMapReady] = useState(false)

  useEffect(() => {
    const data = storage.getAgentData()
    if (data?.days?.length) {
      const s: Schedule = {}
      data.days.forEach((day: TimelineDay, i: number) => {
        s[day.dayLabel || `DAY${i + 1}`] = {
          name: day.title,
          color: THEME_COLORS[i % 5],
          nodes: day.nodes || [],
        }
      })
      setSchedule(s)
    } else {
      setSchedule({ '提示': { name: '暂无带有坐标的行程数据', color: '#6b7280', nodes: [] } })
    }
  }, [])

  useEffect(() => {
    ;(window as any)._AMapSecurityConfig = { securityJsCode: AMAP_SECURITY_CODE }
    let map: any
    let AMap: any

    AMapLoader.load({ key: AMAP_KEY, version: '2.0' }).then((amap) => {
      AMap = amap
      map = new AMap.Map('sandbox-map', {
        zoom: 12,
        center: [120.151126, 30.26477],
        mapStyle: 'amap://styles/darkblue',
      })
      ;(window as any).__sandboxMap = map
      ;(window as any).__sandboxAMap = AMap
      setMapReady(true)
    })

    return () => map?.destroy()
  }, [])

  const renderDayRoute = (dayKey: string) => {
    const map = (window as any).__sandboxMap
    const AMap = (window as any).__sandboxAMap
    if (!map || !AMap) return
    const day = schedule[dayKey]
    setActiveDay(dayKey)
    map.clearMap()
    if (!day?.nodes?.length) return

    const path: [number, number][] = []
    day.nodes.forEach((node, i) => {
      if (!Array.isArray(node.lnglat) || node.lnglat.length !== 2) return
      path.push(node.lnglat)
      const content = `<div style="display:flex;align-items:center;gap:4px;">
        <div style="width:28px;height:28px;border-radius:50%;background:${day.color};color:#fff;font-size:12px;font-weight:bold;display:flex;align-items:center;justify-content:center;box-shadow:0 0 8px ${day.color};">${i + 1}</div>
        <div style="background:rgba(15,23,42,.85);color:#fff;font-size:11px;padding:2px 6px;border-radius:4px;white-space:nowrap;">${node.name}</div>
      </div>`
      map.add(new AMap.Marker({ position: node.lnglat, content, offset: new AMap.Pixel(-14, -14) }))
    })

    if (path.length > 1) {
      map.add(new AMap.Polyline({
        path,
        isOutline: true,
        outlineColor: '#1f2937',
        borderWeight: 2,
        strokeColor: day.color,
        strokeWeight: 4,
        showDir: true,
        dirColor: '#ffffff',
      }))
    }
    map.setFitView()
  }

  return (
    <div className="relative h-screen w-full bg-slate-900">
      <div id="sandbox-map" className="absolute inset-0" />

      {/* 日程图层控制 */}
      <div className="absolute top-4 left-4 z-10 bg-slate-900/80 backdrop-blur rounded-2xl p-4 border border-slate-700/50 max-w-60">
        <p className="text-xs text-slate-400 mb-2 font-semibold">
          <i className="fa-solid fa-layer-group mr-1" />日程图层控制
        </p>
        <div className="space-y-1.5">
          {Object.keys(schedule).length === 0 && !mapReady && (
            <p className="text-xs text-slate-500">地图加载中...</p>
          )}
          {Object.entries(schedule).map(([key, day]) => (
            <button
              key={key}
              onClick={() => renderDayRoute(key)}
              className={`w-full text-left px-3 py-2 rounded-xl text-xs transition border ${
                activeDay === key
                  ? 'bg-slate-700 text-white border-transparent'
                  : 'bg-transparent text-slate-300 border-slate-700/50 hover:bg-slate-800'
              }`}
            >
              <span className="inline-block h-2 w-2 rounded-full mr-2" style={{ background: day.color }} />
              {key}
              <span className="block text-[10px] text-slate-400 mt-0.5 truncate">{day.name}</span>
            </button>
          ))}
        </div>
      </div>

      <a href="#/" target="_self" className="absolute bottom-4 left-4 z-10 text-xs text-slate-400 bg-slate-900/80 rounded-full px-3 py-1.5 hover:text-emerald-400">
        <i className="fa-solid fa-arrow-left mr-1" />返回
      </a>
    </div>
  )
}
