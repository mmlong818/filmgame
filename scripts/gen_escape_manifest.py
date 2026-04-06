"""
重新生成 escape_manifest 示例项目
三条真实路径 + 多个死路节点 + 不同结局
"""
import json, uuid
from datetime import datetime

NOW = "2026-01-15T08:00:00.000Z"
PROJ_ID = "escape_manifest"

# ── ID 常量 ───────────────────────────────────────────────────────────────────
CH0, CH1, CH2 = "ch_em0", "ch_em1", "ch_em2"
ACT0A, ACT0B   = "act_em0a", "act_em0b"
ACT1            = "act_em1"          # 三条路径全在这一个幕里
ACT2            = "act_em2"

# ── 章节 & 幕 ─────────────────────────────────────────────────────────────────
CHAPTERS = [
    {"id": CH0, "title": "第一章：危机序幕", "order": 0},
    {"id": CH1, "title": "第二章：三条出路", "order": 1},
    {"id": CH2, "title": "第三章：结局",     "order": 2},
]

ACTS = [
    {"id": ACT0A, "chapterId": CH0, "title": "倒计时开始",   "order": 0,
     "nodeIds": ["n_start", "n_list"],
     "dramaticFunction": "建立世界规则，埋下危机"},
    {"id": ACT0B, "chapterId": CH0, "title": "发现阴谋",     "order": 1,
     "nodeIds": ["n_discover", "n_radio", "n_branch_main"],
     "dramaticFunction": "揭露冲突核心，逼玩家做出第一个选择"},
    {"id": ACT1,  "chapterId": CH1, "title": "三线并行",     "order": 0,
     "nodeIds": [
         # Path A: 黑客路线
         "n_hack1", "n_hack_branch", "n_hack_fast", "n_hack_alarm",
         "n_hack_caught",  # DEAD END
         "n_hack_run",
         "n_hack_slow", "n_hack_clear",
         # Path B: 联盟路线
         "n_ally1", "n_ally_branch", "n_ally_storm", "n_ally_talk",
         "n_ally_reject",  # DEAD END
         # Path C: 交换路线
         "n_deal1", "n_deal_branch", "n_deal_secret",
         "n_deal_threat", "n_deal_caught",  # DEAD END
     ],
     "dramaticFunction": "三条平行路径展开，每条都有子选择和死路"},
    {"id": ACT2,  "chapterId": CH2, "title": "各奔前程",     "order": 0,
     "nodeIds": ["n_end_perfect", "n_end_wounded", "n_end_damaged", "n_end_cost"],
     "dramaticFunction": "四种结局，折射不同选择的道德代价"},
]

# ── 工具函数 ──────────────────────────────────────────────────────────────────
def choice(cid, text, target, nid):
    return {"id": cid, "nodeId": nid, "text": text, "order": 0,
            "targetNodeId": target, "conditions": "", "variableEffects": ""}

def dlg(speaker, text, emotion="", subtext=""):
    return {"id": uuid.uuid4().hex[:6], "speaker": speaker,
            "text": text, "emotion": emotion, "subtext": subtext}

def node(nid, act, title, ntype, order, choices, dialogue, desc="", location="", weight="midpoint"):
    return {
        "id": nid, "actId": act, "title": title, "type": ntype,
        "order": order, "position": {"x": 0, "y": 0},
        "emotionFunction": {"emotionIn": "", "emotionOut": "", "playerEmotion": "",
                            "tension": 5, "internal_lie": "", "fear": ""},
        "systemFunction": {"variablesRead": [], "variablesWrite": [], "requirements": ""},
        "sceneHeader": {"location": location or "诺亚号空间站", "timeOfDay": "DAY", "interior": "INT"},
        "sceneDesc": desc,
        "dialogue": dialogue,
        "choices": choices,
        "durationSeconds": 60,
        "notes": "",
        "dramaticWeight": weight,
        "exploreReturnNodeId": None,
    }

