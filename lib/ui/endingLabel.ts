/**
 * 剥掉结局标题/描述里的结构工序标注，只留给玩家看的部分。
 *
 * 结构生成阶段会给 ending 节点打上「路径C·即死结局：」「[路径A]」「（BAD END）」这类
 * 工序标记——它们是给编剧看的路线标签。未绑定结局线的 ending 节点会用节点标题兜底成
 * 结局定义/结局画面标题，于是玩家看到「路径C·即死结局（BAD END）《占线》」，
 * 真正的结局名反被埋在最后。结构页导入结局定义与预览页结局画面共用本函数。
 */
export function stripWorkflowTags(raw: string | undefined): string {
  let s = (raw ?? '').trim()
  if (!s) return ''
  s = s.replace(/^\[[^\]]{1,12}\]\s*/g, '')                                    // [路径A]
  s = s.replace(/^路径[A-Z]\s*[·:：]\s*/g, '')                          // 路径C·
  s = s.replace(/^(即死结局|结局)\s*[（(][^）)]{0,16}[）)]\s*[:：]?\s*/g, '') // 即死结局（BAD END）：
  s = s.replace(/^(即死结局|结局)\s*[:：]\s*/g, '')                           // 即死结局：
  s = s.replace(/^《([^》]{1,30})》\s*[:：]?\s*/, '$1 ')        // 《占线》→ 占线
  return s.trim()
}
