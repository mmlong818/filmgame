# -*- coding: utf-8 -*-
"""
FilmGame E2E 健康度测试 + AI 阶段耗时分析
"""
import sys, io, time, os
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

from playwright.sync_api import sync_playwright, TimeoutError as PWTimeout

BASE   = 'http://localhost:3000'
SHOTS  = '/tmp/fg_e2e'
os.makedirs(SHOTS, exist_ok=True)

_step = [0]
def shot(page, label):
    path = f'{SHOTS}/{_step[0]:02d}_{label}.png'
    page.screenshot(path=path, full_page=True)
    print(f'  [shot] {_step[0]:02d}_{label}')
    _step[0] += 1

timings = {}
def tick(label):
    t0 = time.time()
    def stop():
        elapsed = time.time() - t0
        timings[label] = round(elapsed, 1)
        status = 'OK' if elapsed < 60 else ('SLOW' if elapsed < 120 else 'VERY SLOW')
        print(f'  [{status}] {label}: {elapsed:.1f}s')
        return elapsed
    return stop

def wait_ai(page, timeout=150000):
    """等待 AI spinner 消失"""
    try:
        page.wait_for_selector('.animate-spin', timeout=6000)
        page.wait_for_selector('.animate-spin', state='hidden', timeout=timeout)
        page.wait_for_timeout(600)
    except PWTimeout:
        pass

