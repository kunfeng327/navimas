import { useEffect, useRef, useState } from 'react'

export default function Diary() {
  const [text, setText] = useState(() => localStorage.getItem('navimas_diary') || '')
  const [status, setStatus] = useState<'idle' | 'writing' | 'saved'>('idle')
  const ref = useRef<HTMLTextAreaElement>(null)
  const timer = useRef<number>()

  // 恢复光标到末尾
  useEffect(() => {
    const t = setTimeout(() => {
      const el = ref.current
      if (el) {
        el.focus()
        el.setSelectionRange(el.value.length, el.value.length)
      }
    }, 100)
    return () => clearTimeout(t)
  }, [])

  // debounce 800ms 自动保存
  useEffect(() => {
    if (text === localStorage.getItem('navimas_diary')) return
    setStatus('writing')
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
      localStorage.setItem('navimas_diary', text)
      setStatus('saved')
    }, 800)
  }, [text])

  const insertAtCursor = (s: string) => {
    const el = ref.current
    if (!el) return
    const start = el.selectionStart
    const next = text.slice(0, start) + s + text.slice(el.selectionEnd)
    setText(next)
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(start + s.length, start + s.length)
    })
  }

  const insertTimestamp = () => {
    const d = new Date()
    const pad = (n: number) => String(n).padStart(2, '0')
    insertAtCursor(`\n【${d.getFullYear()}年${pad(d.getMonth() + 1)}月${pad(d.getDate())}日 ${pad(d.getHours())}:${pad(d.getMinutes())}】\n`)
  }

  const wordCount = (text.match(/[\u4e00-\u9fa5]|[a-zA-Z0-9]+/g) || []).length

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 to-orange-100">
      <header className="flex items-center justify-between px-6 py-4 bg-white/60 backdrop-blur border-b border-amber-200">
        <div className="flex items-center gap-3">
          <img src="/logo.png" className="h-8" alt="logo" />
          <h1 className="font-serif font-bold text-lg text-slate-800">NaviMAS 随行手账</h1>
        </div>
        <span className={`text-xs px-3 py-1 rounded-full ${
          status === 'saved' ? 'bg-emerald-100 text-emerald-700' :
          status === 'writing' ? 'bg-amber-100 text-amber-700' :
          'bg-slate-100 text-slate-500'
        }`}>
          {status === 'saved' ? '✓ 已自动保存' : status === 'writing' ? '✍ 书写中...' : '待续写'}
        </span>
      </header>

      <main className="max-w-3xl mx-auto p-4">
        <div className="bg-white rounded-2xl shadow-lg overflow-hidden border-l-4 border-red-400 ml-2">
          <div className="flex items-center gap-2 px-4 py-2 border-b border-amber-100 bg-amber-50/50">
            <button onClick={insertTimestamp} className="text-xs px-3 py-1.5 rounded-lg bg-white border border-amber-200 hover:bg-amber-100 transition">
              <i className="fa-regular fa-clock mr-1" />插入时间戳
            </button>
            <button onClick={() => insertAtCursor('📍 【当前位置】：')} className="text-xs px-3 py-1.5 rounded-lg bg-white border border-amber-200 hover:bg-amber-100 transition">
              <i className="fa-solid fa-location-dot mr-1" />插入位置
            </button>
            <button onClick={() => insertAtCursor('-'.repeat(30))} className="text-xs px-3 py-1.5 rounded-lg bg-white border border-amber-200 hover:bg-amber-100 transition">
              <i className="fa-solid fa-minus mr-1" />分割线
            </button>
            <button
              onClick={() => { if (confirm('确定清空整篇日记吗？')) setText('') }}
              className="ml-auto text-xs px-3 py-1.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-600 hover:bg-rose-100 transition"
            >
              <i className="fa-solid fa-trash-can mr-1" />清空
            </button>
          </div>
          <textarea
            ref={ref}
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="paper-texture w-full h-[65vh] px-6 py-2 font-serif text-slate-800 resize-none outline-none"
            placeholder="执笔记录此刻的风景与心情..."
          />
          <div className="px-4 py-2 text-xs text-slate-400 border-t border-amber-100 bg-amber-50/30">
            共 {wordCount} 字 · 本地保存于浏览器
          </div>
        </div>
      </main>
    </div>
  )
}
