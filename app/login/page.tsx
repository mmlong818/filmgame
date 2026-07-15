'use client'
import { useState, FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { ShellWordmark, ArtDecoRule } from '@/app/components/art-deco'

export default function LoginPage() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!password || loading) return
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })
      const data = await res.json().catch(() => ({ ok: false }))
      if (!res.ok || !data.ok) {
        setError('密码错误')
        setLoading(false)
        return
      }
      router.push('/projects')
    } catch {
      setError('登录失败，请稍后重试')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#060408' }}>
      <div className="w-full max-w-sm px-8">
        <div className="flex flex-col items-center mb-10">
          <ShellWordmark size="lg" />
        </div>

        <form
          onSubmit={handleSubmit}
          className="p-8"
          style={{ background: 'var(--shell-mid)', border: '2px solid var(--gold-dim)' }}
        >
          <h1 className="text-lg font-bold tracking-widest uppercase mb-1 text-center" style={{ color: 'var(--shell-fg)' }}>
            访问验证
          </h1>
          <div className="mb-6"><ArtDecoRule /></div>

          <label className="text-xs uppercase tracking-[0.3em] mb-2 block" style={{ color: 'var(--shell-fg-3)' }}>
            密码
          </label>
          <input
            autoFocus
            type="password"
            value={password}
            onChange={e => { setPassword(e.target.value); setError('') }}
            placeholder="请输入访问密码"
            className="w-full px-4 py-3 text-sm focus:outline-none mb-2"
            style={{ background: 'var(--shell-raised)', border: `1px solid ${error ? 'rgba(220,38,38,0.6)' : 'var(--shell-border)'}`, color: 'var(--shell-fg)' }}
            onFocus={e => { e.currentTarget.style.borderColor = 'var(--gold-mid)' }}
            onBlur={e => { e.currentTarget.style.borderColor = error ? 'rgba(220,38,38,0.6)' : 'var(--shell-border)' }}
          />
          {error && (
            <p className="text-xs mb-4" style={{ color: 'rgba(220,38,38,0.85)' }}>{error}</p>
          )}

          <button
            type="submit"
            disabled={!password || loading}
            className="w-full py-3 mt-4 text-sm font-medium tracking-wider transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ background: 'var(--gold-mid)', color: 'var(--shell)' }}
            onMouseEnter={e => { if (password && !loading) e.currentTarget.style.background = 'var(--gold-bright)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'var(--gold-mid)' }}
          >
            {loading ? '验证中…' : '进入'}
          </button>
        </form>
      </div>
    </div>
  )
}