# ── 节点定义 ──────────────────────────────────────────────────────────────────
NODES = [

    # ── 序幕 ─────────────────────────────────────────────────────────────────
    node("n_start", ACT0A, "警报：14小时后撞击", "start", 0,
         [choice("c_s1", "前往任务简报室", "n_list", "n_start")],
         [dlg("广播", "全体人员注意——行星碎片轨道偏移，诺亚号将在14小时内遭遇撞击。", "平静机械，底层压着末日"),
          dlg("你（内心）", "十四小时。这不是演习。", "震惊"),
          dlg("广播", "逃生协议已启动。请持证人员前往逃生舱区域登记。", "冷漠的例行公事")],
         desc="站内警报在午休时间响起。人群还没意识到这不是测试。",
         location="诺亚号 - 公共走廊",
         weight="setup"),

    node("n_list", ACT0A, "逃生名单：800人的站，500个位置", "normal", 1,
         [choice("c_l1", "查找自己的名字", "n_discover", "n_list")],
         [dlg("管理员", "本次撤离名单已上传至各终端。请核对你的编号。"),
          dlg("你", "……编号 AT-7743。", "手指开始发抖"),
          dlg("管理员", "下一位。", "已经看向别处"),
          dlg("你（内心）", "不在。我的名字不在名单上。", "世界开始旋转")],
         desc="任务简报室临时充当登记处。队伍排到了走廊外头。",
         location="诺亚号 - 任务简报室"),

    node("n_discover", ACT0B, "你的名字被抹掉了", "normal", 0,
         [choice("c_d1", "偷听附近的通讯频道", "n_radio", "n_discover"),
          choice("c_d2", "跳过，直接想办法", "n_branch_main", "n_discover")],
         [dlg("终端屏幕", "编号 AT-7743：不在本次撤离名单内。", "冰冷的系统字体"),
          dlg("你（内心）", "三年前我就在这份名单上。有人把我删了。", "恐惧变成了愤怒"),
          dlg("路过的同事", "哎，你没上名单？那就没办法了。规则就是规则。", "漠然，自保优先"),
          dlg("你", "……是谁改的。", "咬紧牙关")],
         desc="名单是固定的。管理员不接受申诉。十四小时在倒计时。",
         weight="setup"),

    node("n_radio", ACT0B, "偷听：有人在幕后操纵名单", "explore", 1,
         [choice("c_r1", "记下这些信息，去找出路", "n_branch_main", "n_radio")],
         [dlg("加密频道（静音模式）", "……名单调整已完成，AT-7743已清除……", "你几乎听不清"),
          dlg("另一个声音", "他知道的太多了。让他留下。", "冷静，不像是在谈论人命"),
          dlg("你（内心）", "我是被故意删掉的。这不是错误。", "寒意")],
         desc="角落里一台坏掉的通讯器仍在接收信号。",
         location="诺亚号 - 设备间",
         weight="setup"),

    node("n_branch_main", ACT0B, "十四小时，三条路", "branch", 2,
         [choice("c_bm1", "【黑客】入侵系统，把自己加进名单", "n_hack1", "n_branch_main"),
          choice("c_bm2", "【联盟】找其他被除名的人，一起强行上船", "n_ally1", "n_branch_main"),
          choice("c_bm3", "【交换】找名单上认识你的人，用信息换名额", "n_deal1", "n_branch_main")],
         [dlg("你（内心）", "没有时间悲伤。只有三条路。", "冷静下来"),
          dlg("你", "好。那就——", "深吸一口气")],
         desc="逃生舱区在三层楼下，已经开始加锁。你有十四小时。",
         weight="crisis"),

    # ── PATH A: 黑客路线 ──────────────────────────────────────────────────────
    node("n_hack1", ACT1, "入侵核心终端", "normal", 0,
         [choice("c_h1", "分析系统结构", "n_hack_branch", "n_hack1")],
         [dlg("你", "逃生名单数据库，应该在运维节点里……", "快速打字"),
          dlg("系统", "用户 AT-7743，你的权限等级不支持此操作。", "冷漠的系统声"),
          dlg("你（内心）", "权限不够。但这个终端有个旧漏洞——我三年前发现过它。", "集中精神")],
         desc="深夜的服务器机房里，你找到了一台仍在运行的维护终端。",
         location="诺亚号 - 服务器机房",
         weight="midpoint"),

    node("n_hack_branch", ACT1, "发现两个入侵切入点", "branch", 1,
         [choice("c_hb1", "【直接入侵】直接篡改名单数据库（快，但会触发校验警报）", "n_hack_fast", "n_hack_branch"),
          choice("c_hb2", "【迂回入侵】通过维护账号绕道进入（慢而安全）", "n_hack_slow", "n_hack_branch")],
         [dlg("你（内心）", "两个漏洞。一个快——直接改数据库。一个安全——走维护账号的后门。", "分析局势"),
          dlg("你（内心）", "快的方法会触发日志校验。慢的方法需要找到旧维护账号。", "")],
         desc="系统架构图出现在屏幕上。时间还有十二小时。",
         weight="crisis"),

    node("n_hack_fast", ACT1, "直接篡改名单——警报触发", "normal", 2,
         [choice("c_hf1", "分析应对方案", "n_hack_alarm", "n_hack_fast")],
         [dlg("系统", "数据完整性校验失败。入侵警报已发送至安保中心。", "急促的警报音"),
          dlg("你（内心）", "成了——但也炸了。名字加进去了，但保安知道有人在改数据。", "一半成功，一半慌张"),
          dlg("通讯频道", "服务器机房，有未授权访问，安保就位。", "")],
         desc="你的名字出现在名单上了。代价是整栋楼的保安收到了警报。",
         weight="crisis"),

    node("n_hack_alarm", ACT1, "保安锁定你的位置", "branch", 3,
         [choice("c_ha1", "放弃终端，立刻冲向逃生舱", "n_hack_run", "n_hack_alarm"),
          choice("c_ha2", "试图在被抓前清除入侵记录", "n_hack_caught", "n_hack_alarm")],
         [dlg("保安频道", "机房方向有人，包抄。", ""),
          dlg("你（内心）", "留下来清除记录？还是现在就跑？", "极度紧张"),
          dlg("你（内心）", "清除记录需要三分钟。他们一分钟就到。", "")],
         desc="保安的脚步声从走廊传来。你只有几秒钟做决定。",
         weight="crisis"),

    node("n_hack_caught", ACT1, "被逮捕：入侵记录彻底清除了，你也彻底完了", "normal", 4,
         [],  # ← DEAD END：没有选项
         [dlg("保安", "趴下！双手放头上！", ""),
          dlg("你", "等等——我只是在——", ""),
          dlg("保安", "现在站里有十二小时撞击预警，零容忍政策。带走。", ""),
          dlg("你（内心）", "我以为三分钟够用。差了四十秒。", "绝望")],
         desc="记录清除了，但你没有跑掉。逃生舱区的门对你永远关上了。",
         weight="crisis"),

    node("n_hack_run", ACT1, "仓皇出逃，带伤上船", "normal", 4,
         [choice("c_hr1", "登上逃生舱", "n_end_wounded", "n_hack_run")],
         [dlg("你（内心）", "跑。不要停。", "拼命奔跑"),
          dlg("保安", "停下！", ""),
          dlg("你", "啊！", "肩膀中了一下，但腿还在动"),
          dlg("逃生舱广播", "最后批次，T-5分钟关闭舱门。", ""),
          dlg("你（内心）", "上去了。带着子弹擦过的痕迹，上去了。", "")],
         desc="你冲进最后一批逃生舱，舱门在保安到达前半秒钟关闭。",
         weight="climax"),

    node("n_hack_slow", ACT1, "通过维护账号悄然进入", "normal", 2,
         [choice("c_hs1", "找到旧账号凭证", "n_hack_clear", "n_hack_slow")],
         [dlg("你（内心）", "维护账号……三年前系统升级，旧账号没有完全注销。", "集中"),
          dlg("系统", "欢迎，维护工程师 M-0017。", "平静，一切正常"),
          dlg("你（内心）", "进去了。现在慢慢改，不触发任何校验。", "")],
         desc="没有警报。系统认为你只是一个做夜间维护的工程师。",
         weight="midpoint"),

    node("n_hack_clear", ACT1, "完美修改，无痕上船", "normal", 3,
         [choice("c_hc1", "前往逃生舱", "n_end_perfect", "n_hack_clear")],
         [dlg("系统", "用户 AT-7743 已添加至撤离名单，分配 C区-4号舱位。", ""),
          dlg("你（内心）", "没有警报。没有记录。就像从来都在名单上一样。", "如释重负"),
          dlg("广播", "C区乘客请准备登舱。", "")],
         desc="你关掉终端，整理好工服，像一个普通乘客一样走向逃生区。",
         weight="climax"),

    # ── PATH B: 联盟路线 ──────────────────────────────────────────────────────
    node("n_ally1", ACT1, "联合其他被除名的人", "normal", 0,
         [choice("c_a1", "召集会议，讨论计划", "n_ally_branch", "n_ally1")],
         [dlg("你", "你们也不在名单上？", ""),
          dlg("郑工", "我和另外两个人。他们已经在准备了。", "愤怒但克制"),
          dlg("林医生", "四个人。一艘逃生舱需要两个人操作。我们有机会。", "冷静分析"),
          dlg("你（内心）", "四个人。在十二小时内，能做什么？", "")],
         desc="会议室里，四个名字同样被抹掉的人第一次见面。",
         location="诺亚号 - 废弃会议室",
         weight="midpoint"),

    node("n_ally_branch", ACT1, "计划出现分歧", "branch", 1,
         [choice("c_ab1", "【强攻】武装冲入驾驶舱，强行征用一艘飞船", "n_ally_storm", "n_ally_branch"),
          choice("c_ab2", "【谈判】向站长正式陈情，以证据要求合法上船", "n_ally_talk", "n_ally_branch")],
         [dlg("郑工", "谈判没用。他们不会让步的。我们直接抢一艘！", ""),
          dlg("林医生", "暴力只会让我们成为罪犯，失去道德制高点。", ""),
          dlg("你", "……两种方法，都有代价。", "")],
         desc="四个人在地图上争执。时间还有十小时。",
         weight="crisis"),

    node("n_ally_storm", ACT1, "武装劫持驾驶舱", "normal", 2,
         [choice("c_as1", "强行驾驶逃离", "n_end_damaged", "n_ally_storm")],
         [dlg("你", "所有人趴下！这艘船现在由我们控制！", ""),
          dlg("站长", "你们这是在犯罪！", ""),
          dlg("郑工", "启动引擎！现在！", ""),
          dlg("系统警报", "未授权启动，飞行系统已触发安全锁定……锁定解除。", "电气故障导致锁定失败"),
          dlg("你（内心）", "出去了。带着四个逃亡者，一艘受损的飞船，和一份通缉令。", "")],
         desc="驾驶舱里，四个人和全体保安对峙了三小时。最后飞船起飞了，留下了弹孔。",
         weight="climax"),

    node("n_ally_talk", ACT1, "向站长提交证据", "normal", 2,
         [choice("c_at1", "等待站长的答复", "n_ally_reject", "n_ally_talk")],
         [dlg("你", "站长，我们有证据证明名单被人为篡改。请给我们合法上船的机会。", ""),
          dlg("站长", "……我需要时间核实。先去等候室等着。", "眼神闪烁"),
          dlg("林医生（悄悄）", "他不打算帮我们。这是在拖时间。", ""),
          dlg("你（内心）", "我们应该早点意识到，谈判的前提是对方愿意谈。", "")],
         desc="站长的办公室。挂着站徽的墙背后，是已经发动引擎的飞船。",
         weight="crisis"),

    node("n_ally_reject", ACT1, "陷阱：保安包围等候室", "normal", 3,
         [],  # ← DEAD END
         [dlg("广播", "等候室的人员，请配合安保检查。", ""),
          dlg("郑工", "不好——他们来了！", ""),
          dlg("保安", "所有人不许动。你们涉嫌煽动骚乱，暂时拘留。", ""),
          dlg("你（内心）", "我们把所有的筹码都摆在桌上，然后他们掀翻了桌子。", ""),
          dlg("广播（遥远）", "最后批次逃生舱，十分钟后关闭。", "你们听得到，但去不了")],
         desc="等候室的门从外面锁死了。远处，逃生舱区的指示灯一盏一盏熄灭。",
         weight="crisis"),

    # ── PATH C: 交换路线 ──────────────────────────────────────────────────────
    node("n_deal1", ACT1, "接触名单上的陈博士", "normal", 0,
         [choice("c_d1", "直接摊牌，表明来意", "n_deal_branch", "n_deal1")],
         [dlg("你", "陈博士，我知道这很唐突——我不在撤离名单上。", ""),
          dlg("陈博士", "……我听说了。很遗憾。", "眼神没有落在你身上"),
          dlg("你", "你是唯一认识我的人。我以为——", ""),
          dlg("陈博士", "你以为什么？", "终于看向你，眼神复杂")],
         desc="陈博士正在整理行李。他的名字在名单第十七位。你的不在任何地方。",
         location="诺亚号 - 研究员宿舍",
         weight="midpoint"),

    node("n_deal_branch", ACT1, "陈博士提出了条件", "branch", 1,
         [choice("c_db1", "【坦诚】告诉他你知道的机密，换取他的帮助", "n_deal_secret", "n_deal_branch"),
          choice("c_db2", "【要挟】拿出你偷录的对话，逼他就范", "n_deal_threat", "n_deal_branch")],
         [dlg("陈博士", "你三年前发现了一些不该发现的东西，对吗？", ""),
          dlg("你（内心）", "他知道我知道什么。这是威胁，还是机会？", ""),
          dlg("陈博士", "如果你愿意……把那些记录交给我，我可以把你加进我的随行名单。", "")],
         desc="他知道你知道什么。这场谈判从一开始就不平等。",
         weight="crisis"),

    node("n_deal_secret", ACT1, "交出机密，换得名额", "normal", 2,
         [choice("c_ds1", "登上逃生舱", "n_end_cost", "n_deal_secret")],
         [dlg("你", "……好。", "长时间的沉默后"),
          dlg("你", "五年前，站内的生命数据库被人悄悄修改过。我有备份。", ""),
          dlg("陈博士", "（沉默片刻）好。我兑现承诺。随行名单，已加上你。", ""),
          dlg("你（内心）", "我把那份东西交出去了。它现在在他手里。我不知道他会用它做什么。", "空洞")],
         desc="你把那个加密文件传给了他。五年来压在心底的东西，就这样换了一张船票。",
         weight="climax"),

    node("n_deal_threat", ACT1, "拿出录音——他比你更有准备", "normal", 2,
         [choice("c_dt1", "看看能不能谈", "n_deal_caught", "n_deal_threat")],
         [dlg("你", "陈博士，我录下了刚才的对话。你最好重新考虑——", ""),
          dlg("陈博士", "（打断）我知道你会这样做。", "平静，早有预料"),
          dlg("陈博士", "所以我在你进门前五分钟就通知了安保。", ""),
          dlg("你（内心）", "他比我更早开始布局。", "")],
         desc="他的手边有个你没注意到的小设备。一直亮着的红灯。",
         weight="crisis"),

    node("n_deal_caught", ACT1, "被举报：安保带走你，陈博士登船", "normal", 3,
         [],  # ← DEAD END
         [dlg("保安", "AT-7743，涉嫌威胁政府官员，跟我们走。", ""),
          dlg("你", "等等——他才是——", ""),
          dlg("陈博士（走向门口）", "抱歉。我没有别的选择。", "背对着你"),
          dlg("你（内心）", "要挟需要筹码。我的筹码不够重。", "空洞")],
         desc="窗外，逃生舱一艘接一艘离开。陈博士的身影消失在走廊拐角。",
         weight="crisis"),

    # ── 结局 ──────────────────────────────────────────────────────────────────
    node("n_end_perfect", ACT2, "完美逃脱", "ending", 0, [],
         [dlg("广播", "C区所有乘客，请系好安全带。", ""),
          dlg("你（内心）", "名单上有我的名字。一直都有。", "平静的谎言"),
          dlg("你（内心）", "没有人知道那个维护账号的事。也许永远不会有人知道。", "")],
         desc="你坐在C区4号舱，像一个普通乘客。没有人看你一眼。",
         weight="resolution"),

    node("n_end_wounded", ACT2, "带伤逃脱", "ending", 1, [],
         [dlg("医疗AI", "检测到贯穿伤，建议立即处理。", ""),
          dlg("你", "……等一会儿。", "看着舷窗"),
          dlg("你（内心）", "出来了。但有记录。有摄像头。有人知道我做了什么。", ""),
          dlg("你（内心）", "以后的事，以后再说。", "")],
         desc="逃生舱的医疗箱里，你用颤抖的手给自己包扎伤口。",
         weight="resolution"),

    node("n_end_damaged", ACT2, "逃脱，但留下了罪名", "ending", 2, [],
         [dlg("郑工", "跑掉了。真的跑掉了。", "不敢置信"),
          dlg("林医生", "飞船受损，导航系统只剩60%。我们需要找地方停靠。", ""),
          dlg("你（内心）", "四个人。一艘打了洞的船，还有一份通缉令。", ""),
          dlg("你（内心）", "但我们在一起。", "")],
         desc="驾驶舱里，四个人看着诺亚号在视野里越来越小。",
         weight="resolution"),

    node("n_end_cost", ACT2, "用秘密换了一条命", "ending", 3, [],
         [dlg("你（内心）", "那份文件，我保存了五年。今天换了一张船票。", ""),
          dlg("你（内心）", "陈博士会用它做什么？揭露丑闻？还是继续掩盖？", ""),
          dlg("你（内心）", "我不知道。我可能永远不会知道。", ""),
          dlg("你（内心）", "但我在这里。活着。", "空洞中带着一点自我宽慰")],
         desc="逃生舱里，你是唯一沉默的人。别人在哭，在笑，在打电话。",
         weight="resolution"),
]

