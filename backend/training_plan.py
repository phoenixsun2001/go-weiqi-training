"""
专项强化计划生成器
基于 JadenSai 93局 AI 复盘的弱点数据，生成个性化4周训练计划
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from ai_review import review_game
from sgf_parser import parse_metadata
from collections import Counter


def get_weakness_summary(games: list[dict]) -> dict:
    """
    聚合多局 AI 复盘结果，返回弱点排行
    games: [{sgf: str, ...}, ...]
    """
    issue_counts = Counter()
    phase_scores = {"布局": [], "序盘": [], "中盘": [], "官子": []}
    total = 0

    for g in games:
        sgf = g.get("sgf", "")
        if not sgf or len(sgf) < 20:
            continue
        try:
            r = review_game(sgf)
            total += 1
            for p in r.get("phases", []):
                phase = p.get("phase", "")
                if phase in phase_scores:
                    phase_scores[phase].append(p.get("score", 3))
                for issue in p.get("issues", []):
                    issue_counts[issue] += 1
        except:
            continue

    # 各阶段平均评分
    avg_scores = {}
    for phase, scores in phase_scores.items():
        avg_scores[phase] = round(sum(scores) / len(scores), 1) if scores else 0

    # 弱点排行（按频率降序）
    weaknesses = [
        {"issue": issue, "count": count, "percentage": round(count / max(total, 1) * 100)}
        for issue, count in issue_counts.most_common(10)
    ]

    return {
        "total_games": total,
        "phase_scores": avg_scores,
        "weaknesses": weaknesses,
    }


# 计划模板：基于JadenSai的实际弱点数据
# 布局2.0分（最弱）、序盘1.9分（最弱）、中盘2.6分、官子3.0分
PLAN_TEMPLATE = [
    # ===== 第1周：布局革命 =====
    {"week": 1, "day": 1, "category": "布局", "title": "学习星位开局",
     "description": "在定式模块学习'星位·点三三'和'星位·一间跳应'，理解星位开局的原理。要求：能说出星位开局 vs 二线开局的效率差异。",
     "target_module": "joseki", "difficulty": 2},
    {"week": 1, "day": 2, "category": "布局", "title": "学习小目定式",
     "description": "在定式模块学习'小目·托退'和'小目·一间跳'，理解角部争夺的基本模式。",
     "target_module": "joseki", "difficulty": 2},
    {"week": 1, "day": 3, "category": "布局", "title": "复盘2局：对比你的开局vs AI建议",
     "description": "从对局库选2局负局，用AI复盘重点看前15手。记录你的第一手位置，与标准星位/小目对比。",
     "target_module": "review", "difficulty": 2},
    {"week": 1, "day": 4, "category": "布局", "title": "死活题练习（简单）×10",
     "description": "在题库做10道easy级别死活题，保持基础计算手感。注意角部死活的基本形状。",
     "target_module": "problem", "difficulty": 2},
    {"week": 1, "day": 5, "category": "布局", "title": "学习布局原则：占角→拆边→中腹",
     "description": "复习棋理解读：为什么'金角银边草肚皮'。理解前4手占满4角的重要性。写出你的理解。",
     "target_module": "joseki", "difficulty": 1},
    {"week": 1, "day": 6, "category": "布局", "title": "复盘2局：检查过早接触战",
     "description": "选2局前12手就有贴身接触的对局，用AI复盘看接触战是否过早。思考：如果不接触，应该下在哪里？",
     "target_module": "review", "difficulty": 3},
    {"week": 1, "day": 7, "category": "布局", "title": "实战：下一局，第一手必须星位",
     "description": "在野狐下一局正式对局，强制要求：第一手下星位(Q16/D4)，前15手不贴身。下完后导入复盘。",
     "target_module": "practice", "difficulty": 3},

    # ===== 第2周：序盘过渡 =====
    {"week": 2, "day": 1, "category": "序盘", "title": "学习中国流布局",
     "description": "在定式模块学习'中国流布局'，理解全局配合和拆边原理。理解为什么三个棋子要互相呼应。",
     "target_module": "joseki", "difficulty": 3},
    {"week": 2, "day": 2, "category": "序盘", "title": "学习守角方法",
     "description": "学习'星位大飞守角'和'小目一间跳守角'，理解守角的价值（角部效率最高）。",
     "target_module": "joseki", "difficulty": 1},
    {"week": 2, "day": 3, "category": "序盘", "title": "复盘2局：检查序盘急于战斗",
     "description": "选2局序盘阶段有贴身战斗的对局，用AI复盘。思考：布局刚结束时应该拆边还是战斗？",
     "target_module": "review", "difficulty": 3},
    {"week": 2, "day": 4, "category": "序盘", "title": "死活题练习（中等）×10",
     "description": "在题库做10道intermediate级别死活题。开始接触稍复杂的角部死活。",
     "target_module": "problem", "difficulty": 4},
    {"week": 2, "day": 5, "category": "序盘", "title": "学习拆边距离",
     "description": "复习棋理解读中'拆边的距离'部分。理解一间拆、二间拆、大飞的适用场景。",
     "target_module": "joseki", "difficulty": 2},
    {"week": 2, "day": 6, "category": "序盘", "title": "复盘2局：序盘浮棋检查",
     "description": "选2局有中腹浮棋的对局，用AI复盘。思考：你的中腹棋子有没有根据？应该先建立外围还是直接打入？",
     "target_module": "review", "difficulty": 3},
    {"week": 2, "day": 7, "category": "序盘", "title": "实战：下一局，前20手只占角+拆边",
     "description": "在野狐下一局正式对局，强制要求：前20手只在角部和边部落子，不贴身战斗。导入复盘。",
     "target_module": "practice", "difficulty": 3},

    # ===== 第3周：中盘减少浮棋 =====
    {"week": 3, "day": 1, "category": "中盘", "title": "死活题练习（困难）×10",
     "description": "在题库做10道hard级别死活题。挑战复杂死活，提升计算力。",
     "target_module": "problem", "difficulty": 6},
    {"week": 3, "day": 2, "category": "中盘", "title": "学习打入与侵消",
     "description": "复习棋理解读中'攻击的时机'部分。理解什么时候该打入，什么时候该消。打入需要有算路支撑。",
     "target_module": "joseki", "difficulty": 3},
    {"week": 3, "day": 3, "category": "中盘", "title": "复盘2局：中盘浮棋分析",
     "description": "选2局中盘有大量中腹棋子的对局，用AI复盘。找出哪些中腹棋子是浮棋（无根据），思考正确的处理方式。",
     "target_module": "review", "difficulty": 3},
    {"week": 3, "day": 4, "category": "中盘", "title": "死活题练习（中等）×10",
     "description": "继续做intermediate死活题10道。死活是中盘战斗的基础。",
     "target_module": "problem", "difficulty": 4},
    {"week": 3, "day": 5, "category": "中盘", "title": "学习弃子取势",
     "description": "复习棋理解读中'弃子取势'部分。理解有时放弃局部棋子可以获得外势，这比硬救孤棋更好。",
     "target_module": "joseki", "difficulty": 3},
    {"week": 3, "day": 6, "category": "中盘", "title": "复盘2局：孤棋治理",
     "description": "选2局有孤棋被攻击的对局。思考：被攻击时应该怎么做眼/联络/弃子？不要硬跑孤棋。",
     "target_module": "review", "difficulty": 3},
    {"week": 3, "day": 7, "category": "中盘", "title": "实战：下一局，减少中腹浮棋",
     "description": "在野狐下一局正式对局。注意：中腹棋子必须有明确目的（攻击/围空），不下无目的的浮棋。导入复盘。",
     "target_module": "practice", "difficulty": 3},

    # ===== 第4周：综合提升 =====
    {"week": 4, "day": 1, "category": "综合", "title": "死活题综合练习 ×15",
     "description": "在题库做15道混合难度死活题。检验前三周的计算力提升。",
     "target_module": "problem", "difficulty": 3},
    {"week": 4, "day": 2, "category": "综合", "title": "复盘3局负局",
     "description": "选3局最近的负局，用AI复盘。重点看：布局是否改善了？序盘是否更从容了？中盘浮棋是否减少了？",
     "target_module": "review", "difficulty": 3},
    {"week": 4, "day": 3, "category": "综合", "title": "学习全部定式（复习）",
     "description": "在定式模块浏览全部14个定式，重点复习棋理解读。确认自己理解了每个定式'为什么这么下'。",
     "target_module": "joseki", "difficulty": 3},
    {"week": 4, "day": 4, "category": "综合", "title": "复盘3局胜局",
     "description": "选3局胜局复盘，分析你赢在哪里。是布局好了？还是对手失误？学习自己的成功经验。",
     "target_module": "review", "difficulty": 3},
    {"week": 4, "day": 5, "category": "综合", "title": "死活题挑战 ×10",
     "description": "在题库做10道难度最高的死活题。挑战自己的极限。",
     "target_module": "problem", "difficulty": 6},
    {"week": 4, "day": 6, "category": "综合", "title": "实战：下一局，综合检验",
     "description": "在野狐下一局正式对局。运用前三周学到的：星位开局、从容序盘、减少浮棋。导入复盘对比进步。",
     "target_module": "practice", "difficulty": 3},
    {"week": 4, "day": 7, "category": "综合", "title": "总结：对比93局分析报告",
     "description": "重新阅读'JadenSai深度分析报告'，对比训练前后的变化。制定下一阶段的训练目标。",
     "target_module": "practice", "difficulty": 1},
]


def generate_plan() -> list[dict]:
    """返回计划模板（28个任务）"""
    tasks = []
    for i, t in enumerate(PLAN_TEMPLATE):
        tasks.append({**t, "sort_order": i + 1})
    return tasks


# ======================================================================
# 自适应计划生成器：基于近期对局的弱点数据，动态排序每周训练主题
# ======================================================================

import datetime

PHASE_ORDER_STABLE = ["布局", "序盘", "中盘", "官子"]

# 各阶段的专属训练内容（joseki 名称需与 joseki_data 精确对应以便前端自动关联）
PHASE_PROGRAMS = {
    "布局": {
        "theme": "布局革命",
        "goal": "开局占角、不贴身、向中腹发展前先筑根据地",
        "joseki": [("星位·点三三（黑挡退）", "理解主流角部争夺与外势方向"),
                   ("星位·大飞守角", "守角的效率：一手棋拿到约8目")],
        "concept_d5": "连片的思维",
        "review_a": "对比你的开局vs标准占角",
        "review_b": "检查过早接触战",
        "practice_goal": "第一手下星位，前15手只占角和拆边，不贴身",
    },
    "序盘": {
        "theme": "序盘过渡",
        "goal": "占角后从容拆边过渡，不打无准备之仗",
        "joseki": [("中国流布局（高）", "三个棋子的全局呼应与立体阵地"),
                   ("拆边专题·一间拆/二间拆/大飞", "该拆多远：安定拆小，围空拆大")],
        "concept_d5": "拆边的距离",
        "review_a": "检查序盘急于战斗",
        "review_b": "序盘中腹浮棋检查",
        "practice_goal": "前20手只在角部和边部落子，不主动贴身战斗",
    },
    "中盘": {
        "theme": "中盘减浮棋",
        "goal": "打入有算路支撑，孤棋及时治理，不做无用浮棋",
        "joseki": [("打入与侵消·基本型", "打入与侵消的时机判断"),
                   ("三三·肩冲", "以高制低：压低对方棋子的效率")],
        "concept_d5": "攻击的时机",
        "review_a": "中盘浮棋分析",
        "review_b": "孤棋治理",
        "practice_goal": "中腹每手棋必须有明确目的（攻击/围空），不下浮棋",
    },
    "官子": {
        "theme": "官子收官",
        "goal": "压缩对方、扩大自己，不再漏收大官子",
        "joseki": [("小目守角（一间跳守角）", "从守角看地的价值估算"),
                   ("三三·大飞守角", "确定地的目数感觉")],
        "concept_d5": "爬的代价",
        "review_a": "复盘找漏掉的官子",
        "review_b": "收官顺序分析",
        "practice_goal": "进入官子先数清双方地域，按大小顺序收束",
    },
}

COMPREHENSIVE_PROGRAM = {
    "theme": "综合提升",
    "goal": "四阶段回顾检验：布局、序盘、中盘、官子全流程校准",
}

PROBLEM_PLAN = [
    # (题量, 最大难度) 每周递增
    (10, 2), (10, 4), (10, 6), (15, 6),
]


def _game_date_str(g: dict) -> str:
    """归一化对局日期：优先 played_date；否则从 imported_at(epoch:) 解析"""
    pd = g.get("played_date") or ""
    if len(pd) == 10:
        return pd
    imp = g.get("imported_at") or ""
    try:
        return datetime.datetime.fromtimestamp(int(imp.split(":", 1)[1])).strftime("%Y-%m-%d")
    except Exception:
        return ""


def get_recent_weakness(store, window_days: int = 14) -> dict:
    """聚合近期窗口的对局弱点（读 ai_review 存档快路径），返回摘要+样本信息"""
    from collections import Counter
    import datetime as _dt

    all_rows = store.list_ai_reviews_with_games()  # 已按日期降序
    cutoff = (_dt.date.today() - _dt.timedelta(days=window_days)).strftime("%Y-%m-%d")

    def _row_date(r):
        d = r.get("played_date") or ""
        if len(d) != 10:
            imp = r.get("imported_at") or ""
            try:
                d = _dt.datetime.fromtimestamp(int(imp.split(":", 1)[1])).strftime("%Y-%m-%d")
            except Exception:
                d = ""
        return d

    recent = [r for r in all_rows if _row_date(r) >= cutoff]
    # 近期太短则回退为最近20局
    if len(recent) < 5:
        recent = all_rows[:20]

    issue_counts: Counter = Counter()
    phase_scores = {}
    for r in recent:
        for iss in r.get("issues") or []:
            issue_counts[iss] += 1
        for ph, sc in (r.get("phase_scores") or {}).items():
            phase_scores.setdefault(ph, []).append(sc)

    avg = {ph: round(sum(v) / len(v), 1) if v else 0 for ph, v in phase_scores.items()}
    return {
        "window_days": window_days,
        "games_analyzed": len(recent),
        "date_cutoff": recent[-1]["played_date"] if recent else "",
        "issue_counts": issue_counts,
        "top_issues": [
            {"issue": iss, "count": c, "percentage": round(c / max(len(recent), 1) * 100)}
            for iss, c in issue_counts.most_common(6)
        ],
        "phase_avg": {ph: avg.get(ph, 0) for ph in PHASE_ORDER_STABLE},
    }


def _stat_line(summary: dict, *issues: str) -> str:
    parts = []
    for iss in issues:
        n = summary["issue_counts"].get(iss, 0)
        if n:
            parts.append(f"'{iss}'出现{n}次")
    return f"近期{summary['games_analyzed']}局：" + "、".join(parts) if parts else ""


def generate_adaptive_plan(store, window_days: int = 14) -> dict:
    """
    数据驱动的强化计划：
    1. 聚合近期窗口弱点 → 四阶段评分升序排列
    2. 最弱的三个阶段依次担任 W1/W2/W3 主题，W4 固定综合检验
    3. 每周骨架固定（定式/复盘/题库/棋理/实战循环），内容按阶段填充，
       任务描述嵌入近期真实统计数据
    返回 {tasks, meta}
    """
    summary = get_recent_weakness(store, window_days)

    # 阶段按评分升序（最弱在前）；稳定排序保证同分时按固定顺序
    ranked = sorted(PHASE_ORDER_STABLE, key=lambda ph: (
        summary["phase_avg"].get(ph, 0),
        PHASE_ORDER_STABLE.index(ph),
    ))
    weekly_phases = ranked[:3] + ["__COMPREHENSIVE__"]  # W4 固定综合

    tasks = []
    order = 0

    for w_idx, key in enumerate(weekly_phases, start=1):
        n_problems, prob_diff = PROBLEM_PLAN[w_idx - 1]

        if key == "__COMPREHENSIVE__":
            cat = "综合"
            theme = COMPREHENSIVE_PROGRAM["theme"]
            goal_line = COMPREHENSIVE_PROGRAM["goal"]
            j1_name, j1_desc = "拆边专题·一间拆/二间拆/大飞", "复习全部16个定式的棋理解读"
            j2_name, j2_desc = "打入与侵消·基本型", "抽查最容易忘的关键定式"
            con_d5 = None
            rev_a = "对照本期各周重点逐项检查是否改善"
            rev_b = "总结自己赢在哪里，固化成功经验"
            practice = "综合实战：完整运用前三周所学，下完自行复盘"
        else:
            prog = PHASE_PROGRAMS[key]
            cat = key
            theme = prog["theme"]
            goal_line = prog["goal"]
            j1_name, j1_desc = prog["joseki"][0][0], f"{prog['joseki'][0][1]}——{prog['joseki'][0][0]}"
            j2_name, j2_desc = prog["joseki"][1][0], f"{prog['joseki'][1][1]}——{prog['joseki'][1][0]}"
            con_d5 = prog["concept_d5"]
            rev_a = prog["review_a"]
            rev_b = prog["review_b"]
            practice = f"实战：{prog['practice_goal']}。下完导入复盘。"

        stat = ""

        def add(day, category, title, description, module, difficulty):
            nonlocal order
            order += 1
            tasks.append({
                "week": w_idx, "day": day, "category": category,
                "title": title, "description": description,
                "target_module": module, "difficulty": difficulty,
                "sort_order": order,
            })

        # d1/d2 定式
        add(1, cat, f"学习{j1_name}", j1_desc + "。" + (f"本周目标：{goal_line}" if key != "__COMPREHENSIVE__" else ""), "joseki", min(w_idx + 1, 5))
        add(2, cat, f"学习{j2_name}", j2_desc, "joseki", min(w_idx + 1, 5))

        # d3 复盘A（嵌入统计）
        stat = _stat_line(summary, *_phase_issues(key))
        desc_a = f"用AI复盘检验{rev_a}。" + (stat or "")
        add(3, cat, f"复盘2局：{rev_a}", desc_a, "review", min(w_idx + 1, 4))

        # d4 题库
        add(4, cat, f"死活题练习 ×{n_problems}",
            f"完成{n_problems}道难度≤{prob_diff}的死活题，保持计算力。", "problem", prob_diff)

        # d5 棋理概念/知识
        if con_d5:
            add(5, cat, f"吃透棋理：'{con_d5}'",
                f"在相关定式的棋理解读中找到'{con_d5}'一节精读，并用自己的话写出它如何影响你的对局。", "joseki", max(5 - w_idx, 1))
        else:
            add(5, cat, "通读'实战棋理十诀'",
                "在棋理课堂重读十诀，对照本期各周问题写下自己的薄弱条目。", "wisdom", 1)

        # d6 复盘B
        stat_b = _stat_line(summary, *_phase_issues(key, secondary=True))
        add(6, cat, f"复盘2局：{rev_b}",
            f"选典型对局深入分析{rev_b}。" + (stat_b or ""), "review", min(w_idx + 1, 4))

        # d7 实战
        add(7, cat, "实战：本周检验局", practice, "practice", 3)

    meta = {
        "window_days": window_days,
        "games_analyzed": summary["games_analyzed"],
        "phase_rank": ranked,
        "weekly_focus": [
            {"week": i + 1, "phase": p if p != "__COMPREHENSIVE__" else "综合"}
            for i, p in enumerate(weekly_phases)
        ],
        "top_issues": summary["top_issues"],
    }
    return {"tasks": tasks, "meta": meta}


_PHASE_ISSUE_MAP = {
    "布局": (["开局不在角部", "角部占领不足", "过早接触战"], ["二线棋过多", "开局选点低效"]),
    "序盘": (["序盘急于战斗", "过早接触战"], ["序盘中腹浮棋"]),
    "中盘": (["孤棋被攻击", "中腹浮棋风险"], ["序盘中腹浮棋"]),
    "官子": (["官子冗长"], ["大分差"]),
}


def _phase_issues(phase: str, secondary=False):
    pri, sec = _PHASE_ISSUE_MAP.get(phase, ([], []))
    return sec if secondary else pri