def try_click(page, selector, fallback=None):
    """尝试点击，找不到就跳过"""
    try:
        loc = page.locator(selector).first
        if loc.count() > 0 and loc.is_visible():
            loc.click()
            return True
    except Exception:
        pass
    if fallback:
        try:
            loc = page.locator(fallback).first
            if loc.count() > 0 and loc.is_visible():
                loc.click()
                return True
        except Exception:
            pass
    return False

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={'width': 1400, 'height': 900})
        errors = []

        # ── 0. 创建项目 ────────────────────────────────────────────
        print('\n[0] 创建项目')
        page.goto(BASE + '/projects')
        page.wait_for_load_state('domcontentloaded')
        shot(page, 'projects')

        t = tick('0_create_project')
        page.locator('button', has_text='+ 新建项目').click()
        page.wait_for_timeout(600)
        page.locator('input[placeholder*="项目标题"]').fill('E2E测试项目')
        page.locator('button', has_text='悬疑惊悚').click()
        page.wait_for_timeout(200)
        page.locator('button', has_text='创建').last.click()
        page.wait_for_load_state('domcontentloaded')
        page.wait_for_timeout(1500)
        shot(page, 'world_loaded')
        t()
        print(f'  URL: {page.url}')
        project_id = page.url.split('/project/')[1].split('/')[0]

        # ── 1. World 填写必填字段 ──────────────────────────────────
        print('\n[1] World 阶段')
        t = tick('1_world_fill')
        # storyCore - textarea[0]
        ta = page.locator('textarea').nth(0)
        ta.click(); ta.fill('一名侦探调查连环失踪案，逐渐发现嫌疑人的面孔和自己记忆中的人物重合，真相将动摇他对自身身份的认知')
        # theme
        theme_inp = page.locator('input[placeholder*="记忆与身份"]')
        if theme_inp.count() > 0:
            theme_inp.fill('记忆与身份认同')
        # genre
        genre_inp = page.locator('input[placeholder*="悬疑"]')
        if genre_inp.count() > 0:
            genre_inp.fill('现代悬疑心理惊悚')
        # durationMinutes
        nums = page.locator('input[type="number"]').all()
        if nums:
            nums[0].click(click_count=3); nums[0].fill('45')
        # worldRules - textarea[1]
        ta2 = page.locator('textarea').nth(1)
        ta2.click(); ta2.fill('1. 每个人的记忆都可能被篡改\n2. 调查真相需要付出代价\n3. 信任一旦破裂无法完全修复')
        page.wait_for_timeout(800)
        shot(page, 'world_filled')
        t()

        # AI 专家审查（可选，跳过如不可用）
        t = tick('1_world_ai_review')
        review_btn = page.locator('button', has_text='AI 专家审查').first
        if review_btn.count() > 0 and review_btn.is_enabled():
            review_btn.click()
            wait_ai(page, 90000)
            shot(page, 'world_ai_review')
        else:
            print('  [skip] AI 专家审查按钮未启用')
        t()

        # AI 生成角色
        t = tick('1_world_ai_chars')
        chars_btn = page.locator('button', has_text='AI 生成').first
        if chars_btn.count() > 0 and chars_btn.is_enabled():
            chars_btn.click()
            wait_ai(page, 90000)
            shot(page, 'world_ai_chars')
        else:
            print('  [skip] AI 生成角色按钮未启用')
        t()

        # 进入 scale
        next_btn = page.locator('button', has_text='下一步').first
        if next_btn.count() > 0 and next_btn.is_visible():
            next_btn.click()
            page.wait_for_load_state('domcontentloaded')
            page.wait_for_timeout(800)
        else:
            errors.append('world->scale 导航按钮未找到')
            page.goto(f'{BASE}/project/{project_id}/scale')
            page.wait_for_load_state('domcontentloaded')

        # ── 2. Scale ───────────────────────────────────────────────
        print('\n[2] Scale 阶段')
        shot(page, 'scale_loaded')

        # Inspect buttons
        btns = [b.inner_text().strip() for b in page.locator('button').all() if b.inner_text().strip()]
        print(f'  按钮: {btns[:10]}')

        # Scale 页可能已自动触发 AI，等待 spinner 消失
        t = tick('2_scale_ai_generate')
        wait_ai(page, 120000)
        # 若未有方案，主动点击生成
        plan_btns = page.locator('button', has_text='选择此方案').all()
        if not plan_btns:
            for label in ['AI 生成规模方案', 'AI 生成', '生成规模', '重新生成']:
                btn = page.locator('button', has_text=label).first
                if btn.count() > 0 and btn.is_enabled():
                    btn.click()
                    wait_ai(page, 120000)
                    break
        shot(page, 'scale_plans')
        t()

        t = tick('2_scale_select')
        # PlanCard 是 div.cursor-pointer，点击即选中
        plan_cards = page.locator('div.cursor-pointer.border-2.rounded-xl').all()
        print(f'  找到 {len(plan_cards)} 个方案卡片')
        if plan_cards:
            plan_cards[0].click()
            page.wait_for_timeout(400)

        next_btn = page.locator('button', has_text='下一步').first
        if next_btn.count() > 0 and next_btn.is_enabled():
            prev_url = page.url
            next_btn.click()
            try:
                page.wait_for_url(lambda u: u != prev_url, timeout=10000)
            except PWTimeout:
                pass
            page.wait_for_timeout(1000)
        if project_id not in page.url or 'structure' not in page.url:
            errors.append('scale->structure 导航失败，强制跳转')
            page.goto(f'{BASE}/project/{project_id}/structure')
        page.wait_for_timeout(1500)
        t()

        # ── 3. Structure ───────────────────────────────────────────
        print('\n[3] Structure 阶段')
        page.wait_for_timeout(2000)
        shot(page, 'structure_loaded')

        # Stage 1: 等待 struct_loading 完成（页面自动触发生成）
        t = tick('3_structure_ai_nodes')
        wait_ai(page, 180000)
        shot(page, 'structure_preview')
        btns = [b.inner_text().strip() for b in page.locator('button').all() if b.inner_text().strip()]
        print(f'  struct_preview 按钮: {btns[:8]}')
        t()

        # Stage 2: 点击"通过 → 生成分支"触发分支生成
        t = tick('3_structure_ai_branches')
        approve_btn = page.locator('button', has_text='通过').first
        if approve_btn.count() > 0 and approve_btn.is_visible():
            approve_btn.click()
            page.wait_for_timeout(500)
            # 等待分支生成
            wait_ai(page, 180000)
            shot(page, 'structure_branches_preview')
            btns2 = [b.inner_text().strip() for b in page.locator('button').all() if b.inner_text().strip()]
            print(f'  branch_preview 按钮: {btns2[:8]}')
            # 通过分支
            approve2 = page.locator('button', has_text='通过').first
            if approve2.count() > 0 and approve2.is_visible():
                approve2.click()
                page.wait_for_timeout(500)
        else:
            print('  [skip] 通过按钮未找到')
            errors.append('structure 通过按钮未找到')
        t()

        # 进入 workshop
        next_btn = page.locator('button', has_text='下一步').first
        if next_btn.count() > 0 and next_btn.is_enabled():
            prev_url = page.url
            next_btn.click()
            try:
                page.wait_for_url(lambda u: u != prev_url, timeout=10000)
            except PWTimeout:
                pass
        if 'workshop' not in page.url:
            errors.append('structure->workshop 导航失败，强制跳转')
            page.goto(f'{BASE}/project/{project_id}/workshop')
        page.wait_for_timeout(1500)

        # ── 4. Workshop 首节点 ─────────────────────────────────────
        print('\n[4] Workshop 阶段')
        shot(page, 'workshop_loaded')
        node_btns = page.locator('div.w-72 button[class*="text-left"]').all()
        print(f'  侧栏节点按钮: {len(node_btns)}')

        t = tick('4_workshop_first_node_ai')
        if node_btns:
            node_btns[0].click()
            page.wait_for_timeout(500)
            ai_btn = page.locator('button', has_text='AI 设计此节点').first
            if ai_btn.count() > 0 and ai_btn.is_visible():
                ai_btn.click()
                wait_ai(page, 120000)
                shot(page, 'workshop_ai_draft')
                commit = page.locator('button', has_text='通过').first
                if commit.count() > 0 and commit.is_visible():
                    commit.click(); page.wait_for_timeout(300)
            else:
                print('  [skip] AI 设计此节点未找到')
        else:
            print('  [skip] 无节点可选')
            errors.append('workshop 无节点')
        t()

        # 进入 validate
        next_btn = page.locator('button', has_text='下一步').first
        if next_btn.count() > 0 and next_btn.is_visible() and next_btn.is_enabled():
            prev_url = page.url
            next_btn.click()
            try:
                page.wait_for_url(lambda u: u != prev_url, timeout=10000)
            except PWTimeout:
                pass
        if 'validate' not in page.url:
            page.goto(f'{BASE}/project/{project_id}/validate')
        page.wait_for_timeout(1500)

        # ── 5. Validate ────────────────────────────────────────────
        print('\n[5] Validate 阶段')
        wait_ai(page, 60000)
        page.wait_for_timeout(1000)
        shot(page, 'validate_loaded')

        t = tick('5_validate_run')
        btn = page.locator('button', has_text='运行校验').first
        if btn.count() > 0 and btn.is_visible():
            btn.click()
            page.wait_for_timeout(800)
            shot(page, 'validate_result')
        t()

        # ── 6. 读取数据分析 ────────────────────────────────────────
        print('\n[6] 读取项目数据')
        data = page.evaluate("""(id) => {
            const key = 'filmgame:project:' + id
            const raw = localStorage.getItem(key)
            if (!raw) return null
            const p = JSON.parse(raw)
            return {
                title: p.title,
                phase: p.currentPhase,
                nodeCount: (p.nodes||[]).length,
                charCount: (p.characters||[]).length,
                nodes: (p.nodes||[]).map(n => ({
                    title: n.title,
                    type: n.type,
                    durationSeconds: n.durationSeconds || 0,
                    dialogueLines: (n.dialogue||[]).length,
                    choices: (n.choices||[]).length,
                    sceneDescLen: (n.sceneDesc||'').length,
                    hasEmotion: n.emotionFunction?.tension > 0,
                })).sort((a,b) => b.durationSeconds - a.durationSeconds),
                validation: p.lastValidation ? {
                    passRate: p.lastValidation.passRate,
                    issues: p.lastValidation.issues?.length || 0,
                    errors: (p.lastValidation.issues||[]).filter(i=>i.level==='error').length,
                } : null
            }
        }""", project_id)

        browser.close()

        # ── 最终报告 ───────────────────────────────────────────────
        print('\n' + '='*60)
        print('阶段 AI 耗时汇总')
        print('='*60)
        total = 0
        ai_stages = [(k, v) for k, v in timings.items()]
        ai_stages.sort(key=lambda x: x[1], reverse=True)
        for k, v in ai_stages:
            bar = '#' * int(v / 5)
            print(f'  {k:<35} {v:>6.1f}s  {bar}')
            total += v
        print(f'  {"TOTAL":<35} {total:>6.1f}s')

        if errors:
            print(f'\n[警告] {len(errors)} 个步骤被跳过:')
            for e in errors:
                print(f'  - {e}')

        if data:
            print('\n' + '='*60)
            print(f'项目: {data["title"]}  [{data["phase"]}]')
            print(f'  节点: {data["nodeCount"]}个  角色: {data["charCount"]}个')
            if data['validation']:
                v = data['validation']
                print(f'  校验: 通过率{v["passRate"]}%  问题{v["issues"]}个  错误{v["errors"]}个')
            print('='*60)
            print('节点时长分布（默认 120s/节点，AI 填充后按对白行数估算）')
            nodes = data['nodes']
            if nodes:
                max_s = max(n['durationSeconds'] for n in nodes) or 1
                for n in nodes:
                    bar = '#' * int(n['durationSeconds'] / max_s * 20)
                    dialogue = f'{n["dialogueLines"]}行对白' if n['dialogueLines'] else '无对白'
                    scene = f'场景{n["sceneDescLen"]}字' if n['sceneDescLen'] else '无场景'
                    print(f'  [{n["type"]:8}] {n["title"][:25]:<25} {n["durationSeconds"]:>4}s  {bar}  {dialogue}  {scene}')
                durations = [n['durationSeconds'] for n in nodes]
                print(f'  --- 均值:{sum(durations)//len(durations)}s  最大:{max(durations)}s  最小:{min(durations)}s')

                # 分析调整空间
                print('\n调整建议:')
                no_content = [n for n in nodes if n['dialogueLines'] == 0 and n['sceneDescLen'] == 0]
                if no_content:
                    print(f'  - {len(no_content)}个节点无对白和场景描述（Workshop 未填充）')
                thin = [n for n in nodes if 0 < n['dialogueLines'] < 4]
                if thin:
                    print(f'  - {len(thin)}个节点对白少于4行，建议扩写')
                long_nodes = [n for n in nodes if n['durationSeconds'] > 180]
                if long_nodes:
                    print(f'  - {len(long_nodes)}个节点时长>180s，可考虑拆分为更小粒度')
        else:
            print('\n[警告] 未能读取项目数据')

        print(f'\n截图: {SHOTS}/')

if __name__ == '__main__':
    run()
