"""
filmgame 新项目完整流程测试 v2
走完所有5个阶段，截图记录每个关键步骤
"""
import os
from playwright.sync_api import sync_playwright

OUT = "C:/Users/nd851/AppData/Local/Temp/filmgame_new_project"
os.makedirs(OUT, exist_ok=True)
BASE = "http://localhost:3000"
errors = []
project_id = None

def ss(page, name, msg=""):
    path = f"{OUT}/{name}.png"
    page.screenshot(path=path, full_page=True)
    print(f"  [ss] {name}.png  {msg}")

def wait_ai(page, timeout=60000):
    """等待 AI 加载完成"""
    try:
        page.wait_for_selector(".animate-spin", timeout=8000)
        page.wait_for_selector(".animate-spin", state="hidden", timeout=timeout)
    except:
        pass
    try:
        page.wait_for_selector("text=生成中", timeout=3000)
        page.wait_for_selector("text=生成中", state="hidden", timeout=timeout)
    except:
        pass
    page.wait_for_timeout(2000)

def find_enabled_ai_btn(page, keywords=None):
    """找到可点击的 AI 相关按钮（排除 disabled）"""
    if keywords is None:
        keywords = ["生成", "AI生成", "智能生成", "自动生成"]
    for b in page.locator("button").all():
        try:
            if b.is_disabled():
                continue
            txt = b.inner_text().strip()
            for k in keywords:
                if k in txt:
                    print(f"  找到可用按钮: '{txt}'")
                    return b
        except:
            pass
    return None