# ── 结局记录 ──────────────────────────────────────────────────────────────────
ENDINGS = [
    {"id": "end_perfect",  "nodeId": "n_end_perfect",  "title": "无痕者",
     "type": "good",    "conditions": "走了安全的黑客路线",
     "description": "你的名字在名单上，永远都在。没有人知道那个深夜的服务器机房。你只是一个在对的地方的普通人。"},
    {"id": "end_wounded",  "nodeId": "n_end_wounded",  "title": "有代价的逃脱",
     "type": "neutral", "conditions": "走了危险的黑客路线并逃跑",
     "description": "你活下来了，但安保系统里有你的脸。下一站港口，会有人等着你。"},
    {"id": "end_damaged",  "nodeId": "n_end_damaged",  "title": "亡命四人组",
     "type": "neutral", "conditions": "武装劫持飞船成功",
     "description": "四个人，一艘打了洞的船，和一份星系通缉令。你们的故事，才刚刚开始。"},
    {"id": "end_cost",     "nodeId": "n_end_cost",     "title": "等价交换",
     "type": "bittersweet", "conditions": "用机密换了名额",
     "description": "你活下来了，代价是那份藏了五年的秘密。它现在在别人手里，你不知道它会通向哪里。"},
]

# ── 变量 ──────────────────────────────────────────────────────────────────────
VARIABLES = [
    {"id": "v1", "name": "path_taken",    "type": "flag",    "defaultValue": "none",
     "description": "玩家走的主路线：hack/ally/deal"},
    {"id": "v2", "name": "hack_method",   "type": "flag",    "defaultValue": "none",
     "description": "黑客路线子选择：fast/slow"},
    {"id": "v3", "name": "secret_shared", "type": "boolean", "defaultValue": "false",
     "description": "是否交出了机密文件"},
]

