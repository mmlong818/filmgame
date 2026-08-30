// 结构体检（FR-18 A4）：分支密度 / 无保底出口节点数 / 不可达节点数三行速报，纯本地计算，不落库。
import type { Project, ValidationReport } from '@/lib/types/project'

export interface SelfCheck {
  density: number
  noFallback: number
  unreachable: number
  passRate: number
  /** 定向重构应用后才有：通过率 应用前 → 应用后 */
  fixDelta?: { before: number; after: number }
}

export function selfCheckFromReport(project: Project, report: ValidationReport): SelfCheck {
  const totalNodes = project.nodes.length
  const branchNodes = project.nodes.filter(n => n.type === 'branch').length
  return {
    density: totalNodes > 0 ? branchNodes / totalNodes : 0,
    noFallback: report.issues.filter(i => i.code === 'ALL_CHOICES_GATED').length,
    unreachable: report.issues.filter(i => i.code === 'UNREACHABLE').length,
    passRate: report.passRate,
  }
}
