'use client'
import { useRouter } from 'next/navigation'
import { Button } from './components/ui/button'

export default function HomePage() {
  const router = useRouter()

  return (
    <div className="min-h-screen corkboard flex items-center justify-center px-4">
      <div className="paper-sheet w-full max-w-md px-10 py-12 text-center">
        <h1 className="text-2xl font-semibold text-ink">猫叔的互动影游创作系统</h1>
        <p className="mt-3 text-sm text-pencil leading-relaxed">
          五阶段全流程创作 · AI 编剧助手 · 结构化叙事设计
        </p>
        <Button variant="primary" className="mt-8 px-6 py-2.5" onClick={() => router.push('/projects')}>
          进入项目列表
        </Button>
      </div>
    </div>
  )
}