# ── 角色 ──────────────────────────────────────────────────────────────────────
CHARACTERS = [
    {"id": "c1", "name": "你（AT-7743）", "role": "protagonist",
     "motivation": "活下去，找出是谁删掉了自己的名字",
     "relationship": "—", "wound": "曾经相信规则会保护自己",
     "lie": "只要不惹事就能平安", "want": "一个逃生舱位", "need": "主动掌控自己的命运"},
    {"id": "c2", "name": "陈博士", "role": "antagonist",
     "motivation": "保护某个不可告人的秘密",
     "relationship": "认识你三年，用你换过一次好处",
     "wound": "做过一件无法挽回的错误决定",
     "lie": "保持沉默是最安全的", "want": "安全撤离", "need": "面对自己的过去"},
    {"id": "c3", "name": "郑工", "role": "ally",
     "motivation": "不相信任何规则，只相信行动",
     "relationship": "被除名的同伴，天然盟友",
     "wound": "曾经信任过系统，被辜负",
     "lie": "力量才是唯一的语言", "want": "逃出去", "need": "学会信任"},
    {"id": "c4", "name": "林医生", "role": "ally",
     "motivation": "用最小代价换取最大生存率",
     "relationship": "被除名的同伴，冷静的声音",
     "wound": "见过太多本可避免的死亡",
     "lie": "理性永远胜过情绪", "want": "活着，且清白", "need": "接受世界不总是公平的"},
]

