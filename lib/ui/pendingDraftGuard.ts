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
// 进行中的长任务（结构生成/分支生成/批量 AI）。这些走流式或长轮询请求，页面一关或
// 一跳转就中断，取消传导会让服务端整轮作废——标准版结构 8 分钟、分支 5 分钟全部重来，
// 而此前离开时没有任何警告（真实检查里自己就栽了两次）。
let runningLabel: string | null = null

export function setRunningGeneration(label: string | null): void {
  runningLabel = label
}

export function hasRunningGeneration(): boolean {
  return runningLabel !== null
}

// 关页/刷新兜底：草稿或生成任何一项在途就拦。只注册一次（模块级）。
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', (e) => {
    if (pendingCount === 0 && runningLabel === null) return
    e.preventDefault()
    e.returnValue = ''
  })
}

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
  if (typeof window === 'undefined') return true
  if (runningLabel !== null) {
    return window.confirm(`「${runningLabel}」正在进行，离开将中断并作废本次生成（需重头再来）。确定离开吗？`)
  }
  if (pendingCount === 0) return true
  const what = noticeText || `${pendingCount} 处 AI 草稿尚未采纳`
  return window.confirm(`${what}，离开将丢弃。确定离开吗？`)
}
