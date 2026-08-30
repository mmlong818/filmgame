'use client'
import { useState, FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/app/components/ui/button'
import { Input } from '@/app/components/ui/input'

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
    <div className="corkboard min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="flex justify-center mb-8">
          <span className="tape-label hand text-2xl text-ink-soft px-6">猫叔的互动影游创作系统</span>
        </div>

        <form onSubmit={handleSubmit} className="paper-sheet paper-sheet-ruled px-8 py-8">
          <h1 className="text-[15px] font-semibold tracking-[0.4em] text-ink mb-6">访问验证</h1>

          <label className="block text-xs tracking-[0.25em] text-pencil mb-2" htmlFor="login-password">
            密码
          </label>
          <Input
            id="login-password"
            autoFocus
            type="password"
            value={password}
            onChange={e => { setPassword(e.target.value); setError('') }}
            placeholder="请输入访问密码"
            className={error ? 'border-vermilion/60' : ''}
          />
          {error && <p className="text-xs text-vermilion mt-2">{error}</p>}

          <Button type="submit" variant="primary" className="w-full mt-6" disabled={!password} loading={loading}>
            {loading ? '验证中…' : '进入档案室'}
          </Button>
        </form>
      </div>
    </div>
  )
}
