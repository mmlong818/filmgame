'use client'
import type { Project, Ending } from '@/lib/types/project'

const ENDING_TYPE_LABEL: Record<string, string> = {
  good: '✓ 好结局',
  bad: '✗ 坏结局',
  neutral: '◎ 中性',
  secret: '★ 隐藏',
}
const ENDING_TYPE_DOT: Record<string, string> = {
  good: 'bg-green-500',
  bad: 'bg-red-500',
  neutral: 'bg-gray-400',
  secret: 'bg-amber-500',
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
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-sm font-semibold text-gray-700">结局定义</h3>
          <p className="text-xs text-gray-400 mt-0.5">为结局节点绑定类型与触发条件</p>
        </div>
        {endingNodes.length > 0 && (
          <button
            onClick={() => addEnding(endingNodes[0].id)}
            className="text-xs text-blue-500 hover:text-blue-600"
          >
            + 添加结局
          </button>
        )}
      </div>

      {endingNodes.length === 0 ? (
        <p className="text-xs text-gray-400 italic">
          在节点结构中添加「结局」类型的节点后，可在此处定义结局详情
        </p>
      ) : project.endings.length === 0 ? (
        <div className="text-center py-4 border border-dashed border-gray-200 rounded-lg">
          <p className="text-xs text-gray-400 mb-2">已有 {endingNodes.length} 个结局节点，尚未绑定定义</p>
          <button
            onClick={() => addEnding(endingNodes[0].id)}
            className="text-xs text-blue-500 hover:text-blue-600 underline"
          >
            添加第一个结局定义
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {project.endings.map(ending => {
            const node = project.nodes.find(n => n.id === ending.nodeId)
            return (
              <div key={ending.id} className="border border-gray-100 rounded-lg p-3 group">
                <div className="flex items-center gap-2 mb-2">
                  <input
                    value={ending.title}
                    onChange={e => updateEnding(ending.id, { title: e.target.value })}
                    className="text-sm font-medium text-gray-800 border-none outline-none bg-transparent flex-1"
                    placeholder="结局名称"
                  />
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className={`w-2 h-2 rounded-full shrink-0 ${ENDING_TYPE_DOT[ending.type]}`} />
                    <select
                      value={ending.type}
                      onChange={e => updateEnding(ending.id, { type: e.target.value as Ending['type'] })}
                      className="text-xs border border-gray-200 rounded px-1.5 py-0.5 bg-white text-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-300"
                    >
                      {Object.entries(ENDING_TYPE_LABEL).map(([v, l]) => (
                        <option key={v} value={v}>{l}</option>
                      ))}
                    </select>
                  </div>
                  <select
                    value={ending.nodeId}
                    onChange={e => updateEnding(ending.id, { nodeId: e.target.value })}
                    className="text-xs text-gray-500 border border-gray-200 rounded px-1.5 py-0.5 max-w-28 truncate"
                  >
                    {endingNodes.map(n => (
                      <option key={n.id} value={n.id}>{n.title}</option>
                    ))}
                  </select>
                  <button
                    onClick={() => deleteEnding(ending.id)}
                    className="text-gray-300 hover:text-red-400 text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    ✕
                  </button>
                </div>
                <div className="space-y-1.5">
                  <input
                    value={ending.conditions}
                    onChange={e => updateEnding(ending.id, { conditions: e.target.value })}
                    className="w-full text-xs border border-gray-100 rounded px-2 py-1 text-gray-600 focus:outline-none focus:ring-1 focus:ring-blue-300"
                    placeholder="触发条件（如：好感度 > 60 且 未使用暴力）"
                  />
                  <textarea
                    value={ending.description}
                    onChange={e => updateEnding(ending.id, { description: e.target.value })}
                    rows={2}
                    className="w-full text-xs border border-gray-100 rounded px-2 py-1 text-gray-600 focus:outline-none focus:ring-1 focus:ring-blue-300 resize-none"
                    placeholder="结局描述..."
                  />
                </div>
                {node && (
                  <p className="text-xs text-gray-400 mt-1.5">→ 节点：{node.title}</p>
                )}
              </div>
            )
          })}
          <button
            onClick={() => addEnding(endingNodes[0].id)}
            className="w-full text-xs text-gray-400 hover:text-gray-600 py-2 border border-dashed border-gray-200 hover:border-gray-300 rounded-lg transition-colors"
          >
            + 添加结局
          </button>
        </div>
      )}
    </div>
  )
}
