import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import * as echarts from 'echarts'
import { buildApi, ProfileResponse, ProfileRow } from '../api'

export default function Profile() {
  const navigate = useNavigate()
  const [data, setData] = useState<ProfileResponse | null>(null)
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')
  const pieRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<echarts.ECharts>()
  const editing = useRef<Record<number, ProfileRow>>({})

  const showToast = (text: string) => {
    setToast(text)
    setTimeout(() => setToast(''), 2500)
  }

  const load = () => {
    fetch(buildApi('/api/profile'))
      .then((r) => r.json())
      .then((d: ProfileResponse) => {
        setData(d)
        editing.current = {}
        Object.fromEntries((d.table_data || []).map((row) => [row.id, { ...row }]))
      })
      .catch(() => setError('无法连接后端，请确认 Go 服务已启动。'))
  }

  useEffect(load, [])

  // 渲染饼图
  useEffect(() => {
    if (!data?.pie_data?.length || !pieRef.current) return
    chartRef.current?.dispose()
    const chart = echarts.init(pieRef.current)
    chartRef.current = chart
    chart.setOption({
      tooltip: { trigger: 'item' },
      legend: { bottom: 0, icon: 'circle' },
      series: [{
        type: 'pie',
        radius: ['50%', '75%'],
        label: { show: false },
        itemStyle: { borderColor: '#fff', borderWidth: 3 },
        emphasis: { label: { show: true, fontSize: 20, fontWeight: 'bold' } },
        color: ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4'],
        data: data.pie_data,
      }],
    })
    const onResize = () => chart.resize()
    window.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('resize', onResize)
      chart.dispose()
    }
  }, [data])

  const api = (path: string, body?: unknown) =>
    fetch(buildApi(path), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    })

  const saveRow = async (id: number) => {
    const row = editing.current[id]
    if (!row) return
    const res = await api('/api/profile/update', row)
    if (res.ok) {
      showToast('✓ 数据已云同步')
      load()
    } else {
      showToast('✗ 保存失败')
    }
  }

  const deleteRow = async (id: number) => {
    if (!confirm('确定删除这条足迹吗？')) return
    const res = await api('/api/profile/delete', { id })
    if (res.ok) load()
    else alert('删除失败，未找到记录。')
  }

  const addRow = async () => {
    if (await api('/api/profile/add')) {
      load()
      showToast('➕ 已添加一条空记录，请在表格中直接修改！')
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="flex items-center justify-between px-6 py-4 bg-white border-b">
        <button onClick={() => navigate('/')} className="text-sm text-slate-500 hover:text-emerald-600">
          <i className="fa-solid fa-arrow-left mr-1" />返回规划台
        </button>
        <h1 className="font-bold text-lg">
          <i className="fa-solid fa-chart-pie text-cyan-500 mr-2" />个人旅行档案
        </h1>
      </header>

      {toast && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 bg-slate-800 text-white text-sm px-4 py-2 rounded-full shadow-lg animate-fade-in">
          {toast}
        </div>
      )}

      <main className="max-w-6xl mx-auto p-6 space-y-6">
        {error && <div className="bg-rose-50 text-rose-600 rounded-xl px-4 py-3 text-sm">{error}</div>}

        {/* 统计卡 */}
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: '总计出行', value: data?.stats?.total_trips ?? '—', icon: 'fa-suitcase-rolling', color: 'from-emerald-500 to-cyan-500' },
            { label: '最常去目的地', value: data?.stats?.favorite_city ?? '—', icon: 'fa-heart', color: 'from-rose-500 to-orange-500' },
            { label: '累计预估花费', value: data?.stats ? `¥${Math.round(data.stats.total_cost)}` : '—', icon: 'fa-coins', color: 'from-blue-500 to-purple-500' },
          ].map((s) => (
            <div key={s.label} className={`rounded-2xl p-5 text-white bg-gradient-to-br ${s.color} shadow-lg`}>
              <i className={`fa-solid ${s.icon} text-2xl opacity-80`} />
              <p className="text-2xl font-bold mt-2">{s.value}</p>
              <p className="text-xs opacity-80">{s.label}</p>
            </div>
          ))}
        </div>

        <div className="grid lg:grid-cols-5 gap-6">
          {/* 饼图 */}
          <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-slate-100 p-4">
            <p className="text-sm font-semibold text-slate-600 mb-2">目的地分布</p>
            {data?.pie_data?.length ? (
              <div ref={pieRef} className="h-72" />
            ) : (
              <div className="h-72 flex items-center justify-center text-sm text-slate-400">暂无数据</div>
            )}
          </div>

          {/* 表格 */}
          <div className="lg:col-span-3 bg-white rounded-2xl shadow-sm border border-slate-100 p-4 overflow-x-auto">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-semibold text-slate-600">足迹明细（单元格可直接编辑）</p>
              <button onClick={addRow} className="text-xs px-3 py-1.5 rounded-lg bg-emerald-500 text-white hover:bg-emerald-600">
                <i className="fa-solid fa-plus mr-1" />手动添加足迹
              </button>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-400 border-b">
                  <th className="py-2">日期</th><th>目的地</th><th>核心景点</th><th>花费</th><th>操作</th>
                </tr>
              </thead>
              <tbody>
                {(data?.table_data || []).map((row) => (
                  <tr key={row.id} className="border-b border-slate-50 hover:bg-slate-50/50">
                    {(['date', 'destination', 'attractions'] as const).map((f) => (
                      <td
                        key={f}
                        contentEditable
                        suppressContentEditableWarning
                        className="py-2 px-1 outline-none focus:ring-1 focus:ring-emerald-400 rounded min-w-16"
                        onInput={(e) => {
                          editing.current[row.id] = editing.current[row.id] || { ...row }
                          ;(editing.current[row.id] as any)[f] = e.currentTarget.textContent || ''
                        }}
                      >
                        {row[f]}
                      </td>
                    ))}
                    <td
                      contentEditable
                      suppressContentEditableWarning
                      className="py-2 px-1 outline-none focus:ring-1 focus:ring-emerald-400 rounded"
                      onInput={(e) => {
                        editing.current[row.id] = editing.current[row.id] || { ...row }
                        editing.current[row.id].cost = parseFloat((e.currentTarget.textContent || '0').replace(/[^0-9.-]+/g, '')) || 0
                      }}
                    >
                      {row.cost}
                    </td>
                    <td className="py-2 whitespace-nowrap">
                      <button onClick={() => saveRow(row.id)} className="text-emerald-500 hover:text-emerald-600 mr-2" title="保存">
                        <i className="fa-solid fa-cloud-arrow-up" />
                      </button>
                      <button onClick={() => deleteRow(row.id)} className="text-rose-400 hover:text-rose-500" title="删除">
                        <i className="fa-solid fa-trash-can" />
                      </button>
                    </td>
                  </tr>
                ))}
                {!data?.table_data?.length && (
                  <tr><td colSpan={5} className="py-8 text-center text-slate-400 text-sm">暂无足迹记录</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  )
}
