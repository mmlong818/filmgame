// 节点类型的唯一视觉来源：文案 + 语义色。
// 此前 structure / workshop / branches 三处各自定义且互不一致，一律改从这里取。
import type { NodeType } from '@/lib/types/project'

export interface NodeTypeStyle {
  /** 中文标签 */
  label: string
  /** 主色（hex），供 SVG / 流程图等非 class 场景使用 */
  hex: string
  /** 文本色 class */
  text: string
  /** 边框色 class */
  border: string
  /** 浅底色 class（列表徽标底） */
  bg: string
}

export const NODE_TYPES: Record<NodeType, NodeTypeStyle> = {
  start: { label: '开场', hex: '#2e7d4f', text: 'text-leaf', border: 'border-leaf', bg: 'bg-leaf/10' },
  normal: { label: '推进', hex: '#6b7c90', text: 'text-pencil', border: 'border-pencil', bg: 'bg-pencil/10' },
  branch: { label: '分支', hex: '#cf5527', text: 'text-vermilion', border: 'border-vermilion', bg: 'bg-vermilion/10' },
  explore: { label: '探索', hex: '#23507f', text: 'text-inkblue', border: 'border-inkblue', bg: 'bg-inkblue/10' },
  merge: { label: '汇合', hex: '#5c6e9c', text: 'text-[#5c6e9c]', border: 'border-[#5c6e9c]', bg: 'bg-[#5c6e9c]/10' },
  ending: { label: '结局', hex: '#a4652a', text: 'text-amberink', border: 'border-amberink', bg: 'bg-amberink/10' },
}

export function nodeTypeStyle(type: NodeType): NodeTypeStyle {
  return NODE_TYPES[type] ?? NODE_TYPES.normal
}
