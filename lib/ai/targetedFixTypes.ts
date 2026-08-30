// 定向重构（FR-19 structure:targeted_fix）的补丁契约。
// schemas.ts 的输出 schema 与 structure 页的应用层都以此为准，两边不得各自扩展。
// LLM 以节点标题或 id 引用目标（nodeRef），应用层负责解析与新 id 生成。

import type { NodeType } from '@/lib/types/project'

/** 节点引用：优先 id，其次精确标题匹配 */
export interface NodeRef {
  nodeId?: string
  nodeTitle?: string
}

export interface TargetedFixNewNode {
  title: string
  type: NodeType
  /** 剧情意图说明（写入节点 notes） */
  notes?: string
}

export interface TargetedFixNewChoice {
  text: string
  /** 目标节点引用（可指向本补丁中新增的节点标题） */
  target: NodeRef
  /** 显示条件表达式；空 = 无条件（保底出口） */
  conditions?: string
  /** 变量效果，如 "trust+1" */
  variableEffects?: string
  consequence?: string
}

export type TargetedFixOp =
  | {
      op: 'add_node'
      /** 插入位置：该节点之后（同幕） */
      after: NodeRef
      node: TargetedFixNewNode
      reason: string
    }
  | {
      op: 'update_node'
      target: NodeRef
      patch: { title?: string; type?: NodeType; notes?: string }
      reason: string
    }
  | {
      op: 'add_choice'
      /** 选项挂在哪个节点上 */
      target: NodeRef
      choice: TargetedFixNewChoice
      reason: string
    }
  | {
      op: 'update_choice'
      /** 选项所在节点 */
      target: NodeRef
      /** 按选项文本精确匹配 */
      choiceText: string
      patch: { text?: string; conditions?: string; variableEffects?: string; consequence?: string; targetRef?: NodeRef }
      reason: string
    }
  | {
      op: 'set_explore_return'
      target: NodeRef
      returnTo: NodeRef
      reason: string
    }
  | {
      op: 'bind_ending'
      /** 结局节点 */
      target: NodeRef
      ending: { title: string; type: 'good' | 'bad' | 'neutral' | 'secret'; description?: string; conditions?: string }
      reason: string
    }

export interface TargetedFixResult {
  /** 总体修复思路（一两句，展示给编剧） */
  summary: string
  ops: TargetedFixOp[]
}
