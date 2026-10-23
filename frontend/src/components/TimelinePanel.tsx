import { TimelineData } from '../api'

const THEME_COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#8b5cf6', '#ec4899']

export default function TimelinePanel({
  timeline,
  region,
  processing,
}: {
  timeline: TimelineData | null
  region: string
  processing: boolean
}) {
  return (
    <div className="p-4 space-y-4">
      {/* 状态徽标 */}
      <div className={`inline-flex items-center gap-1.5 text-xs font-medium rounded-full px-3 py-1 ${
        timeline ? 'bg-emerald-100 text-emerald-700'
        : processing ? 'bg-amber-100 text-amber-700'
        : 'bg-slate-100 text-slate-500'
      }`}>
        <i className={`fa-solid ${timeline ? 'fa-check-double' : processing ? 'fa-spinner fa-spin' : 'fa-satellite-dish'}`} />
        {timeline ? '方案已生成' : processing ? '多智能体调度中' : '待机 · 等待指令'}
      </div>

      {/* 空间拓扑卡片 */}
      <div className="rounded-2xl border border-slate-100 dark:border-slate-700 bg-gradient-to-br from-slate-900 to-slate-800 p-4 text-white relative overflow-hidden">
        <div className="relative z-10">
          <p className="text-xs text-slate-400 mb-1">空间拓扑地图</p>
          {timeline ? (
            <button
              onClick={() => window.open('#/sandbox', '_blank')}
              className="text-sm font-semibold text-emerald-400 hover:text-emerald-300 transition"
            >
              最优游玩路线拓扑已建立 <i className="fa-solid fa-arrow-up-right-from-square text-xs" />
            </button>
          ) : (
            <p className="text-sm text-slate-300">
              {processing ? `正在锁定 ${region || '目标'} 空间 POI 数据...` : '生成方案后可查看可视化沙盘'}
            </p>
          )}
        </div>
        {processing && (
          <span className="absolute right-6 top-8 h-3 w-3 rounded-full bg-emerald-400 animate-pulse-dot" />
        )}
        <i className="fa-solid fa-earth-asia absolute -right-4 -bottom-4 text-7xl text-white/5" />
      </div>

      {/* 时间线 */}
      <div className="space-y-3">
        <p className="text-xs font-semibold text-slate-400">
          <i className="fa-solid fa-timeline mr-1" />每日行程时间线
        </p>
        {!timeline && (
          <>
            <div className={`rounded-2xl border p-4 ${processing ? 'border-amber-200 bg-amber-50/50 dark:bg-amber-900/10 animate-pulse' : 'border-slate-100 dark:border-slate-700'}`}>
              <p className={`text-xs font-semibold ${processing ? 'text-amber-600' : 'text-slate-400'}`}>
                {processing ? 'Planner 解析中...' : '等待 TDAG 任务图'}
              </p>
              <div className="mt-2 space-y-2">
                <div className="h-2 rounded bg-slate-200 dark:bg-slate-700" />
                <div className="h-2 w-2/3 rounded bg-slate-200 dark:bg-slate-700" />
              </div>
            </div>
            {processing && (
              <div className="rounded-2xl border border-slate-100 dark:border-slate-700 p-4">
                <p className="text-xs text-slate-400">Executor 挂起 / 等待 TDAG 依赖释放...</p>
              </div>
            )}
          </>
        )}
        {timeline?.days?.map((day, i) => (
          <div
            key={i}
            className="rounded-2xl border border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 p-4 animate-fade-in"
            style={{ animationDelay: `${i * 0.1}s` }}
          >
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs text-slate-400">{day.dayLabel || `DAY${i + 1}`}</span>
              {day.date && <span className="text-[10px] bg-slate-200 dark:bg-slate-700 rounded-full px-2 py-0.5 text-slate-500">{day.date}</span>}
              <i className="h-2 w-2 rounded-full" style={{ background: THEME_COLORS[i % 5] }} />
            </div>
            <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400 mb-2">{day.title}</p>
            <div className="space-y-1">
              {day.details?.map((d, j) => (
                <div key={j} className="flex gap-2 text-xs">
                  <span className={`shrink-0 font-medium ${
                    d.time.includes('下') ? 'text-blue-500'
                    : /晚|夜/.test(d.time) ? 'text-purple-500'
                    : 'text-amber-500'
                  }`}>{d.time}</span>
                  <span className="text-slate-600 dark:text-slate-300">{d.desc}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
        {timeline && !timeline.days?.length && (
          <p className="text-xs text-slate-400">无法结构化提取日程，请参考左侧正文。</p>
        )}
      </div>
    </div>
  )
}
