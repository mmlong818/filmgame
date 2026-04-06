"""
filmgame 完整流程测试 v3
修复：世界锚点所有必填字段 → 规模规划 AI → 故事结构 AI → 工坊 → 校验
"""
import os, json, time
from playwright.sync_api import sync_playwright

OUT = "C:/Users/nd851/AppData/Local/Temp/filmgame_full_flow"
os.makedirs(OUT, exist_ok=True)
BASE = "http://localhost:3000"
errors = []

def ss(page, name, msg=""):
    path = f"{OUT}/{name}.png"
    page.screenshot(path=path, full_page=True)
    print(f"  [ss] {name}.png  {msg}")

def wait_ai(page, timeout=90000):
    """等待 AI 生成完成"""
    # 等出现 spinner
    try:
        page.wait_for_selector(".animate-spin", timeout=8000)
    except:
        pass
    # 等 spinner 消失
    try:
        page.wait_for_selector(".animate-spin", state="hidden", timeout=timeout)
    except:
        pass
    # 等 "生成中" 文字消失
    try:
        page.wait_for_selector("text=生成中", state="hidden", timeout=5000)
    except:
        pass
    page.wait_for_timeout(2000)

def find_enabled_btn(page, keywords):
    for b in page.locator("button").all():
        try:
            if b.is_disabled():
                continue
            txt = b.inner_text().strip()
            if any(k in txt for k in keywords):
                return b, txt
        except:
            pass
    return None, None

