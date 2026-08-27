"""
野狐棋谱同步核心逻辑：main.py 的 /api/foxwq/import 端点与定时调度器共用。
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from sgf_parser import parse_metadata
from foxwq_download import query_user_by_name, fetch_chess_list, fetch_sgf


def _fetch_all_chess(uid: str, limit: int) -> list[dict]:
    all_chess = []
    lastcode = "0"
    for _ in range(10):
        chess_list = fetch_chess_list(uid, lastcode)
        if not chess_list:
            break
        all_chess.extend(chess_list)
        lastcode = chess_list[-1].get("chessid", "")
        if len(all_chess) >= limit * 2:
            break
    return all_chess


def sync_import_games(store, nickname: str | None = None, uid: str | None = None,
                      limit: int = 30, date_from: str | None = None,
                      date_to: str | None = None) -> dict:
    """按昵称/UID 拉取棋谱并增量导入（chess_id 去重 + 日期过滤）"""
    import time as _time

    if not uid:
        if not nickname:
            raise ValueError("请提供昵称或UID")
        user_info = query_user_by_name(nickname)
        uid = user_info["uid"]

    all_chess = _fetch_all_chess(uid, limit)

    imported = 0
    skipped = 0
    failed = 0
    for game in all_chess:
        chessid = game.get("chessid", "")
        if not chessid:
            continue

        dt = game.get("starttime", "")[:10]
        if date_from and dt < date_from:
            continue
        if date_to and dt > date_to:
            continue

        if store.has_chess_id(chessid):
            skipped += 1
            continue

        try:
            sgf_content = fetch_sgf(chessid)
            if not sgf_content or len(sgf_content) < 20:
                failed += 1
                continue
            meta = parse_metadata(sgf_content)
            if meta["move_count"] == 0:
                failed += 1
                continue
            store.import_game("foxwq", meta, sgf_content, chess_id=chessid)
            imported += 1
            _time.sleep(0.15)
        except Exception:
            failed += 1

        if imported >= limit:
            break

    return {"imported": imported, "skipped": skipped, "failed": failed}
