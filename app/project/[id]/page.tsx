'use client'
import { useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { useProjectStore } from '@/lib/store/projectStore'

export default function ProjectPage() {
  const router = useRouter()
  const params = useParams()
  const id = params.id as string
  const { project, loadProject } = useProjectStore()

  useEffect(() => {
    if (!project || project.id !== id) {
      const ok = loadProject(id)
      if (!ok) { router.push('/'); return }
    }
    if (project) {
      router.replace(`/project/${id}/${project.currentPhase}`)
    }
  }, [id, project])

  return <div className="flex items-center justify-center min-h-screen text-gray-400 text-sm">跳转中...</div>
}
