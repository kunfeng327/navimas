import { useEffect, useRef, useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { marked } from 'marked'
import { buildApi, storage, TimelineData } from '../api'
import { useTheme, ThemeButton } from '../theme'
import TimelinePanel from '../components/TimelinePanel'

marked.setOptions({ breaks: true })

interface ChatMsg {
  role: 'user' | 'ai'
  html?: string
  tags?: { label: string; color: string }[]
  text?: string
}

interface LogItem {
  id: number
  icon: string
  color: string
  html: string
  alert?: boolean
}

let logId = 0
function logMeta(content: string): { icon: string; color: string; alert?: boolean } {
  if (/TDAG|拆解|构建/.test(content)) return { icon: 'fa-code-branch', color: 'text-amber-500' }
  if (/资源调度|匹配环节|执行/.test(content)) return { icon: 'fa-route', color: 'text-emerald-500' }
  if (/校验/.test(content)) return { icon: 'fa-scale-balanced', color: 'text-cyan-500' }
  if (/通过/.test(content)) return { icon: 'fa-circle-check', color: 'text-green-500' }
  if (/冲突|重调|打回|异常|失败/.test(content)) return { icon: 'fa-triangle-exclamation', color: 'text-rose-500', alert: true }
  return { icon: 'fa-terminal', color: 'text-slate-400' }
}

export default function Chat() {
  const { dark, toggle } = useTheme()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const [messages, setMessages] = useState<ChatMsg[]>([])
  const [logs, setLogs] = useState<LogItem[]>([])
  const [answerHtml, setAnswerHtml] = useState('')
  const [showAnswer, setShowAnswer] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [timeline, setTimeline] = useState<TimelineData | null>(null)
  const [savedAnswer, setSavedAnswer] = useState(false)
  const [historyList, setHistoryList] = useState(storage.getHistory())

  const [region, setRegion] = useState('')
  // 测试便利：日期默认为今天到 3 天后
  const todayStr = new Date().toISOString().slice(0, 10)
  const threeDaysLaterStr = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10)
  const [startDate, setStartDate] = useState(todayStr)
  const [endDate, setEndDate] = useState(threeDaysLaterStr)
  const [people, setPeople] = useState(2)
  const [budget, setBudget] = useState(3000)
  const [requirements, setRequirements] = useState('')
  const [imageData, setImageData] = useState<string | null>(null)

  const sessionRef = useRef('')
  const fullAnswerRef = useRef('')
  const chatBottom = useRef<HTMLDivElement>(null)

  const user = localStorage.getItem('navimas_user')

  useEffect(() => {
    // 从灵感库导入
    const r = searchParams.get('region')
    const intent = searchParams.get('intent')
    if (r) {
      setRegion(r)
      if (intent) setRequirements(`【来自热门资讯】我想去 ${r}。${intent}`)
      window.history.replaceState(null, '', '#/')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    chatBottom.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, showAnswer])

  const saveToDB = (sessionId: string, role: 'user' | 'ai', content: string) => {
    fetch(buildApi('/api/history/save'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId, role, content }),
    }).catch((e) => console.error('保存历史失败:', e))
  }

  const saveTimelineToHistory = () => {
    if (!timeline) return
    const list = storage.getHistory()
    const dateStr = (startDate || new Date().toISOString().slice(0, 10)).replace(/-/g, '/')
    list.unshift({
      id: Date.now(),
      sessionId: sessionRef.current,
      title: `${dateStr} ${region}`,
      timeline,
    })
    storage.setHistory(list.slice(0, 50))
    setHistoryList(storage.getHistory())
    setSavedAnswer(true)
  }

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => setImageData(reader.result as string)
    reader.readAsDataURL(file)
  }

  const sendMessage = async () => {
    if (processing) return
    if (!region || !startDate || !endDate || !people || !budget) {
      alert('请完整填写目的地、日期、人数与预算！')
      return
    }
    if (endDate < startDate) {
      alert('结束日期不能早于开始日期！')
      return
    }

    const days = Math.ceil((new Date(endDate).getTime() - new Date(startDate).getTime()) / 86400000) + 1
    const assembled =
      `我计划去【${region}】旅行，出行日期为【${startDate}】至【${endDate}】（共 ${days} 天）。` +
      `本次出行一共【${people}】人，我们的总预算是极限【${budget}】元。\n` +
      `核心诉求与约束条件：${requirements || '无特殊要求，请结合具体的日期安排高性价比的合理行程，注意避开部分场馆的周一闭馆日，切勿超支。'}`

    const sessionId = 'trip_' + Date.now()
    sessionRef.current = sessionId
    fullAnswerRef.current = ''
    setProcessing(true)
    setLogs([])
    setAnswerHtml('')
    setShowAnswer(false)
    setTimeline(null)
    setSavedAnswer(false)
    setMessages((m) => [
      ...m,
      {
        role: 'user',
        tags: [
          { label: `📍 ${region}`, color: 'bg-emerald-100 text-emerald-700' },
          { label: `📅 ${days} 天`, color: 'bg-blue-100 text-blue-700' },
          { label: `👥 ${people} 人`, color: 'bg-purple-100 text-purple-700' },
          { label: `💰 ${budget} 元`, color: 'bg-amber-100 text-amber-700' },
        ],
        text: requirements || '无特殊要求，请生成高性价比行程。',
      },
    ])
    saveToDB(sessionId, 'user', assembled)

    try {
      const res = await fetch(buildApi('/api/chat'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: assembled, region, image: imageData }),
      })
      if (!res.ok || !res.body) throw new Error('后端响应异常')

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const parts = buffer.split('\n\n')
        buffer = parts.pop() || ''
        for (const part of parts) {
          if (!part.startsWith('data: ')) continue
          let data: { type: string; content: any }
          try {
            data = JSON.parse(part.slice(6))
          } catch {
            continue
          }
          if (data.type === 'log') {
            const meta = logMeta(data.content)
            setLogs((l) => [...l, { id: ++logId, html: marked.parseInline(data.content) as string, ...meta }])
          } else if (data.type === 'answer_piece') {
            fullAnswerRef.current += data.content
            setShowAnswer(true)
            setAnswerHtml((h) => h + marked.parse(data.content))
          } else if (data.type === 'timeline_data') {
            setTimeline(data.content)
            storage.setAgentData(data.content)
          } else if (data.type === 'error') {
            setMessages((m) => [...m, { role: 'ai', html: `<div class="text-rose-600">${marked.parseInline(data.content)}</div>` }])
          }
        }
      }
      if (fullAnswerRef.current) saveToDB(sessionId, 'ai', fullAnswerRef.current)
    } catch {
      setMessages((m) => [
        ...m,
        { role: 'ai', html: '<div class="text-rose-500">⚠️ 无法连接到旅行管家核心，请确认 Go 后端已启动。</div>' },
      ])
    } finally {
      setProcessing(false)
    }
  }

  const restoreHistory = (entry: (typeof historyList)[0]) => {
    setTimeline(entry.timeline)
    storage.setAgentData(entry.timeline)
    setMessages((m) => [...m, { role: 'user', text: `已从历史记录中恢复：${entry.title}` }])
  }

  return (
    <div className="h-screen flex overflow-hidden bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-100">
      {/* 左侧栏 */}
      <aside className="hidden md:flex w-64 flex-col border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
        <div className="p-4 flex items-center gap-2">
          <img src="/logo.png" className="h-8" alt="logo" />
          <span className="font-bold bg-gradient-to-r from-emerald-600 to-cyan-600 bg-clip-text text-transparent">NaviMAS</span>
        </div>
        <nav className="flex-1 overflow-y-auto px-3 space-y-1">
          <p className="text-xs text-slate-400 px-2 pt-2 pb-1">历史规划记录</p>
          {historyList.length === 0 && <p className="text-xs text-slate-400 px-2">暂无记录，生成后自动保存。</p>}
          {historyList.map((h) => (
            <div key={h.id} className="group flex items-center gap-1 rounded-lg px-2 py-1.5 hover:bg-emerald-50 dark:hover:bg-slate-800 cursor-pointer" onClick={() => restoreHistory(h)}>
              <i className="fa-regular fa-map text-emerald-500 text-xs" />
              <span className="flex-1 truncate text-sm">{h.title}</span>
              <button
                title="查看完整对话"
                className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-cyan-600"
                onClick={(e) => { e.stopPropagation(); navigate(`/history?session=${h.sessionId}`) }}
              >
                <i className="fa-regular fa-comments text-xs" />
              </button>
              <button
                title="删除"
                className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-rose-500"
                onClick={(e) => {
                  e.stopPropagation()
                  const next = historyList.filter((x) => x.id !== h.id)
                  storage.setHistory(next)
                  setHistoryList(next)
                }}
              >
                <i className="fa-regular fa-trash-can text-xs" />
              </button>
            </div>
          ))}
        </nav>
        <div className="p-3 space-y-1 border-t border-slate-200 dark:border-slate-800">
          <button onClick={() => navigate('/information')} className="w-full text-left px-3 py-2 rounded-lg text-sm hover:bg-emerald-50 dark:hover:bg-slate-800">
            <i className="fa-solid fa-fire text-orange-500 mr-2" />热门旅游资讯
          </button>
          <button onClick={() => navigate('/profile')} className="w-full text-left px-3 py-2 rounded-lg text-sm hover:bg-emerald-50 dark:hover:bg-slate-800">
            <i className="fa-solid fa-chart-pie text-cyan-500 mr-2" />个人行程档案
          </button>
          <button onClick={() => navigate('/diary')} className="w-full text-left px-3 py-2 rounded-lg text-sm hover:bg-emerald-50 dark:hover:bg-slate-800">
            <i className="fa-solid fa-book text-amber-500 mr-2" />打开随行日记本
          </button>
          {!user && (
            <button onClick={() => navigate('/login')} className="w-full text-left px-3 py-2 rounded-lg text-sm hover:bg-emerald-50 dark:hover:bg-slate-800">
              <i className="fa-solid fa-right-to-bracket text-emerald-500 mr-2" />登录 / 注册
            </button>
          )}
        </div>
      </aside>

      {/* 中间聊天区 */}
      <main className="flex-1 flex flex-col min-w-0">
        <div className="flex justify-end p-3">
          <ThemeButton dark={dark} toggle={toggle} />
        </div>

        <div className="flex-1 overflow-y-auto px-4 pb-4">
          <div className="max-w-4xl mx-auto space-y-4">
            {messages.length === 0 && !showAnswer && (
              <div className="flex flex-col items-center justify-center h-full text-center animate-fade-in">
                <img src="/logo.png" className="h-28 mb-4" alt="logo" />
                <h2 className="text-2xl font-bold bg-gradient-to-r from-emerald-600 to-cyan-600 bg-clip-text text-transparent">
                  NaviMAS 多智能体行程规划
                </h2>
                <p className="text-sm text-slate-400 mt-2">填写下方参数，启动 TDAG 多智能体协同引擎，生成可视化旅游图谱。</p>
              </div>
            )}

            {messages.map((msg, i) =>
              msg.role === 'user' ? (
                <div key={i} className="flex justify-end animate-fade-in-up">
                  <div className="max-w-[80%] bg-gradient-to-br from-emerald-500 to-cyan-500 text-white rounded-2xl rounded-br-md px-4 py-3 shadow">
                    <div className="flex flex-wrap gap-1.5 mb-1.5">
                      {msg.tags?.map((t) => (
                        <span key={t.label} className="text-xs bg-white/20 rounded-full px-2 py-0.5">{t.label}</span>
                      ))}
                    </div>
                    <p className="text-sm whitespace-pre-wrap">{msg.text}</p>
                  </div>
                </div>
              ) : (
                <div key={i} className="flex gap-3 animate-fade-in-up">
                  <div className="h-9 w-9 shrink-0 rounded-full bg-gradient-to-br from-cyan-500 to-blue-500 text-white flex items-center justify-center">
                    <i className="fa-solid fa-robot" />
                  </div>
                  <div className="markdown-body max-w-[85%] bg-white dark:bg-slate-800 rounded-2xl rounded-tl-md px-4 py-3 shadow text-sm"
                    dangerouslySetInnerHTML={{ __html: msg.html || '' }} />
                </div>
              ),
            )}

            {/* TDAG 日志 */}
            {logs.length > 0 && processing && (
              <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 p-4 shadow-sm animate-fade-in">
                <p className="text-xs font-semibold text-slate-400 mb-2">
                  <i className="fa-solid fa-diagram-project mr-1 text-emerald-500" />TDAG 动态执行拓扑
                </p>
                <div className="space-y-1.5 max-h-56 overflow-y-auto">
                  {logs.map((l) => (
                    <div key={l.id} className="flex items-start gap-2 text-xs animate-fade-in">
                      <i className={`fa-solid ${l.icon} ${l.color} mt-0.5 ${l.alert ? 'animate-pulse' : ''}`} />
                      <span className="text-slate-600 dark:text-slate-300" dangerouslySetInnerHTML={{ __html: l.html }} />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* AI 答案 */}
            {showAnswer && (
              <div className="flex gap-3 animate-fade-in-up">
                <div className="h-9 w-9 shrink-0 rounded-full bg-gradient-to-br from-cyan-500 to-blue-500 text-white flex items-center justify-center">
                  <i className="fa-solid fa-robot" />
                </div>
                <div className="max-w-[85%] bg-white dark:bg-slate-800 rounded-2xl rounded-tl-md px-5 py-4 shadow">
                  <div className="markdown-body text-sm" dangerouslySetInnerHTML={{ __html: answerHtml }} />
                  {timeline && !processing && (
                    <>
                      <hr className="my-4 border-dashed border-slate-200 dark:border-slate-700" />
                      <button
                        onClick={saveTimelineToHistory}
                        disabled={savedAnswer}
                        className="text-sm px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-500 text-white font-medium disabled:opacity-60"
                      >
                        {savedAnswer ? '✓ 已保存' : '📥 存入历史记录'}
                      </button>
                    </>
                  )}
                </div>
              </div>
            )}

            {processing && logs.length === 0 && (
              <div className="flex gap-3">
                <div className="h-9 w-9 rounded-full bg-gradient-to-br from-cyan-500 to-blue-500 text-white flex items-center justify-center">
                  <i className="fa-solid fa-robot" />
                </div>
                <div className="bg-white dark:bg-slate-800 rounded-2xl px-4 py-3 shadow flex items-center gap-2 text-sm text-slate-400">
                  <i className="fa-solid fa-spinner fa-spin text-emerald-500" />多智能体正在协同思考...
                </div>
              </div>
            )}
            <div ref={chatBottom} />
          </div>
        </div>

        {/* 底部输入面板 */}
        <div className="border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <div className="max-w-4xl mx-auto">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mb-2">
              <div>
                <input list="region-list" value={region} onChange={(e) => setRegion(e.target.value)} placeholder="目的地"
                  className="w-full px-3 py-2 rounded-xl text-sm border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 outline-none focus:ring-2 focus:ring-emerald-400" />
                <datalist id="region-list">
                  <option value="北京" /><option value="南京" /><option value="西安" /><option value="成都" /><option value="昆明" />
                </datalist>
              </div>
              <input type="date" value={startDate} min={new Date().toISOString().slice(0, 10)} onChange={(e) => setStartDate(e.target.value)}
                className="px-3 py-2 rounded-xl text-sm border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 outline-none focus:ring-2 focus:ring-emerald-400" />
              <input type="date" value={endDate} min={startDate || undefined} onChange={(e) => setEndDate(e.target.value)}
                className="px-3 py-2 rounded-xl text-sm border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 outline-none focus:ring-2 focus:ring-emerald-400" />
              <input type="number" min={1} max={20} value={people} onChange={(e) => setPeople(+e.target.value)} placeholder="人数"
                className="px-3 py-2 rounded-xl text-sm border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 outline-none focus:ring-2 focus:ring-emerald-400" />
              <input type="number" min={100} step={100} value={budget} onChange={(e) => setBudget(+e.target.value)} placeholder="总预算(元)"
                className="px-3 py-2 rounded-xl text-sm border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 outline-none focus:ring-2 focus:ring-emerald-400" />
            </div>

            {imageData && (
              <div className="relative inline-block mb-2">
                <img src={imageData} alt="预览" className="h-16 rounded-lg border border-emerald-300 object-cover" />
                <button onClick={() => setImageData(null)}
                  className="absolute -top-2 -right-2 h-5 w-5 rounded-full bg-rose-500 text-white text-xs">×</button>
              </div>
            )}

            <div className="flex items-end gap-2">
              <label className="shrink-0 h-11 w-11 flex items-center justify-center rounded-xl border border-slate-200 dark:border-slate-700 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-400">
                <i className="fa-solid fa-image" />
                <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
              </label>
              <textarea
                value={requirements}
                onChange={(e) => setRequirements(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() } }}
                rows={1}
                placeholder="输入核心诉求，如：想看雪山、避开人流、带老人出行...（Enter 发送）"
                className="flex-1 resize-none max-h-[100px] px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 outline-none focus:ring-2 focus:ring-emerald-400 text-sm"
              />
              <button
                onClick={sendMessage}
                disabled={processing}
                className="shrink-0 h-11 px-5 rounded-xl font-semibold text-white bg-gradient-to-r from-emerald-500 to-cyan-500 hover:shadow-lg hover:shadow-emerald-500/30 transition disabled:opacity-60 text-sm"
              >
                {processing ? <i className="fa-solid fa-spinner fa-spin" /> : <><i className="fa-solid fa-paper-plane mr-1" />启动 Agent</>}
              </button>
            </div>
          </div>
        </div>
      </main>

      {/* 右侧沙盘 */}
      <aside className="hidden lg:flex w-80 flex-col border-l border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-y-auto">
        <TimelinePanel timeline={timeline} region={region} processing={processing} />
      </aside>
    </div>
  )
}
