'use client'
// B2/B3：定向重构的状态编排——触发 AI 补丁、预览态、应用并回填结构体检的通过率对比。
import { useEffect, useRef, useState } from 'react'
import { useProjectStore } from '@/lib/store/projectStore'
import { aiJson } from '@/lib/ai/client'
import { AiActionError } from '@/lib/ai/errors'
import { useAiAction } from '@/lib/hooks/useAiAction'
import { runValidation } from '@/lib/validation/engine'
import type { Project } from '@/lib/types/project'
import type { TargetedFixOp, TargetedFixResult } from '@/lib/ai/targetedFixTypes'
import { applyOps, buildStructureSummary } from './targetedFix'
import { selfCheckFromReport, type SelfCheck } from './selfCheck'

export function useTargetedFix(project: Project | null, stage: string, toast: (message: string, type?: 'success' | 'error' | 'info') => void) {
  const { bulkSetStructure, addEnding, updateEnding } = useProjectStore()
  const fixAi = useAiAction()
  const [fixDraft, setFixDraft] = useState<TargetedFixResult | null>(null)
  const [selfCheck, setSelfCheck] = useState<SelfCheck | null>(null)
  const selfCheckSignatureRef = useRef<string | null>(null)

  // A4：结构「通过」应用后（含分支通过与结局定义导入）以及编辑态进入时若已有节点，
  // 自动跑一次本地校验引擎产出体检速报；用节点/幕数签名去重，避免生成流程内重复触发。
  useEffect(() => {
    if (!project) return
    if (stage !== 'edit') return
    if (project.nodes.length === 0) { setSelfCheck(null); selfCheckSignatureRef.current = null; return }
    const signature = `${project.nodes.length}:${project.acts.length}`
    if (selfCheckSignatureRef.current === signature) return
    selfCheckSignatureRef.current = signature
    setSelfCheck(selfCheckFromReport(project, runValidation(project)))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project, stage])

  async function runTargetedFix() {
    if (!project?.lastValidation) return
    const context = {
      structureSummary: buildStructureSummary(project),
      issues: project.lastValidation.issues.map(i => ({ level: i.level, code: i.code, message: i.message, relatedIds: i.relatedIds })),
      mustFix: project.directorReview?.mustFix ?? [],
      variables: project.variables,
      endingsDesign: project.worldAnchor?.endingsDesign ?? [],
    }
    const data = await fixAi.run('定向重构', async (signal) => {
      const res = await aiJson<{ result?: TargetedFixResult }>('structure', 'targeted_fix', context, signal)
      if (!res.result) throw new AiActionError('AI 定向重构返回格式错误')
      return res.result
    })
    if (data) setFixDraft(data)
  }

  // 应用勾选的补丁：结构走 bulkSetStructure（撤销快照自动挂载），结局逐条 diff 走 addEnding/updateEnding
  function applyFix(selectedOps: TargetedFixOp[]) {
    if (!project) return
    const before = runValidation(project)
    const result = applyOps(project, selectedOps)
    bulkSetStructure(result.chapters, result.acts, result.nodes)
    for (const ending of result.endings) {
      const existing = project.endings.find(e => e.nodeId === ending.nodeId)
      if (!existing) {
        addEnding(ending.nodeId)
        const created = useProjectStore.getState().project?.endings.find(e => e.nodeId === ending.nodeId)
        if (created) updateEnding(created.id, { title: ending.title, type: ending.type, description: ending.description, conditions: ending.conditions })
      } else if (
        existing.title !== ending.title || existing.type !== ending.type ||
        existing.description !== ending.description || existing.conditions !== ending.conditions
      ) {
        updateEnding(existing.id, { title: ending.title, type: ending.type, description: ending.description, conditions: ending.conditions })
      }
    }
    const projectAfter: Project = { ...project, chapters: result.chapters, acts: result.acts, nodes: result.nodes, endings: result.endings }
    const after = runValidation(projectAfter)
    setSelfCheck({ ...selfCheckFromReport(projectAfter, after), fixDelta: { before: before.passRate, after: after.passRate } })
    selfCheckSignatureRef.current = `${projectAfter.nodes.length}:${projectAfter.acts.length}`
    setFixDraft(null)
    toast(`已应用 ${result.appliedCount} 处修复，通过率 ${before.passRate}% → ${after.passRate}%`, 'success')
  }

  return { fixAi, fixDraft, selfCheck, runTargetedFix, applyFix, closeFixDraft: () => setFixDraft(null) }
}