# ── 组装 ──────────────────────────────────────────────────────────────────────
PROJECT = {
    "id": PROJ_ID,
    "title": "逃逸名单",
    "createdAt": NOW,
    "updatedAt": NOW,
    "currentPhase": "workshop",
    "phaseProgress": {"world": "complete", "scale": "complete", "structure": "complete",
                      "workshop": "complete", "validate": "pending"},
    "worldAnchor": {
        "storyCore": "一个不在逃生名单上的人，在末日倒计时中用不同方式夺回生存权",
        "theme": "在规则崩溃的边缘，人的选择暴露了真正的自我",
        "genre": "科幻悬疑·道德抉择",
        "worldRules": "名单是法律。逃生舱是有限的。时间是倒计时的。你的方法决定了你是谁。",
        "durationMinutes": 45,
        "endingCount": 4,
    },
    "characters": CHARACTERS,
    "selectedScalePlanId": "plan_compact",
    "scalePlanOptions": [],
    "chapters": CHAPTERS,
    "acts": ACTS,
    "nodes": NODES,
    "variables": VARIABLES,
    "endings": ENDINGS,
    "lastValidation": None,
    "schemaVersion": 1,
}

# ── 写入文件 ──────────────────────────────────────────────────────────────────
OUT_PATHS = [
    "E:/CC/code/filmgame/data/projects/escape_manifest.json",
    "E:/CC/code/filmgame/public/seed-data.json",
]

for path in OUT_PATHS:
    with open(path, "w", encoding="utf-8") as f:
        json.dump(PROJECT, f, ensure_ascii=False, indent=2)
    print(f"Written: {path}")

# ── 统计 ──────────────────────────────────────────────────────────────────────
types = {}
for n in NODES:
    t = n["type"]
    types[t] = types.get(t, 0) + 1

dead_ends = [n for n in NODES if n["type"] not in ("ending",) and len(n["choices"]) == 0]
print(f"\n节点总数: {len(NODES)}")
print(f"类型分布: {types}")
print(f"死路节点({len(dead_ends)}): {[n['id'] for n in dead_ends]}")
print(f"结局数: {len(ENDINGS)}")
print(f"幕数: {len(ACTS)}")
