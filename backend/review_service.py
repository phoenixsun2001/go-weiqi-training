"""
复盘结果持久化服务：
- DB 优先读取，缺失时实时计算并落库（自愈缓存）
- 批量回填、聚合弱点（供训练计划/趋势分析复用）
"""
import sys, os, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from ai_review import review_game

_store_ref = None  # main 启动时注入


def set_store(store):
    global _store_ref
    _store_ref = store


def compute_and_persist(store, game_id: int, sgf: str) -> dict | None:
    """计算 AI 复盘并写库；返回结果或 None（无着手/解析失败）"""
    try:
        result = review_game(sgf)
    except Exception:
        return None
    if "error" in result or not result.get("phases"):
        return None
    store.upsert_ai_review(game_id, result)
    return result


def _restore_from_row(row: dict) -> dict:
    return {
        "reviewee": row.get("reviewee", ""),
        "reviewee_color": row.get("reviewee_color", ""),
        "reviewee_won": bool(row.get("reviewee_won")),
        "total_moves": row.get("total_moves", 0),
        "phases": json.loads(row.get("phases_json") or "[]"),
        "key_moves": json.loads(row.get("key_moves_json") or "[]"),
        "territory_estimate": json.loads(row.get("territory_json") or "{}"),
        "summary": row.get("summary", ""),
        "_cached": True,
    }


def get_or_compute(store, game_id: int, sgf: str) -> dict | None:
    """DB 命中则还原返回；否则计算并落库"""
    row = store.get_ai_review(game_id)
    if row:
        return _restore_from_row(row)
    return compute_and_persist(store, game_id, sgf)


def backfill_all(store) -> dict:
    """为对局库中所有尚未复盘的棋谱批量补算（幂等）"""
    games = store.list_imported_games()
    processed = 0
    errors = 0
    for g in games:
        gid = g["id"]
        sgf = g.get("sgf", "")
        if not sgf or len(sgf) < 20:
            continue
        if store.has_ai_review(gid):
            continue
        r = compute_and_persist(store, gid, sgf)
        if r is None:
            errors += 1
        else:
            processed += 1
    return {"total": len(games), "processed": processed, "errors": errors,
            "cached_total": store.ai_review_count()}


def aggregate_weakness(store) -> dict:
    """
    弱点摘要：从 ai_review 表聚合（快路径），
    对未落库的对局即时补算落库后一并统计。
    返回结构与 training_plan.get_weakness_summary 一致。
    """
    from collections import Counter

    issue_counts: Counter = Counter()
    phase_scores = {"布局": [], "序盘": [], "中盘": [], "官子": []}
    total = 0

    stored: dict[int, dict] = {}
    for r in store.list_ai_reviews_with_games():
        stored[r["game_id"]] = r

    for g in store.list_imported_games():
        sgf = g.get("sgf", "")
        if not sgf or len(sgf) < 20:
            continue
        gid = g["id"]
        row = stored.get(gid)
        if row is not None:
            for ph, sc in (row.get("phase_scores") or {}).items():
                if ph in phase_scores:
                    phase_scores[ph].append(sc)
            for i in row.get("issues") or []:
                issue_counts[i] += 1
            total += 1
        else:
            full = get_or_compute(store, gid, sgf)
            if full is None:
                continue
            for p in full.get("phases", []):
                ph = p.get("phase", "")
                if ph in phase_scores:
                    phase_scores[ph].append(p.get("score", 3))
                for i in p.get("issues", []):
                    issue_counts[i] += 1
            total += 1

    avg = {k: round(sum(v) / len(v), 1) if v else 0 for k, v in phase_scores.items()}
    weaknesses = [
        {"issue": iss, "count": c, "percentage": round(c / max(total, 1) * 100)}
        for iss, c in issue_counts.most_common(10)
    ]
    return {"total_games": total, "phase_scores": avg, "weaknesses": weaknesses}
