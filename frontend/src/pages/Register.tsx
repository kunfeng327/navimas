import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { buildApi } from '../api'
import { useTheme, ThemeButton } from '../theme'

const CHARS = 'abcdefghjkmnpqrstuvwxyz23456789'

function useCaptcha(dark: boolean) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [code, setCode] = useState('')

  const generate = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    let next = ''
    for (let i = 0; i < 4; i++) next += CHARS[Math.floor(Math.random() * CHARS.length)]
    setCode(next)

    ctx.clearRect(0, 0, canvas.width, canvas.height)
    const color = dark ? '#10b981' : '#059669'
    for (let i = 0; i < 5; i++) {
      ctx.strokeStyle = `rgba(16,185,129,0.35)`
      ctx.beginPath()
      ctx.moveTo(Math.random() * 112, Math.random() * 46)
      ctx.lineTo(Math.random() * 112, Math.random() * 46)
      ctx.stroke()
    }
    next.split('').forEach((ch, i) => {
      ctx.save()
      ctx.translate(18 + i * 26, 23)
      ctx.rotate((Math.random() - 0.5) * 0.5)
      ctx.fillStyle = color
      ctx.font = 'bold 22px monospace'
      ctx.textAlign = 'center'
      ctx.fillText(ch.toUpperCase(), 0, 8)
      ctx.restore()
    })
  }

  useEffect(generate, [dark])
  return { canvasRef, code, refresh: generate }
}

export default function Register() {
  const { dark, toggle } = useTheme()
  const navigate = useNavigate()
  const { canvasRef, code, refresh } = useCaptcha(dark)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [captcha, setCaptcha] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (captcha.toLowerCase() !== code) {
      setError('验证码错误，请重试')
      setCaptcha('')
      refresh()
      return
    }
    if (password !== confirm) {
      setError('两次输入的密码不一致')
      return
    }
    setLoading(true)
    try {
      const res = await fetch(buildApi('/api/register'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      })
      if (res.ok) {
        setTimeout(() => navigate('/login'), 800)
      } else {
        const data = await res.json()
        setError('注册失败：' + (data.detail || '未知错误'))
        setLoading(false)
        refresh()
      }
    } catch {
      setError('无法连接到服务器，请确认 Go 后端已启动。')
      setLoading(false)
    }
  }

  return (
    <div className="relative min-h-screen flex items-center justify-center bg-slate-900">
      <div className="absolute inset-0 bg-gradient-to-br from-emerald-900 via-cyan-900 to-slate-900" />
      <div className="absolute inset-0 bg-black/30" />
      <div className="absolute top-5 right-5 z-10">
        <ThemeButton dark={dark} toggle={toggle} />
      </div>

      <div className="relative z-10 w-full max-w-md mx-4 animate-fade-in-up">
        <div className="bg-white/70 dark:bg-slate-900/70 backdrop-blur-2xl rounded-3xl shadow-2xl p-8 border border-white/40 dark:border-slate-700/50">
          <div className="flex flex-col items-center mb-6">
            <img src="/logo.png" alt="NaviMAS" className="h-20 mb-3" />
            <h1 className="text-xl font-bold bg-gradient-to-r from-emerald-600 to-cyan-600 bg-clip-text text-transparent">
              创建新账户
            </h1>
          </div>

          <form onSubmit={handleRegister} className="space-y-4">
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              placeholder="账号"
              className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white/80 dark:bg-slate-800/80 focus:ring-2 focus:ring-emerald-400 outline-none"
            />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder="密码"
              className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white/80 dark:bg-slate-800/80 focus:ring-2 focus:ring-emerald-400 outline-none"
            />
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              placeholder="确认密码"
              className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white/80 dark:bg-slate-800/80 focus:ring-2 focus:ring-emerald-400 outline-none"
            />
            <div className="flex gap-3">
              <input
                value={captcha}
                onChange={(e) => setCaptcha(e.target.value)}
                required
                placeholder="验证码"
                className="flex-1 px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white/80 dark:bg-slate-800/80 focus:ring-2 focus:ring-emerald-400 outline-none"
              />
              <canvas
                ref={canvasRef}
                width={112}
                height={46}
                onClick={refresh}
                title="点击刷新"
                className="rounded-xl cursor-pointer border border-emerald-200 dark:border-emerald-800 bg-white dark:bg-slate-900"
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
              className="w-full py-3 rounded-xl font-semibold text-white bg-gradient-to-r from-emerald-500 to-cyan-500 hover:shadow-lg transition-all disabled:opacity-60"
            >
              {loading ? (
                <span><i className="fa-solid fa-spinner fa-spin mr-2" />正在写入数据库...</span>
              ) : (
                '注册并激活 Agent'
              )}
            </button>

            <p className="text-center text-sm text-slate-500 dark:text-slate-400">
              已有账号？<Link to="/login" className="text-emerald-600 hover:underline">返回登录</Link>
            </p>
          </form>
        </div>
      </div>
    </div>
  )
}
