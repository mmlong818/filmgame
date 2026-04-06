import os
import sys
import io

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

from playwright.sync_api import sync_playwright

SCREENSHOT_DIR = "C:/temp/test-screenshots"
os.makedirs(SCREENSHOT_DIR, exist_ok=True)

errors = []
findings = []

def log(msg):
    print(msg, flush=True)

def safe_text(t, n=500):
    return t[:n].replace("\n", " | ")

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    context = browser.new_context(viewport={"width": 1280, "height": 900})
    page = context.new_page()

    console_errors = []
    page.on("console", lambda msg: console_errors.append(f"[{msg.type}] {msg.text}") if msg.type == "error" else None)

    # --- TEST 1: 首页，确认5个示例项目 ---
    log("\n=== TEST 1: 首页 - 5个示例项目 ===")
    page.goto("http://localhost:3000", wait_until="networkidle")
    page.screenshot(path=f"{SCREENSHOT_DIR}/01-homepage.png", full_page=True)

    seed_links = page.locator("a[href^='/seed']").all()
    log(f"  示例项目 (a[href^='/seed']) 数量: {len(seed_links)}")
    for lnk in seed_links:
        href = lnk.get_attribute("href")
        txt = lnk.inner_text()[:60].replace("\n", " ")
        log(f"    {href} => {txt!r}")

    if len(seed_links) >= 5:
        log("  OK: 首页显示 5 个示例项目")
        findings.append("TEST1 PASS: 首页正常显示 5 个示例项目")
    else:
        msg = f"TEST1 FAIL: 首页示例项目数量不足，找到 {len(seed_links)} 个（期望 >=5）"
        errors.append(msg)
        log(f"  FAIL: {msg}")

    # --- TEST 2: 点击第一个项目 -> workshop ---
    log("\n=== TEST 2: 第一个示例项目 Workshop ===")
    # /seed -> workshop is at /seed (same page with steps) or separate route?
    # Let's click the first seed link
    first_seed = seed_links[0].get_attribute("href") if seed_links else "/seed"
    log(f"  访问首个示例: {first_seed}")
    page.goto(f"http://localhost:3000{first_seed}", wait_until="networkidle")
    page.screenshot(path=f"{SCREENSHOT_DIR}/02-seed-project.png", full_page=True)

    seed_body = page.inner_text("body")
    log(f"  页面内容前400字: {safe_text(seed_body, 400)}")

    # 查找 workshop 链接
    workshop_links = page.locator("a[href*='workshop']").all()
    log(f"  Workshop 链接数量: {len(workshop_links)}")

    if workshop_links:
        ws_href = workshop_links[0].get_attribute("href")
        log(f"  进入 workshop: {ws_href}")
        page.goto(f"http://localhost:3000{ws_href}" if ws_href.startswith("/") else ws_href, wait_until="networkidle")
    else:
        # 尝试直接拼接
        ws_url = f"http://localhost:3000{first_seed}/workshop"
        log(f"  直接访问: {ws_url}")
        page.goto(ws_url, wait_until="networkidle")

    page.screenshot(path=f"{SCREENSHOT_DIR}/02-workshop.png", full_page=True)
    ws_body = page.inner_text("body")
    log(f"  Workshop 内容前500字: {safe_text(ws_body, 500)}")

    # 判断节点列表
    node_count = page.locator("[class*='node'], [data-node], .scene, [class*='scene']").count()
    has_node_list = node_count > 0 or any(kw in ws_body for kw in ["节点", "场景", "node", "scene", "Node", "Scene"])
    log(f"  节点相关元素数量: {node_count}, 关键词检测: {has_node_list}")
    if has_node_list:
        findings.append("TEST2 PASS: Workshop 页面包含节点/场景内容")
        log("  OK: Workshop 节点列表正常")
    else:
        msg = "TEST2 WARN: Workshop 页面未找到明显节点列表（可能UI结构不同）"
        findings.append(msg)
        log(f"  WARN: {msg}")

    # --- TEST 3: /projects 页面 ---
    log("\n=== TEST 3: /projects 页面 - JS 错误检查 ===")
    err_before = len(console_errors)
    page.goto("http://localhost:3000/projects", wait_until="networkidle")
    page.screenshot(path=f"{SCREENSHOT_DIR}/03-projects.png", full_page=True)
    new_js_errors = console_errors[err_before:]
    proj_body = page.inner_text("body")
    log(f"  页面内容前400字: {safe_text(proj_body, 400)}")

    if new_js_errors:
        msg = f"TEST3 FAIL: /projects 有 {len(new_js_errors)} 个 JS 错误"
        errors.append(msg)
        for e in new_js_errors:
            log(f"  JS ERROR: {e}")
    else:
        findings.append("TEST3 PASS: /projects 无 JavaScript 错误")
        log("  OK: 无 JS 错误")

    # --- TEST 4: /project/xgFL4Yws/branches (用户项目) + seed branches ---
    # First try the user project
    log("\n=== TEST 4: branches 页面 ===")
    # Try seed/1 variant first
    branch_urls = [
        "http://localhost:3000/seed/branches",
        "http://localhost:3000/project/xgFL4Yws/branches",
        "http://localhost:3000/project/seed-1/branches",
    ]
    branches_body = ""
    working_branch_url = None
    for burl in branch_urls:
        err_before = len(console_errors)
        page.goto(burl, wait_until="networkidle")
        body_check = page.inner_text("body")
        if "项目不存在" not in body_check and len(body_check.strip()) > 50:
            working_branch_url = burl
            branches_body = body_check
            log(f"  使用: {burl}")
            break
        else:
            log(f"  跳过 (项目不存在): {burl}")

    # Also check seed/1 workshop to find project ID
    if not working_branch_url:
        # Check from seed page what project ID is used
        page.goto("http://localhost:3000/seed", wait_until="networkidle")
        seed_all_links = page.locator("a").all()
        for lnk in seed_all_links:
            href = lnk.get_attribute("href") or ""
            if "project" in href and "branches" in href:
                working_branch_url = f"http://localhost:3000{href}"
                log(f"  从seed找到branches链接: {working_branch_url}")
                break

    if working_branch_url:
        page.goto(working_branch_url, wait_until="networkidle")
        branches_body = page.inner_text("body")

    page.screenshot(path=f"{SCREENSHOT_DIR}/04-branches.png", full_page=True)
    log(f"  页面内容前1000字: {safe_text(branches_body, 1000)}")

    # 检查三个关键指标
    has_divergence = any(kw in branches_body for kw in ["差异", "diverge", "Diverge", "分歧", "差异化", "路径", "分支差异"])
    has_coverage = any(kw in branches_body for kw in ["覆盖", "coverage", "Coverage", "变量覆盖", "覆盖率"])
    has_fake_warn = any(kw in branches_body for kw in ["假分支", "fake", "Fake", "虚假", "警告", "warning", "Warning"])

    log(f"  路径差异化指标: {'找到' if has_divergence else '未找到'}")
    log(f"  变量覆盖率: {'找到' if has_coverage else '未找到'}")
    log(f"  假分支警告: {'找到' if has_fake_warn else '未找到'}")

    new_js_errors = console_errors[err_before:]
    if new_js_errors:
        errors.append(f"TEST4 FAIL: branches 有 JS 错误: {new_js_errors}")

    result4 = []
    if has_divergence:
        result4.append("路径差异化指标: 存在")
    else:
        result4.append("路径差异化指标: 未找到")
        errors.append("TEST4: 未找到路径差异化指标")
    if has_coverage:
        result4.append("变量覆盖率: 存在")
    else:
        result4.append("变量覆盖率: 未找到")
        errors.append("TEST4: 未找到变量覆盖率")
    if has_fake_warn:
        result4.append("假分支警告: 存在")
    else:
        result4.append("假分支警告: 未找到（可能无假分支）")

    findings.append(f"TEST4: {' | '.join(result4)}")

    # --- TEST 5: preview 页面 ---
    log("\n=== TEST 5: preview 页面 ===")
    preview_urls = [
        "http://localhost:3000/seed/preview",
        "http://localhost:3000/project/xgFL4Yws/preview",
        "http://localhost:3000/project/seed-1/preview",
    ]
    preview_body = ""
    working_preview_url = None
    for purl in preview_urls:
        err_before = len(console_errors)
        page.goto(purl, wait_until="networkidle")
        body_check = page.inner_text("body")
        if "项目不存在" not in body_check and len(body_check.strip()) > 50:
            working_preview_url = purl
            preview_body = body_check
            log(f"  使用: {purl}")
            break
        else:
            log(f"  跳过 (项目不存在): {purl}")

    page.screenshot(path=f"{SCREENSHOT_DIR}/05-preview.png", full_page=True)
    log(f"  页面内容前500字: {safe_text(preview_body, 500)}")
    new_js_errors = console_errors[err_before:]

    if new_js_errors:
        errors.append(f"TEST5 FAIL: preview 有 JS 错误: {new_js_errors}")
        log(f"  JS ERROR: {new_js_errors}")

    if len(preview_body.strip()) < 50:
        msg = "TEST5 FAIL: 预览页面内容过少，可能崩溃或无内容"
        errors.append(msg)
        log(f"  FAIL: {msg}")
    else:
        findings.append("TEST5 PASS: 预览页面正常加载，无崩溃")
        log("  OK: 预览页面有内容")

    # 总控制台错误
    log(f"\n  全部控制台错误列表 ({len(console_errors)} 条):")
    for ce in console_errors:
        log(f"    {ce}")

    browser.close()

# --- 总结 ---
log("\n" + "="*60)
log("测试总结")
log("="*60)
log("\n发现/结论:")
for f in findings:
    log(f"  + {f}")

if errors:
    log(f"\n问题 ({len(errors)} 个):")
    for i, e in enumerate(errors, 1):
        log(f"  {i}. {e}")
else:
    log("\n所有测试通过，未发现错误。")

log(f"\n截图目录: {SCREENSHOT_DIR}")
log("截图文件:")
for f in sorted(os.listdir(SCREENSHOT_DIR)):
    log(f"  {SCREENSHOT_DIR}/{f}")
