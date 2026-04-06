export type Phase = 'world' | 'scale' | 'structure' | 'workshop' | 'validate'

export const PHASES: { key: Phase; label: string; description: string }[] = [
  { key: 'world', label: '世界锚点', description: '建立故事核心与角色' },
  { key: 'scale', label: '规模规划', description: '确定项目体量和章节大纲' },
  { key: 'structure', label: '结构与分支', description: '设计节点网络与选择连接' },
  { key: 'workshop', label: '场景填充', description: '批量填充对白与情感' },
  { key: 'validate', label: '全局校验', description: '检测问题，输出报告' },
]
