// 未确认 AI 草稿的跨组件守卫。
//
// 工坊的 AI 草稿（对白/情绪/场景）生成后停在「AI 结果」区等待采纳，只存在组件 state 里。
// 此前守卫只挂 beforeunload——那只覆盖关页与刷新；应用内跳转（顶栏「返回」、阶段切换）
// 走 Next.js 客户端路由，完全绕过，草稿被静默丢弃且毫无提示（实测：带草稿点「返回」
// 直接落到项目列表页，零确认）。
//
// 工坊在草稿数变化时登记，布局层的导航入口在跳转前询问。放在 lib/ui 而非 context，
// 是为了让布局与工坊这两棵互不相邻的组件树共享同一状态，且不引入 provider 层级。

let pendingCount = 0
let noticeText = ''

export function setPendingDrafts(count: number, notice = ''): void {
  pendingCount = Math.max(0, count)
  noticeText = notice
}

export function hasPendingDrafts(): boolean {
  return pendingCount > 0
}

/**
 * 跳转前确认。有未确认草稿时弹原生 confirm（这里刻意用 confirm 而非自绘弹窗：
 * 导航是同步动作，异步弹窗需要把每个入口改成受控流程，代价远大于收益）。
 * @returns true 表示可以继续跳转
 */
export function confirmLeaveWithDrafts(): boolean {
  if (pendingCount === 0) return true
  if (typeof window === 'undefined') return true
  const what = noticeText || `${pendingCount} 处 AI 草稿尚未采纳`
  return window.confirm(`${what}，离开将丢弃。确定离开吗？`)
}
