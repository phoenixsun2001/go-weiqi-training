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
