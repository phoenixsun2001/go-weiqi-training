"""
典型对局匹配器：为训练计划的复盘任务，从对局库匹配符合条件（负局/胜局/过早接触战/序盘急于战斗/中腹浮棋/孤棋被攻击）的典型对局
优先读取已落库的 ai_review 结果（review_service），缺失时自动补算落库
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))


def _get_review(store, game_id: int, sgf: str) -> dict | None:
    from review_service import get_or_compute
    return get_or_compute(store, game_id, sgf)


def _phase_issue(r: dict, phase_name: str, issue: str) -> int:
    """返回某阶段某 issue 出现的次数（0 = 无）"""
    for p in r.get("phases", []):
        if p.get("phase") == phase_name and issue in p.get("issues", []):
            return 1
    return 0


def _all_issue_count(r: dict, issue: str) -> int:
    return sum(1 for p in r.get("phases", []) if issue in p.get("issues", []))


def _opponent_info(g: dict, r: dict) -> tuple[str, str, str]:
    """返回 (对手名, 对手段位, 结果)"""
    is_black = r["reviewee_color"] == "黑"
    opp = g["white_name"] if is_black else g["black_name"]
    opp_rank = g["white_rank"] if is_black else g["black_rank"]
    return opp or "?", opp_rank or "", g.get("result", "")


# ===== 匹配条件 =====
# 每种条件：label + 匹配强度函数（返回非0表示匹配，值越大越典型）
def _cond_loss(r, g):
    return 1 if not r["reviewee_won"] else 0

def _cond_win(r, g):
    return 1 if r["reviewee_won"] else 0

def _cond_early_contact(r, g):
    """第1周d6：前12手贴身接触 → 布局阶段'过早接触战'"""
    return _phase_issue(r, "布局", "过早接触战")

def _cond_rush_fight(r, g):
    """第2周d3：序盘急于战斗"""
    return _phase_issue(r, "序盘", "序盘急于战斗")

def _cond_floating(r, g):
    """第2周d6/第3周d3：中腹浮棋（序盘+中盘）"""
    return _phase_issue(r, "中盘", "中腹浮棋风险") + _phase_issue(r, "序盘", "序盘中腹浮棋")

def _cond_isolated(r, g):
    """第3周d6：孤棋被攻击"""
    return _phase_issue(r, "中盘", "孤棋被攻击")


# 任务(week, day) → 匹配条件
TASK_CONDITION = {
    (1, 3): (_cond_loss, "负局"),
    (1, 6): (_cond_early_contact, "布局期过早接触战"),
    (2, 3): (_cond_rush_fight, "序盘急于战斗"),
    (2, 6): (_cond_floating, "序盘中腹浮棋"),
    (3, 3): (_cond_floating, "中盘浮棋风险"),
    (3, 6): (_cond_isolated, "中盘孤棋被攻击"),
    (4, 2): (_cond_loss, "负局"),
    (4, 4): (_cond_win, "胜局"),
}


def match_games_for_tasks(store, tasks: list[dict], games: list[dict], top_n: int = 4) -> dict:
    """
    为每个复盘任务匹配典型对局。
    store: Store 实例；tasks: 训练任务列表；games: 对局库列表
    返回 {task_id: [matched_game, ...]}
    """
    # 统一确保复盘可用（DB 命中或补算落库）
    reviews: dict[int, dict] = {}
    for g in games:
        if g.get("sgf") and len(g.get("sgf", "")) > 20:
            r = _get_review(store, g["id"], g["sgf"])
            if r is not None:
                reviews[g["id"]] = r

    result: dict[int, list[dict]] = {}
    for t in tasks:
        cond = TASK_CONDITION.get((t["week"], t["day"]))
        if cond is None or t["target_module"] != "review":
            continue
        strength_fn, label = cond
        matched = []
        for g in games:
            r = reviews.get(g["id"])
            if r is None:
                continue
            strength = strength_fn(r, g)
            if strength > 0:
                opp, opp_rank, res = _opponent_info(g, r)
                matched.append({
                    "game_id": g["id"],
                    "date": g.get("played_date", "") or g.get("imported_at", "")[:10],
                    "opponent": opp,
                    "opponent_rank": opp_rank,
                    "result": res,
                    "reason": label,
                    "score": strength,
                })
        matched.sort(key=lambda m: m["score"], reverse=True)
        result[t["id"]] = matched[:top_n]
    return result
