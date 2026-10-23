import { useEffect, useState } from 'react'

// 暗黑模式 Hook：class 策略 + localStorage 持久化
export function useTheme() {
  const [dark, setDark] = useState(() => localStorage.getItem('navimas_theme') === 'dark')

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
    localStorage.setItem('navimas_theme', dark ? 'dark' : 'light')
  }, [dark])

  return { dark, toggle: () => setDark((d) => !d) }
}

export function ThemeButton({ dark, toggle }: { dark: boolean; toggle: () => void }) {
  return (
    <button
      onClick={toggle}
      title="切换主题"
      className="h-10 w-10 rounded-full bg-white/70 dark:bg-slate-800/70 backdrop-blur border border-white/40 dark:border-slate-700 shadow hover:shadow-md transition-all text-slate-600 dark:text-amber-400"
    >
      <i className={`fa-solid ${dark ? 'fa-sun text-amber-400' : 'fa-moon'}`} />
    </button>
  )
}