def fill_textarea(page, text):
    """填写页面上第一个空的 textarea"""
    for ta in page.locator("textarea").all():
        try:
            if not ta.is_disabled() and not ta.input_value():
                ta.fill(text)
                return True
        except:
            pass
    return False

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1440, "height": 900})
    console_errors = []
    page.on("console", lambda m: console_errors.append(m.text) if m.type == "error" else None)

    # ── Step 1: 首页 ─────────────────────────────────────────────────────────
    print("\n[Step 1] 首页")
    page.goto(BASE)
    page.wait_for_load_state("networkidle")
    page.wait_for_timeout(1000)
    ss(page, "01_home", "首页")

    # ── Step 2: 创建新项目 ───────────────────────────────────────────────────
    print("\n[Step 2] 创建新项目")
    page.goto(f"{BASE}/projects")
    page.wait_for_load_state("networkidle")
    ss(page, "02a_projects", "项目列表")

    try:
        # 找新建按钮
        new_btn = None
        for b in page.locator("button").all():
            txt = b.inner_text().strip()
            if any(k in txt for k in ["新建", "新项目", "创建", "+"]):
                new_btn = b
                break
        assert new_btn, "未找到新建按钮"
        new_btn.click()
        page.wait_for_timeout(1500)
        ss(page, "02b_dialog", "创建对话框")

        # 填写标题
        inp = page.locator("input[type='text']").first
        inp.clear()
        inp.fill("末日审判")
        page.wait_for_timeout(300)

        # 点击确认
        confirmed = False
        for btn_text in ["创建", "确认", "确定"]:
            btn = page.get_by_role("button", name=btn_text)
            if btn.count() > 0 and btn.first.is_visible() and not btn.first.is_disabled():
                btn.first.click()
                confirmed = True
                break
        if not confirmed:
            page.locator("button[type='submit']").first.click()

        page.wait_for_load_state("networkidle")
        page.wait_for_timeout(2000)
        url = page.url
        print(f"  URL: {url}")
        if "/project/" in url:
            project_id = url.split("/project/")[1].split("/")[0]
        ss(page, "02c_created", f"创建后 id={project_id}")
    except Exception as e:
        errors.append(f"Step2: {e}")
        print(f"  ERROR: {e}")

    # 兜底：找现有项目
    if not project_id:
        try:
            page.goto(BASE)
            page.wait_for_load_state("networkidle")
            href = page.locator("a[href*='/project/']").first.get_attribute("href")
            project_id = href.split("/project/")[1].split("/")[0]
            print(f"  使用现有项目: {project_id}")
        except:
            project_id = "escape_manifest"

    PROJ = f"{BASE}/project/{project_id}"
    print(f"  PROJ = {PROJ}")

    # ── Step 3: 世界锚点 ─────────────────────────────────────────────────────
    print("\n[Step 3] 世界锚点")
    page.goto(f"{PROJ}/world")
    page.wait_for_load_state("networkidle")
    page.wait_for_timeout(1500)
    ss(page, "03a_world_init", "世界锚点初始")

    # 填写核心创意（如果有空 textarea）
    filled = fill_textarea(page, "一个末日前的小镇，幸存者们必须在三天内决定谁能搭上最后一班撤离列车。道德崩溃，人性试炼。")
    if filled:
        page.wait_for_timeout(500)

    # 找可用的 AI 生成按钮
    ai_btn = find_enabled_ai_btn(page, ["生成", "AI", "智能"])
    if ai_btn:
        ai_btn.click()
        print("  等待 AI 生成世界锚点...")
        wait_ai(page, 90000)
        ss(page, "03b_world_ai", "世界锚点 AI 生成后")
    else:
        # 截图看看页面状态
        ss(page, "03b_world_no_ai", "世界锚点（无可用AI按钮）")
        # 打印所有按钮
        for b in page.locator("button").all():
            try:
                print(f"    btn: '{b.inner_text().strip()[:30]}' disabled={b.is_disabled()}")
            except:
                pass

    # ── Step 4: 规模规划 ─────────────────────────────────────────────────────
    print("\n[Step 4] 规模规划")
    page.goto(f"{PROJ}/scale")
    page.wait_for_load_state("networkidle")
    page.wait_for_timeout(1500)
    ss(page, "04a_scale_init", "规模规划初始")

    ai_btn = find_enabled_ai_btn(page, ["生成", "AI", "智能", "规划"])
    if ai_btn:
        ai_btn.click()
        print("  等待 AI 生成规模方案...")
        wait_ai(page, 90000)
        ss(page, "04b_scale_ai", "规模规划 AI 生成后")
    else:
        ss(page, "04b_scale_no_ai", "规模规划（无可用AI按钮）")
        for b in page.locator("button").all():
            try:
                print(f"    btn: '{b.inner_text().strip()[:30]}' disabled={b.is_disabled()}")
            except:
                pass

    # ── Step 5: 故事结构 ─────────────────────────────────────────────────────
    print("\n[Step 5] 故事结构")
    page.goto(f"{PROJ}/structure")
    page.wait_for_load_state("networkidle")
    page.wait_for_timeout(1500)
    ss(page, "05a_structure_init", "故事结构初始")

    ai_btn = find_enabled_ai_btn(page, ["生成", "AI", "智能", "构建", "创建"])
    if ai_btn:
        ai_btn.click()
        print("  等待 AI 生成故事结构（最长 120s）...")
        wait_ai(page, 120000)
        page.wait_for_timeout(2000)
        ss(page, "05b_structure_ai", "故事结构 AI 生成后")
    else:
        ss(page, "05b_structure_no_ai", "故事结构（无可用AI按钮）")
        for b in page.locator("button").all():
            try:
                print(f"    btn: '{b.inner_text().strip()[:30]}' disabled={b.is_disabled()}")
            except:
                pass

    # 切换流程图
    for b in page.locator("button").all():
        try:
            if "流程图" in b.inner_text():
                b.click()
                page.wait_for_timeout(3000)
                ss(page, "05c_flowview", "流程图视图")
                break
        except:
            pass

    # ── Step 6: 剧本工坊 ─────────────────────────────────────────────────────
    print("\n[Step 6] 剧本工坊")
    page.goto(f"{PROJ}/workshop")
    page.wait_for_load_state("networkidle")
    page.wait_for_timeout(2000)
    ss(page, "06a_workshop", "工坊节点列表")

    # 选第一个节点
    try:
        # 点击第一个 li 或节点卡片
        node_clicked = False
        for sel in ["li[class*='cursor']", "li", "button[class*='node']"]:
            items = page.locator(sel).all()
            for item in items:
                try:
                    txt = item.inner_text().strip()
                    if 2 < len(txt) < 50:
                        item.click()
                        page.wait_for_timeout(1500)
                        node_clicked = True
                        print(f"  点击节点: '{txt[:20]}'")
                        break
                except:
                    pass
            if node_clicked:
                break

        ss(page, "06b_node_panel", "节点面板")

        # 找 AI 生成对白按钮
        ai_btn = find_enabled_ai_btn(page, ["对白", "生成", "AI"])
        if ai_btn:
            ai_btn.click()
            print("  等待 AI 生成节点内容...")
            wait_ai(page, 60000)
            ss(page, "06c_node_ai", "节点 AI 生成后")
        else:
            print("  无可用对白生成按钮（节点可能已有内容）")

    except Exception as e:
        errors.append(f"Step6 工坊: {e}")
        print(f"  ERROR: {e}")

    # ── Step 7: 全局校验 ─────────────────────────────────────────────────────
    print("\n[Step 7] 全局校验")
    page.goto(f"{PROJ}/validate")
    page.wait_for_load_state("networkidle")
    page.wait_for_timeout(2000)
    ss(page, "07a_validate", "校验页面")

    ai_btn = find_enabled_ai_btn(page, ["校验", "检查", "分析", "运行", "生成"])
    if ai_btn:
        ai_btn.click()
        print("  等待校验完成...")
        wait_ai(page, 90000)
        ss(page, "07b_validate_result", "校验结果")
    else:
        print("  无可用校验按钮")
        for b in page.locator("button").all():
            try:
                print(f"    btn: '{b.inner_text().strip()[:30]}' disabled={b.is_disabled()}")
            except:
                pass

    # ── Step 8: 分支分析 ─────────────────────────────────────────────────────
    print("\n[Step 8] 分支分析")
    page.goto(f"{PROJ}/branches")
    page.wait_for_load_state("networkidle")
    page.wait_for_timeout(2000)
    ss(page, "08_branches", "分支分析")

    # ── Step 9: 最终流程图 ───────────────────────────────────────────────────
    print("\n[Step 9] 最终流程图（多列验证）")
    page.goto(f"{PROJ}/structure")
    page.wait_for_load_state("networkidle")
    page.wait_for_timeout(1500)
    for b in page.locator("button").all():
        try:
            if "流程图" in b.inner_text():
                b.click()
                page.wait_for_timeout(3000)
                ss(page, "09_flowview_final", "最终流程图")
                break
        except:
            pass

    browser.close()

# ── 汇总 ──────────────────────────────────────────────────────────────────────
print("\n" + "="*60)
print(f"项目 ID: {project_id}")
print("\n截图文件：")
for f in sorted(os.listdir(OUT)):
    if f.endswith(".png"):
        size = os.path.getsize(f"{OUT}/{f}")
        print(f"  {f}  ({size//1024} KB)")

print(f"\nConsole 错误数: {len(console_errors)}")
for e in console_errors[:5]:
    print(f"  [ERR] {e[:120]}")

if errors:
    print(f"\n流程问题 ({len(errors)}):")
    for e in errors:
        print(f"  [X] {e}")
else:
    print("\n[OK] 流程无中断错误")
