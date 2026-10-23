import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { buildApi } from '../api'
import { useTheme, ThemeButton } from '../theme'

export default function Login() {
  const { dark, toggle } = useTheme()
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await fetch(buildApi('/api/login'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      })
      const data = await res.json()
      if (res.ok) {
        localStorage.setItem('navimas_user', username)
        setTimeout(() => navigate('/'), 400)
      } else {
        setError(data.detail || '登录失败')
        setLoading(false)
      }
    } catch {
      setError('无法连接到服务器，请确认 Go 后端已启动。')
      setLoading(false)
    }
  }

  return (
    <div className="relative min-h-screen flex items-center justify-center bg-slate-900">
      {/* 背景渐变（原版视频背景的替代，可自行放回 loginVideo.mp4） */}
      <div className="absolute inset-0 bg-gradient-to-br from-emerald-900 via-cyan-900 to-slate-900" />
      <div className="absolute inset-0 bg-black/30" />

      <div className="absolute top-5 right-5 z-10">
        <ThemeButton dark={dark} toggle={toggle} />
      </div>

      <div className="relative z-10 w-full max-w-md mx-4 animate-fade-in-up">
        <div className="bg-white/70 dark:bg-slate-900/70 backdrop-blur-2xl rounded-3xl shadow-2xl p-8 border border-white/40 dark:border-slate-700/50">
          <div className="flex flex-col items-center mb-6">
            <img src="/logo.png" alt="NaviMAS" className="h-24 mb-3" />
            <h1 className="text-2xl font-bold bg-gradient-to-r from-emerald-600 to-cyan-600 bg-clip-text text-transparent">
              NaviMAS 智游图谱
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">多智能体协同行程规划系统</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-1">用户名</label>
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white/80 dark:bg-slate-800/80 focus:ring-2 focus:ring-emerald-400 outline-none transition"
                placeholder="请输入用户名"
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-sm font-medium text-slate-600 dark:text-slate-300">密码</label>
                <Link to="/register" className="text-xs text-emerald-600 hover:underline">新建用户</Link>
              </div>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white/80 dark:bg-slate-800/80 focus:ring-2 focus:ring-emerald-400 outline-none transition"
                placeholder="请输入密码"
              />
            </div>

            {error && (
              <div className="text-sm text-rose-600 bg-rose-50 dark:bg-rose-900/30 dark:text-rose-300 rounded-lg px-3 py-2">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-xl font-semibold text-white bg-gradient-to-r from-emerald-500 to-cyan-500 hover:shadow-lg hover:shadow-emerald-500/30 transition-all disabled:opacity-60"
            >
              {loading ? (
                <span><i className="fa-solid fa-spinner fa-spin mr-2" />正在唤醒 Agent...</span>
              ) : (
                '进入智游系统'
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
