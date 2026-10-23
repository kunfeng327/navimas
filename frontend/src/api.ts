// 全局配置与 API 工具

export const API_BASE = (import.meta.env.VITE_API_BASE ?? '').replace(/\/$/, '')
export const AMAP_KEY = (import.meta.env.VITE_AMAP_KEY as string) || '0330c6d0d3dd574f2658b2916fb3d1d8'
export const AMAP_SECURITY_CODE = (import.meta.env.VITE_AMAP_SECURITY_CODE as string) || '11a070cce61e9063a28238584c328ad2'

export const buildApi = (path: string) => API_BASE + path

// ---------- 类型 ----------

export interface TimelineDetail {
  time: string
  desc: string
}

export interface TimelineNode {
  name: string
  lnglat: [number, number]
}

export interface TimelineDay {
  dayLabel?: string
  date?: string
  title: string
  details: TimelineDetail[]
  nodes?: TimelineNode[]
}

export interface TimelineData {
  days: TimelineDay[]
}

export interface HistoryEntry {
  id: number
  sessionId: string
  title: string
  timeline: TimelineData
}

export interface ProfileRow {
  id: number
  date: string
  destination: string
  attractions: string
  cost: number
}

export interface ProfileResponse {
  status: 'success' | 'empty'
  stats?: { total_trips: number; total_cost: number; favorite_city: string }
  pie_data?: { name: string; value: number }[]
  table_data?: ProfileRow[]
}

// ---------- localStorage ----------

export const storage = {
  getHistory(): HistoryEntry[] {
    try {
      return JSON.parse(localStorage.getItem('navimas_history') || '[]')
    } catch {
      return []
    }
  },
  setHistory(list: HistoryEntry[]) {
    localStorage.setItem('navimas_history', JSON.stringify(list))
  },
  getAgentData(): TimelineData | null {
    try {
      return JSON.parse(localStorage.getItem('navimas_agent_data') || 'null')
    } catch {
      return null
    }
  },
  setAgentData(data: TimelineData) {
    localStorage.setItem('navimas_agent_data', JSON.stringify(data))
  },
}
