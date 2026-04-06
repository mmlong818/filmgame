'use client'
import { useRouter } from 'next/navigation'
import { ArtDecoHeroFrame, ShellWordmark } from './components/art-deco'

const COPPER = '#c87858'
const COPPER_DIM = 'rgba(200,120,88,0.45)'

export default function HomePage() {
  const router = useRouter()

  return (
    <div className="relative min-h-screen flex flex-col" style={{ backgroundColor: '#060408' }}>

      {/* Full-screen SVG frame — behind everything */}
      <ArtDecoHeroFrame className="absolute inset-0 w-full h-full" />

      {/* ── Top nav ── */}
      <div className="relative z-10 max-w-5xl mx-auto w-full px-12 py-5 flex items-center justify-between">
        <ShellWordmark size="sm" />
        <button
          onClick={() => router.push('/projects')}
          className="px-5 py-2.5 text-sm font-medium tracking-wider transition-all"
          style={{ border: `1px solid ${COPPER_DIM}`, color: 'var(--shell-fg-2)', background: 'rgba(6,4,8,0.7)' }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = COPPER; e.currentTarget.style.color = 'var(--shell-fg)' }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = COPPER_DIM; e.currentTarget.style.color = 'var(--shell-fg-2)' }}
        >
          开始创作
        </button>
      </div>

      {/* ── Hero ── */}
      <div className="relative z-10 flex-1 flex flex-col items-center justify-center">
        <div className="text-center" style={{ maxWidth: '640px' }}>
          <ShellWordmark size="lg" />

          <h2
            className="text-5xl font-bold tracking-tight leading-tight mt-10"
            style={{ color: 'var(--shell-fg)' }}
          >
            从故事到影游
          </h2>
          <p className="text-xl mt-5 leading-relaxed" style={{ color: 'var(--shell-fg-2)' }}>
            五阶段全流程创作系统 · AI 编剧助手 · 结构化叙事设计
          </p>

          <div className="mt-7 flex items-center justify-center gap-3 text-sm flex-wrap" style={{ color: 'var(--shell-fg-3)' }}>
            {['世界锚点', '规模规划', '故事结构', '剧本工坊', '全局校验'].map((s, i, arr) => (
              <span key={s} className="flex items-center gap-3">
                <span className="tracking-widest">{s}</span>
                {i < arr.length - 1 && <span style={{ color: COPPER }}>◆</span>}
              </span>
            ))}
          </div>

        </div>
      </div>

    </div>
  )
}
