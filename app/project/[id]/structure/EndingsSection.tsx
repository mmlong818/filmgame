'use client'
import type { Project, Ending } from '@/lib/types/project'
import { Button } from '@/app/components/ui/button'
import { Input, Textarea } from '@/app/components/ui/input'

const ENDING_TYPE_LABEL: Record<string, string> = {
  good: '✓ 好结局',
  bad: '✗ 坏结局',
  neutral: '◎ 中性',
  secret: '★ 隐藏',
}
const ENDING_TYPE_DOT: Record<string, string> = {
  good: 'bg-leaf',
  bad: 'bg-vermilion',
  neutral: 'bg-pencil',
  secret: 'bg-amberink',
}

interface Props {
  project: Project
  addEnding: (nodeId: string) => void
  updateEnding: (id: string, patch: Partial<Ending>) => void
  deleteEnding: (id: string) => void
}

export default function EndingsSection({ project, addEnding, updateEnding, deleteEnding }: Props) {
  const endingNodes = project.nodes.filter(n => n.type === 'ending')

  return (
    <div className="bg-paper border border-line p-4" style={{ boxShadow: 'var(--shadow-card)' }}>
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-sm font-semibold text-ink-soft">结局定义</h3>
          <p className="text-xs text-pencil mt-0.5">为结局节点绑定类型与触发条件</p>
        </div>
        {endingNodes.length > 0 && (
          <Button variant="link" size="sm" onClick={() => addEnding(endingNodes[0].id)}>+ 添加结局</Button>
        )}
      </div>

      {endingNodes.length === 0 ? (
        <p className="text-xs text-pencil italic">
          在节点结构中添加「结局」类型的节点后，可在此处定义结局详情
        </p>
      ) : project.endings.length === 0 ? (
        <div className="text-center py-4 border border-dashed border-line">
          <p className="text-xs text-pencil mb-2">已有 {endingNodes.length} 个结局节点，尚未绑定定义</p>
          <Button variant="link" size="sm" onClick={() => addEnding(endingNodes[0].id)}>添加第一个结局定义</Button>
        </div>
      ) : (
        <div className="space-y-2">
          {project.endings.map(ending => {
            const node = project.nodes.find(n => n.id === ending.nodeId)
            return (
              <div key={ending.id} className="border border-line-soft p-3 group">
                <div className="flex items-center gap-2 mb-2">
                  <input
                    value={ending.title}
                    onChange={e => updateEnding(ending.id, { title: e.target.value })}
                    className="text-sm font-medium text-ink border-none outline-none bg-transparent flex-1"
                    placeholder="结局名称"
                  />
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className={`w-2 h-2 shrink-0 ${ENDING_TYPE_DOT[ending.type]}`} />
                    <select
                      value={ending.type}
                      onChange={e => updateEnding(ending.id, { type: e.target.value as Ending['type'] })}
                      className="text-xs border border-line px-1.5 py-0.5 bg-paper text-ink focus:outline-none focus:border-inkblue cursor-pointer"
                    >
                      {Object.entries(ENDING_TYPE_LABEL).map(([v, l]) => (
                        <option key={v} value={v}>{l}</option>
                      ))}
                    </select>
                  </div>
                  <select
                    value={ending.nodeId}
                    onChange={e => updateEnding(ending.id, { nodeId: e.target.value })}
                    className="text-xs text-pencil border border-line px-1.5 py-0.5 max-w-28 truncate bg-paper cursor-pointer"
                  >
                    {endingNodes.map(n => (
                      <option key={n.id} value={n.id}>{n.title}</option>
                    ))}
                  </select>
                  <button
                    onClick={() => deleteEnding(ending.id)}
                    className="text-pencil/60 hover:text-vermilion text-xs opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                  >
                    ✕
                  </button>
                </div>
                <div className="space-y-1.5">
                  <Input
                    value={ending.conditions}
                    onChange={e => updateEnding(ending.id, { conditions: e.target.value })}
                    className="text-xs"
                    placeholder="触发条件（如：好感度 > 60 且 未使用暴力）"
                  />
                  <Textarea
                    value={ending.description}
                    onChange={e => updateEnding(ending.id, { description: e.target.value })}
                    rows={2}
                    className="text-xs resize-none"
                    placeholder="结局描述..."
                  />
                </div>
                {node && (
                  <p className="text-xs text-pencil mt-1.5">→ 节点：{node.title}</p>
                )}
              </div>
            )
          })}
          <button
            onClick={() => addEnding(endingNodes[0].id)}
            className="w-full text-xs text-pencil hover:text-ink-soft py-2 border border-dashed border-line hover:border-ink-soft transition-colors cursor-pointer"
          >
            + 添加结局
          </button>
        </div>
      )}
    </div>
  )
}