def fill_field(page, selector, value):
    try:
        el = page.locator(selector).first
        el.clear()
        el.fill(value)
        page.wait_for_timeout(300)
        return True
    except:
        return False

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1440, "height": 900})
    console_errors = []
    api_responses = []
    page.on("console", lambda m: console_errors.append(m.text) if m.type == "error" else None)
    def on_response(resp):
        if "/api/ai" in resp.url:
            try:
                body = resp.json()
                api_responses.append(f"[{resp.status}] phase={body.get('result',{}) and 'ok'} ok={body.get('ok')} err={body.get('error','')[:80]}")
            except:
                api_responses.append(f"[{resp.status}] (parse fail)")
    page.on("response", on_response)

    # ── Step 1: 创建新项目 ───────────────────────────────────────────────────
    print("\n[Step 1] 创建新项目")
    page.goto(f"{BASE}/projects")
    try:
        page.wait_for_load_state("networkidle", timeout=15000)
    except: pass
    ss(page, "01_projects", "项目列表")

    project_id = None
    try:
        new_btn, _ = find_enabled_btn(page, ["新建", "新项目", "+"])
        assert new_btn, "未找到新建按钮"
        new_btn.click()
        page.wait_for_timeout(1500)

        page.locator("input[type='text']").first.fill("末日审判")
        page.wait_for_timeout(300)

        confirm_btn, _ = find_enabled_btn(page, ["创建", "确认", "确定"])
        if confirm_btn:
            confirm_btn.click()
        else:
            page.locator("button[type='submit']").first.click()

        try:

            page.wait_for_load_state("networkidle", timeout=15000)

        except: pass
        page.wait_for_timeout(2000)

        url = page.url
        if "/project/" in url:
            project_id = url.split("/project/")[1].split("/")[0]
            print(f"  项目 ID: {project_id}")
        ss(page, "01b_created", f"项目已创建 {project_id}")
    except Exception as e:
        errors.append(f"Step1: {e}")
        print(f"  ERROR: {e}")

    if not project_id:
        errors.append("无法获取 project_id，测试中止")
        print("  ABORT: 无法创建项目")
        browser.close()
        exit(1)

    PROJ = f"{BASE}/project/{project_id}"

    # ── Step 2: 世界锚点 - 填写所有必填字段 ─────────────────────────────────
    print("\n[Step 2] 世界锚点 - 填写完整")
    page.goto(f"{PROJ}/world")
    try:
        page.wait_for_load_state("networkidle", timeout=15000)
    except: pass
    page.wait_for_timeout(1500)
    ss(page, "02a_world_init", "世界锚点初始")

    # 找所有 textarea/input 并按顺序填写
    textareas = page.locator("textarea").all()
    inputs = page.locator("input[type='text'], input:not([type])").all()
    print(f"  textarea 数: {len(textareas)}, input 数: {len(inputs)}")

    world_data = {
        0: "一个末日前夕的小镇，幸存者必须在48小时内决定谁能登上最后一班撤离列车。选择意味着有人活，有人死。",
        1: "当规则崩溃，人是否还能保持善意？道德的底线在哪里？",
        2: "悬疑+心理惊悚+末日生存",
        3: "1. 撤离列车只有50个位置，小镇有300人\n2. 镇委会掌握名单，但名单可以被交易\n3. 一旦有人选择离开，其他人的选择会连锁改变",
    }

    for i, ta in enumerate(textareas):
        if i in world_data:
            try:
                if not ta.is_disabled():
                    ta.fill(world_data[i])
                    print(f"  填写 textarea[{i}]: {world_data[i][:30]}...")
            except:
                pass

    # 填写数字字段（结局数量等）
    for inp in inputs:
        try:
            placeholder = inp.get_attribute("placeholder") or ""
            if not inp.is_disabled() and not inp.input_value():
                if "时长" in placeholder or "分钟" in placeholder:
                    inp.fill("60")
                elif "结局" in placeholder or "数量" in placeholder:
                    inp.fill("3")
        except:
            pass

    page.wait_for_timeout(500)
    ss(page, "02b_world_filled", "世界锚点填写后")

    # 滚动到底部触发保存
    page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
    page.wait_for_timeout(1000)
    ss(page, "02c_world_bottom", "世界锚点底部")

    # ── Step 3: 规模规划 ─────────────────────────────────────────────────────
    print("\n[Step 3] 规模规划")
    page.goto(f"{PROJ}/scale")
    try:
        page.wait_for_load_state("networkidle", timeout=15000)
    except: pass
    page.wait_for_timeout(1500)
    ss(page, "03a_scale_init", "规模规划初始")

    ai_btn, btn_txt = find_enabled_btn(page, ["生成", "AI", "智能", "规划"])
    if ai_btn:
        print(f"  点击: '{btn_txt}'")
        ai_btn.click()
        print("  等待 AI 生成规模方案...")
        wait_ai(page, 120000)
        ss(page, "03b_scale_done", "规模规划完成")
    else:
        print("  无可用按钮，列举所有按钮:")
        for b in page.locator("button").all():
            try:
                print(f"    '{b.inner_text().strip()[:40]}' disabled={b.is_disabled()}")
            except:
                pass
        ss(page, "03b_scale_no_btn", "规模规划（无按钮）")
        errors.append("规模规划无 AI 按钮")

    # 选择"精简版"方案（节点最少，结构AI生成最快）
    try:
        selected = False
        # 优先找精简版卡片的 onClick 区域
        for item in page.locator("[class*='cursor']").all():
            try:
                txt = item.inner_text()
                if "精简版" in txt and item.is_visible():
                    item.click()
                    page.wait_for_timeout(800)
                    print("  选择了精简版方案")
                    selected = True
                    break
            except:
                pass
        if not selected:
            # 兜底：找任何含"精简"的可点击元素
            for item in page.locator("div, li, button").all():
                try:
                    txt = item.inner_text()
                    if "精简版" in txt and item.is_visible() and item.bounding_box():
                        item.click()
                        page.wait_for_timeout(800)
                        print("  选择了精简版（备用）")
                        selected = True
                        break
                except:
                    pass
        if not selected:
            print("  未找到精简版方案")
    except Exception as e:
        print(f"  选择方案: {e}")

    ss(page, "03c_scale_selected", "选择方案后")

    # ── Step 4: 故事结构 AI ─────────────────────────────────────────────────
    print("\n[Step 4] 故事结构（两步自动生成：结构→分支）")
    page.goto(f"{PROJ}/structure", timeout=60000)
    try:
        page.wait_for_load_state("networkidle", timeout=15000)
    except: pass
    page.wait_for_timeout(2000)
    ss(page, "04a_structure_loading", "故事结构加载中")

    def wait_for_btn(keywords, timeout_ms=300000):
        """等待含指定关键词的可用按钮出现，返回按钮或None"""
        deadline = time.time() + timeout_ms / 1000
        while time.time() < deadline:
            for b in page.locator("button").all():
                try:
                    txt = b.inner_text().strip()
                    if any(k in txt for k in keywords) and not b.is_disabled() and b.is_visible():
                        return b, txt
                except: pass
            page.wait_for_timeout(2000)
        return None, None

    # 步骤1：等待结构预览（成功）或错误进入编辑（超时）
    print("  等待结构AI完成（最长10分钟）...")
    btn, txt = wait_for_btn(["通过", "生成分支", "重新生成", "重新 AI", "AI 设计", "添加章"], 650000)
    ss(page, "04b_struct_preview", "结构预览阶段")
    if btn:
        print(f"  找到: '{txt}'")
        # 优先找「通过 → 生成分支」（struct_preview 阶段的确认键）
        approve_btn, _ = find_enabled_btn(page, ["生成分支", "通过"])
        if approve_btn:
            approve_btn_txt = approve_btn.inner_text().strip()
            if "生成分支" in approve_btn_txt or "通过" in approve_btn_txt:
                print(f"  点击: '{approve_btn_txt}'")
                approve_btn.click()
                page.wait_for_timeout(3000)  # 等React状态更新
                # 检查点击后状态
                btns_after = [b.inner_text().strip()[:25] for b in page.locator("button").all() if b.inner_text().strip()]
                print(f"  点击后3s按钮: {btns_after[:6]}")
                # 步骤2：等待分支预览（branch_loading→branch_preview）
                print("  等待分支AI完成（最长6分钟）...")
                # 等 branch_loading 结束：等「通过」按钮（确切文本）出现
                branch_done = False
                deadline = time.time() + 370
                while time.time() < deadline:
                    for b in page.locator("button").all():
                        try:
                            t = b.inner_text().strip()
                            if t == "通过" and not b.is_disabled() and b.is_visible():
                                print(f"  分支预览出现，点击「通过」")
                                ss(page, "04c_branch_preview", "分支预览阶段")
                                b.click()
                                page.wait_for_timeout(1000)
                                branch_done = True
                                break
                        except: pass
                    if branch_done:
                        break
                    page.wait_for_timeout(2000)
                if not branch_done:
                    ss(page, "04c_branch_preview", "分支预览阶段（未找到通过）")
                    print("  分支AI超时未完成")
            else:
                print(f"  在编辑模式，结构AI可能超时")
        else:
            print("  未找到确认按钮，可能在编辑模式")
    else:
        print("  结构AI超时未完成，当前按钮:")
        for b in page.locator("button").all():
            try: print(f"    '{b.inner_text().strip()[:40]}' disabled={b.is_disabled()}")
            except: pass
        errors.append("故事结构AI生成超时")

    page.wait_for_timeout(2000)
    ss(page, "04d_structure_edit", "故事结构编辑模式")
    print(f"  当前按钮: {[b.inner_text().strip()[:30] for b in page.locator('button').all() if b.inner_text().strip()][:8]}")

    # 流程图视图
    for b in page.locator("button").all():
        try:
            if "流程图" in b.inner_text():
                b.click()
                page.wait_for_timeout(3000)
                ss(page, "04e_flowview", "流程图视图")
                print("  流程图截图完成")
                break
        except:
            pass

    # ── Step 5: 剧本工坊 ─────────────────────────────────────────────────────
    print("\n[Step 5] 剧本工坊")
    page.goto(f"{PROJ}/workshop")
    try:
        page.wait_for_load_state("networkidle", timeout=15000)
    except: pass
    page.wait_for_timeout(2000)
    ss(page, "05a_workshop", "工坊节点列表")

    # 选第一个节点
    try:
        node_found = False
        for sel in ["li[class*='cursor']", "li[class*='node']", "li"]:
            for item in page.locator(sel).all():
                try:
                    txt = item.inner_text().strip()
                    if 2 < len(txt) < 60 and item.is_visible():
                        item.click()
                        page.wait_for_timeout(1500)
                        node_found = True
                        print(f"  选中节点: '{txt[:30]}'")
                        break
                except:
                    pass
            if node_found:
                break

        ss(page, "05b_node_panel", "节点面板")

        # AI 生成全部节点
        ai_btn, btn_txt = find_enabled_btn(page, ["全部", "批量", "AI", "生成"])
        if ai_btn:
            print(f"  点击: '{btn_txt}'")
            ai_btn.click()
            print("  等待批量生成（最长 180s）...")
            wait_ai(page, 180000)
            ss(page, "05c_workshop_ai_done", "工坊批量生成后")
        else:
            # 单节点生成
            ai_btn, btn_txt = find_enabled_btn(page, ["对白", "生成场景", "AI"])
            if ai_btn:
                print(f"  单节点生成: '{btn_txt}'")
                ai_btn.click()
                wait_ai(page, 60000)
                ss(page, "05c_workshop_node_ai", "节点生成后")
    except Exception as e:
        errors.append(f"Step5: {e}")
        print(f"  ERROR: {e}")

    # ── Step 6: 全局校验 ─────────────────────────────────────────────────────
    print("\n[Step 6] 全局校验")
    page.goto(f"{PROJ}/validate")
    try:
        page.wait_for_load_state("networkidle", timeout=15000)
    except: pass
    page.wait_for_timeout(2000)
    ss(page, "06a_validate", "校验页面")

    ai_btn, btn_txt = find_enabled_btn(page, ["校验", "分析", "检查", "运行", "AI"])
    if ai_btn:
        print(f"  点击: '{btn_txt}'")
        ai_btn.click()
        wait_ai(page, 120000)
        ss(page, "06b_validate_done", "校验结果")
    else:
        print("  无可用校验按钮")
        for b in page.locator("button").all():
            try:
                print(f"    '{b.inner_text().strip()[:40]}' disabled={b.is_disabled()}")
            except:
                pass

    # ── Step 7: 分支分析 ─────────────────────────────────────────────────────
    print("\n[Step 7] 分支分析")
    page.goto(f"{PROJ}/branches")
    try:
        page.wait_for_load_state("networkidle", timeout=15000)
    except: pass
    page.wait_for_timeout(2000)
    ss(page, "07_branches", "分支分析")

    # ── 最终流程图 ───────────────────────────────────────────────────────────
    print("\n[Step 8] 最终流程图")
    page.goto(f"{PROJ}/structure")
    try:
        page.wait_for_load_state("networkidle", timeout=15000)
    except: pass
    page.wait_for_timeout(1500)
    for b in page.locator("button").all():
        try:
            if "流程图" in b.inner_text():
                b.click()
                page.wait_for_timeout(3000)
                ss(page, "08_final_flowview", "最终流程图（多列验证）")
                break
        except:
            pass

    browser.close()

# ── 汇总 ──────────────────────────────────────────────────────────────────────
print("\n" + "="*60)
print(f"项目地址: {BASE}/project/{project_id}/structure")
print("\n截图列表:")
for f in sorted(os.listdir(OUT)):
    if f.endswith(".png"):
        kb = os.path.getsize(f"{OUT}/{f}") // 1024
        print(f"  {f}  ({kb} KB)")

print(f"\nConsole 500 错误数: {sum(1 for e in console_errors if '500' in e)}")
print(f"Console 其他错误数: {sum(1 for e in console_errors if '500' not in e)}")
print(f"\nAPI 响应 ({len(api_responses)}):")
for r in api_responses:
    print(f"  {r}")

if errors:
    print(f"\n流程问题 ({len(errors)}):")
    for e in errors:
        print(f"  [X] {e}")
else:
    print("\n[OK] 无流程中断错误")
