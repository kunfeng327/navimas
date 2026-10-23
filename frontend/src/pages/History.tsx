import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { marked } from 'marked'
import { buildApi } from '../api'

interface Entry {
  role: 'user' | 'ai'
  content: string
  time: string
}

export default function History() {
  const [searchParams] = useSearchParams()
  const session = searchParams.get('session')
  const [entries, setEntries] = useState<Entry[] | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!session) {
      setError('无效的访问：缺少会话 ID。')
      return
    }
    fetch(buildApi(`/api/history/${encodeURIComponent(session)}`))
      .then((r) => {
        if (!r.ok) throw new Error()
        return r.json()
      })
      .then(setEntries)
      .catch(() => setError('无法连接到后端数据库，请确认 Go 服务已启动。'))
  }, [session])

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="flex items-center justify-between px-6 py-4 bg-white border-b">
        <h1 className="font-bold text-lg text-slate-800">
          <i className="fa-solid fa-box-archive text-emerald-500 mr-2" />行程对话档案库
        </h1>
        <button onClick={() => window.close()} className="text-sm text-slate-400 hover:text-rose-500">
          <i className="fa-solid fa-xmark" /> 关闭
        </button>
      </header>

      <main className="max-w-4xl mx-auto p-4 space-y-4">
        {error && (
          <div className="bg-rose-50 text-rose-600 rounded-xl px-4 py-3 text-sm">{error}</div>
        )}
        {!entries && !error && (
          <div className="flex flex-col items-center py-20 text-slate-400">
            <i className="fa-solid fa-spinner fa-spin text-2xl mb-3" />
            <p className="text-sm">正在从数据库检索历史档案...</p>
          </div>
        )}
        {entries && entries.length === 0 && (
          <p className="text-center text-sm text-slate-400 py-20">数据库中未找到该会话的记录。</p>
        )}
        {entries?.map((e, i) =>
          e.role === 'user' ? (
            <div key={i} className="flex justify-end">
              <div className="max-w-[80%] bg-emerald-500 text-white rounded-2xl rounded-br-md px-4 py-3">
                <p className="text-sm whitespace-pre-wrap">{e.content}</p>
                <p className="text-[10px] text-emerald-100 text-right mt-1">{e.time}</p>
              </div>
            </div>
          ) : (
            <div key={i} className="flex gap-3">
              <div className="h-9 w-9 shrink-0 rounded-full bg-gradient-to-br from-cyan-500 to-blue-500 text-white flex items-center justify-center">
                <i className="fa-solid fa-robot" />
              </div>
              <div className="max-w-[85%] bg-white rounded-2xl rounded-tl-md px-4 py-3 shadow">
                <div className="markdown-body text-sm" dangerouslySetInnerHTML={{ __html: marked.parse(e.content) }} />
                <p className="text-[10px] text-slate-400 mt-2">{e.time}</p>
              </div>
            </div>
          ),
        )}
      </main>
    </div>
  )
}
