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
def _cond_loss(r, g):
    return 1 if not r["reviewee_won"] else 0

def _cond_win(r, g):
    return 1 if r["reviewee_won"] else 0

def _cond_early_contact(r, g):
    """布局期过早接触战"""
    return _phase_issue(r, "布局", "过早接触战")

def _cond_rush_fight(r, g):
    """序盘急于战斗"""
    return _phase_issue(r, "序盘", "序盘急于战斗")

def _cond_floating(r, g):
    """中腹浮棋（中盘+序盘）"""
    return _phase_issue(r, "中盘", "中腹浮棋风险") + _phase_issue(r, "序盘", "序盘中腹浮棋")

def _cond_isolated(r, g):
    """孤棋被攻击"""
    return 1 if any(p.get("isolated_count") for p in r.get("phases", [])) else 0


# 复盘任务的匹配器按任务阶段(category)驱动，主检测器权重更高，
# 使自适应计划在任意周序下都能拿到对应主题的典型对局
def _conditions_for_task(t: dict) -> list:
    cat = t.get("category")
    if t["target_module"] != "review":
        return []
    if cat == "布局":
        return [(_cond_early_contact, "布局期过早接触战"), (_cond_loss, "负局")]
    if cat == "序盘":
        return [(_cond_rush_fight, "序盘急于战斗"), (_phase_only_float_prev, "序盘中腹浮棋")]
    if cat == "中盘":
        return [(_cond_isolated, "中盘孤棋被攻击"), (_cond_floating, "中盘浮棋风险")]
    if cat == "综合":
        # W4 的两个复盘槽位：D4 胜局总结，其余负局检查
        if t.get("day") == 4:
            return [(_cond_win, "胜局")]
        return [(_cond_loss, "负局")]
    if cat == "官子":
        return [(_cond_loss, "负局")]
    return []

def _phase_only_float_prev(r, g):
    return _phase_issue(r, "序盘", "序盘中腹浮棋")


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
        conds = _conditions_for_task(t)
        if not conds:
            continue
        matched = []
        for g in games:
            r = reviews.get(g["id"])
            if r is None:
                continue
            strength = 0
            label = None
            for w_idx, (fn, lb) in enumerate(conds):
                v = fn(r, g)
                if v > 0 and label is None:
                    label = lb
                    strength += (len(conds) - w_idx) * 10 + v  # 主条件权重高
            if strength > 0 and label:
                opp, opp_rank, res = _opponent_info(g, r)
                matched.append({
                    "game_id": g["id"],
                    "date": g.get("played_date", "") or (g.get("imported_at", "") or "")[:10],
                    "opponent": opp,
                    "opponent_rank": opp_rank,
                    "result": res,
                    "reason": label,
                    "score": strength,
                })
        # 分数降序；同分时近期对局优先
        matched.sort(key=lambda m: m["date"], reverse=True)
        matched.sort(key=lambda m: m["score"], reverse=True)
        result[t["id"]] = matched[:top_n]
    return result
