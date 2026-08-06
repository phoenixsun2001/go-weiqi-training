"""FastAPI 后端主程序：围棋棋力训练应用 Web 版"""
import json
import sys
import os
from pathlib import Path
from contextlib import asynccontextmanager

# 确保 backend 目录在 sys.path 中
sys.path.insert(0, str(Path(__file__).parent))

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from store import Store, CATEGORY_LABELS
from game_state import GameState, Color, MoveRecord
from sgf_parser import parse_moves, export_sgf, parse_metadata, extract_tsumego_answer
from coords import gtp_to_xy, xy_to_gtp
from rating import expected_score, update_elo, dan_from_elo, opponent_elo_for_training
from katago_engine import (
    KatagoEngine, dan_to_max_visits, find_katago_dir,
    get_binary_path, get_model_path, get_gtp_args, ensure_config, is_installed,
)

# ===== 全局状态 =====
DB_PATH = str(Path(__file__).parent.parent / "training.db")
store = Store(DB_PATH)

# 棋局状态
game_state = GameState.new(19)

# 两个 KataGo 引擎实例
opponent_engine = KatagoEngine()
analysis_engine = KatagoEngine()
difficulty = 3


def snapshot_stones() -> list[str | None]:
    return [game_state.board[i] for i in range(game_state.size * game_state.size)]


def board_snapshot() -> dict:
    return {
        "size": game_state.size,
        "stones": snapshot_stones(),
        "turn": game_state.turn.value,
    }


# ===== Pydantic 模型 =====
class PlayReq(BaseModel):
    x: int
    y: int

class ImportReq(BaseModel):
    sgf: str
    source: str | None = None

class AnalyzeReq(BaseModel):
    sgf: str
    threshold: float | None = None
    game_id: int | None = None

class NextProblemReq(BaseModel):
    max_difficulty: int | None = None

class SubmitReq(BaseModel):
    problem_id: int
    user_answer: str

class UpdateMetaReq(BaseModel):
    id: int
    reviewed: bool | None = None
    tags: str | None = None
    notes: str | None = None

class SaveGameReq(BaseModel):
    black_name: str | None = None
    white_name: str | None = None
    result: str | None = None

class AiMoveReq(BaseModel):
    user_color: str

class StartEngineReq(BaseModel):
    difficulty: int = 3

class RecordWeaknessReq(BaseModel):
    category: str
    blunder: bool

class RecordGameReq(BaseModel):
    result: str
    opponent_dan: int
    sgf: str


# ===== FastAPI 应用 =====
@asynccontextmanager
async def lifespan(app: FastAPI):
    # 启动时 seed 题库（如果为空）
    if store.count_problems() == 0:
        seed_problems()
    yield
    # 关闭时停止引擎
    await opponent_engine.stop()
    await analysis_engine.stop()

app = FastAPI(title="围棋棋力训练", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


def seed_problems():
    """从 backend/resources/tsumego 导入死活题"""
    base = Path(__file__).parent / "resources" / "tsumego"
    if not base.exists():
        base = Path(__file__).parent.parent / "resources" / "tsumego"
    levels = [("easy", 2), ("intermediate", 4), ("hard", 6)]
    imported = 0
    for dir_name, diff in levels:
        d = base / dir_name
        if not d.exists():
            continue
        for sgf_file in d.glob("*.sgf"):
            sgf_content = sgf_file.read_text(encoding="utf-8")
            answer = extract_tsumego_answer(sgf_content)
            if not answer:
                continue
            meta = parse_metadata(sgf_content)
            explanation = "死活题"
            for line in sgf_content.split("\n"):
                if "C[" in line and "Black to play" in line:
                    explanation = "Black to play"
                    break
            store.insert_problem("tsumego", diff, sgf_content, answer, explanation)
            imported += 1
    print(f"[seed] 导入 {imported} 道死活题")


# ===== 棋盘 / 对战 =====
@app.post("/api/game/new")
async def new_game(size: int = 19):
    global game_state
    game_state = GameState.new(size)
    if opponent_engine.is_running:
        await opponent_engine.command("clear_board")
    return {"ok": True}


@app.post("/api/game/play")
async def play_move(req: PlayReq):
    turn_before = game_state.turn
    try:
        captured = game_state.play(turn_before, req.x, req.y)
    except ValueError as e:
        raise HTTPException(400, str(e))
    # 同步到 KataGo
    if opponent_engine.is_running:
        color = turn_before.value
        vertex = xy_to_gtp(req.x, req.y, game_state.size)
        await opponent_engine.command(f"play {color} {vertex}")
    return {
        "captured": captured,
        "turn": game_state.turn.value,
        "stones": snapshot_stones(),
    }


@app.post("/api/game/pass")
async def pass_move():
    turn_before = game_state.turn
    game_state.pass_turn(turn_before)
    if opponent_engine.is_running:
        await opponent_engine.command(f"play {turn_before.value} pass")
    return {"captured": 0, "turn": game_state.turn.value, "stones": snapshot_stones()}


@app.get("/api/game/snapshot")
def get_snapshot():
    return board_snapshot()


@app.get("/api/elo")
def get_elo():
    p = store.load_profile()
    return p["elo"] if p else None


# ===== AI 引擎 =====
@app.get("/api/katago/status")
def katago_status():
    return {"installed": is_installed(), "binary_path": str(get_binary_path())}


@app.post("/api/engine/start")
async def auto_start_engine(req: StartEngineReq):
    global difficulty
    if not is_installed():
        raise HTTPException(400, "KataGo 尚未安装")
    ensure_config()
    binary = str(get_binary_path())
    args = get_gtp_args()
    await opponent_engine.start(binary, args)
    size = game_state.size
    await opponent_engine.command(f"boardsize {size}")
    visits = dan_to_max_visits(req.difficulty)
    await opponent_engine.command(f"kata-set-param maxVisits {visits}")
    difficulty = req.difficulty
    return {"running": True, "difficulty": req.difficulty}


@app.post("/api/engine/stop")
async def stop_engine():
    await opponent_engine.stop()
    return {"ok": True}


@app.get("/api/engine/status")
def engine_status():
    return {"running": opponent_engine.is_running, "difficulty": difficulty}


@app.post("/api/engine/set-difficulty")
async def set_difficulty(d: int):
    global difficulty
    difficulty = d
    if opponent_engine.is_running:
        visits = dan_to_max_visits(d)
        await opponent_engine.command(f"kata-set-param maxVisits {visits}")
    return {"ok": True}


@app.post("/api/engine/ai-move")
async def ai_move(req: AiMoveReq):
    global game_state
    if not opponent_engine.is_running:
        raise HTTPException(400, "对手引擎未启动")
    ai_color = "white" if req.user_color == "black" else "black"
    ai_turn = Color.WHITE if ai_color == "white" else Color.BLACK
    if game_state.turn != ai_turn:
        raise HTTPException(400, f"当前轮到 {game_state.turn.value}，不是 AI")

    reply = await opponent_engine.command(f"genmove {ai_color}")
    reply = reply.strip().lower()

    if reply == "resign":
        return {"played": "resign", "vertex": None, "captured": 0, "turn": game_state.turn.value, "stones": snapshot_stones()}
    if reply == "pass":
        game_state.pass_turn(ai_turn)
        return {"played": "pass", "vertex": None, "captured": 0, "turn": game_state.turn.value, "stones": snapshot_stones()}

    x, y = gtp_to_xy(reply)
    captured = game_state.play(ai_turn, x, y)
    return {"played": "play", "vertex": [x, y], "captured": captured, "turn": game_state.turn.value, "stones": snapshot_stones()}


@app.get("/api/territory")
async def estimate_territory():
    if not opponent_engine.is_running:
        raise HTTPException(400, "对手引擎未启动")
    await opponent_engine.command("kata-set-rules chinese")
    score = await opponent_engine.command("final_score")
    wr_raw = await opponent_engine.command("lz-analyze black 1")
    black_wr = 0.5
    for part in wr_raw.split():
        if part == "winrate":
            idx = wr_raw.split().index(part)
            if idx + 1 < len(wr_raw.split()):
                v = float(wr_raw.split()[idx + 1])
                black_wr = v / 10000 if v > 1 else v
    lead = 0.0
    s = score.strip()
    if s.startswith("B+"):
        lead = float(s[2:]) if s[2:] else 0
    elif s.startswith("W+"):
        lead = -float(s[2:]) if s[2:] else 0
    return {"score": score, "black_winrate": black_wr, "lead": lead, "move_count": len(game_state.moves)}


@app.post("/api/game/save")
def save_current_game(req: SaveGameReq):
    size = game_state.size
    moves = []
    for m in game_state.moves:
        if m.is_pass:
            moves.append((m.color.value, 0xFFFF, 0xFFFF))
        else:
            moves.append((m.color.value, m.x, m.y))
    sgf = export_sgf(size, moves)
    black = req.black_name or "我"
    white = req.white_name or "AI"
    meta = {"black_name": black, "white_name": white, "black_rank": "", "white_rank": "",
            "result": req.result or "", "board_size": size, "played_date": "", "move_count": len(moves)}
    gid = store.import_game("play", meta, sgf)
    return gid


# ===== 复盘分析 =====
@app.post("/api/engine/start-analysis")
async def start_analysis_engine():
    if not is_installed():
        raise HTTPException(400, "KataGo 尚未安装")
    ensure_config()
    binary = str(get_binary_path())
    args = get_gtp_args()
    await analysis_engine.start(binary, args)
    size = game_state.size
    await analysis_engine.command(f"boardsize {size}")
    return {"running": True}


@app.post("/api/engine/stop-analysis")
async def stop_analysis_engine():
    await analysis_engine.stop()
    return {"ok": True}


@app.get("/api/engine/analysis-status")
def analysis_status():
    return {"running": analysis_engine.is_running}


@app.post("/api/review/analyze")
async def import_and_analyze(req: AnalyzeReq):
    """同步分析（兼容模式）"""
    moves = parse_moves(req.sgf)
    if not moves:
        raise HTTPException(400, "棋谱无着手")
    threshold = req.threshold or 0.03
    if not analysis_engine.is_running:
        raise HTTPException(400, "复盘分析引擎未启动")
    size = parse_metadata(req.sgf)["board_size"]

    await analysis_engine.command("clear_board")
    report_moves = []
    winrate_curve = []
    blunder_count = 0
    inaccuracy_count = 0

    total = len(moves)
    for i, (color, x, y) in enumerate(moves):
        col_str = color
        # 分析当前局面
        analyze_raw = await analysis_engine.command(f"lz-analyze {col_str} 1")
        best_wr = _extract_winrate(analyze_raw)
        best_move = ""
        for part in analyze_raw.split():
            if part.startswith("move"):
                best_move = part[4:]

        # 落实际子
        vertex = "pass" if x == 0xFFFF else xy_to_gtp(x, y, size)
        await analysis_engine.command(f"play {col_str} {vertex}")
        a2 = await analysis_engine.command(f"lz-analyze {Color(col_str).opp_str()} 1")
        opp_wr = _extract_winrate(a2)
        played_wr = 1.0 - opp_wr

        kind = "good"
        loss = best_wr - played_wr
        if loss >= 0.10:
            kind = "blunder"
            blunder_count += 1
        elif loss >= threshold:
            kind = "inaccuracy"
            inaccuracy_count += 1

        if kind != "good":
            frac = i / total if total > 0 else 1
            cat = "fuseki" if frac < 0.33 else ("tesuji" if frac < 0.75 else "endgame")
            store.add_weakness(cat, kind == "blunder")

        winrate_curve.append(played_wr)
        report_moves.append({
            "move_index": i, "best_winrate": best_wr, "played_winrate": played_wr,
            "loss": loss, "kind": kind, "best_move": best_move,
            "category": _phase_label(i, total),
        })

    # 持久化
    if req.game_id:
        store.save_review_result(
            req.game_id, json.dumps(winrate_curve), json.dumps(report_moves),
            blunder_count, inaccuracy_count, _build_summary(total, blunder_count, inaccuracy_count, report_moves),
        )
        store.update_game_meta(req.game_id, reviewed=True)

    return {
        "moves": report_moves, "winrate_curve": winrate_curve,
        "blunder_count": blunder_count, "inaccuracy_count": inaccuracy_count,
        "summary": _build_summary(total, blunder_count, inaccuracy_count, report_moves),
    }


@app.get("/api/review/result/{game_id}")
def get_review_result(game_id: int):
    row = store.get_review_result(game_id)
    if not row:
        return None
    return {
        "game_id": row["game_id"], "analyzed_at": row["analyzed_at"],
        "moves": json.loads(row["moves_json"]), "winrate_curve": json.loads(row["winrate_curve_json"]),
        "blunder_count": row["blunder_count"], "inaccuracy_count": row["inaccuracy_count"],
        "summary": row["summary"],
    }


def _extract_winrate(raw: str) -> float:
    parts = raw.split()
    for i, p in enumerate(parts):
        if p == "winrate" and i + 1 < len(parts):
            v = float(parts[i + 1])
            return v / 10000 if v > 1 else v
    return 0.5


def _phase_label(idx: int, total: int) -> str:
    frac = idx / total if total > 0 else 1
    if frac < 0.33:
        return "布局"
    if frac < 0.75:
        return "中盘"
    return "官子"


def _build_summary(total, blunders, inaccuracies, moves):
    good_pct = round((total - blunders - inaccuracies) / total * 100) if total > 0 else 100
    s = f"共 {total} 手：好棋率 {good_pct}%，严重失误 {blunders} 处，不准确 {inaccuracies} 处。"
    worst = max(moves, key=lambda m: m["loss"]) if moves else None
    if worst and worst["loss"] > 0.001:
        s += f" 最严重失误在第 {worst['move_index'] + 1} 手（胜率损失 {worst['loss'] * 100:.0f}%）。"
    return s


# ===== 题库 / 猜棋 =====
@app.post("/api/problems/next")
def next_problem(req: NextProblemReq):
    max_diff = req.max_difficulty
    if max_diff is None:
        p = store.load_profile()
        max_diff = dan_from_elo(p["elo"]) + 1 if p else 5
    row = store.next_problem(max_diff)
    if not row:
        return None
    return {
        "id": row["id"], "category": row["category"],
        "category_label": CATEGORY_LABELS.get(row["category"], row["category"]),
        "difficulty": row["difficulty"], "question_sgf": row["question_sgf"],
        "explanation": row["explanation"],
    }


@app.post("/api/problems/submit")
def submit_answer(req: SubmitReq):
    correct, answer = store.submit_answer(req.problem_id, req.user_answer)
    return {"correct": correct, "answer_vertex": answer}


@app.post("/api/problems/import-tsumego")
def import_tsumego():
    seed_problems()
    return {"message": "题库导入完成"}


@app.get("/api/problems/wrong-book")
def wrong_book():
    return store.list_wrong_book()


@app.get("/api/weakness")
def weakness_report():
    rows = store.list_weakness()
    return [{
        "category": r["category"],
        "category_label": CATEGORY_LABELS.get(r["category"], r["category"]),
        "blunder_count": r["blunder_count"], "inaccuracy_count": r["inaccuracy_count"],
    } for r in rows]


@app.post("/api/weakness/record")
def record_weakness(req: RecordWeaknessReq):
    store.add_weakness(req.category, req.blunder)
    return {"ok": True}


@app.get("/api/guess/next")
def next_guess():
    p = store.load_profile()
    max_diff = dan_from_elo(p["elo"]) + 1 if p else 5
    row = store.next_problem(max_diff)
    if not row:
        return None
    return {
        "id": row["id"],
        "category_label": CATEGORY_LABELS.get(row["category"], row["category"]),
        "difficulty": row["difficulty"], "position_sgf": row["question_sgf"],
    }


@app.post("/api/guess/check")
def check_guess(req: SubmitReq):
    row = store.get_problem(req.problem_id)
    if not row:
        raise HTTPException(400, "题目不存在")
    answers = row["answer_vertex"].split()
    correct = any(a.lower() == req.user_answer.strip().lower() for a in answers)
    return {"correct": correct, "answer_vertex": row["answer_vertex"], "explanation": row["explanation"]}


# ===== 对局库 =====
@app.post("/api/library/import")
def import_game(req: ImportReq):
    meta = parse_metadata(req.sgf)
    if meta["move_count"] == 0:
        raise HTTPException(400, "棋谱无着手")
    gid = store.import_game(req.source or "foxwq", meta, req.sgf)
    row = store.get_imported_game(gid)
    return row


@app.get("/api/library/list")
def list_games():
    return store.list_imported_games()


@app.get("/api/library/{gid}")
def get_game(gid: int):
    row = store.get_imported_game(gid)
    if not row:
        raise HTTPException(404, "对局不存在")
    return row


@app.delete("/api/library/{gid}")
def delete_game(gid: int):
    store.delete_imported_game(gid)
    return {"ok": True}


@app.put("/api/library/meta")
def update_meta(req: UpdateMetaReq):
    store.update_game_meta(req.id, req.reviewed, req.tags, req.notes)
    return store.get_imported_game(req.id)


# ===== 野狐棋谱导入 =====
from foxwq_download import query_user_by_name, fetch_chess_list, fetch_sgf, format_dan, parse_result


class FoxwqSearchReq(BaseModel):
    nickname: str
    limit: int = 20


@app.post("/api/foxwq/search")
def foxwq_search(req: FoxwqSearchReq):
    """通过野狐昵称查询用户和对局列表"""
    try:
        user_info = query_user_by_name(req.nickname)
    except Exception as e:
        raise HTTPException(400, f"查询用户失败: {e}")

    uid = user_info["uid"]
    try:
        chess_list = fetch_chess_list(uid)
    except Exception as e:
        raise HTTPException(400, f"获取棋谱列表失败: {e}")

    games = []
    for game in chess_list[:req.limit]:
        games.append({
            "chessid": game.get("chessid", ""),
            "black_name": game.get("blacknick", "?"),
            "white_name": game.get("whitenick", "?"),
            "black_dan": format_dan(game.get("blackdan", 0)),
            "white_dan": format_dan(game.get("whitedan", 0)),
            "result": parse_result(game.get("winner", 0), game.get("point", 0), game.get("reason", 0)),
            "start_time": game.get("starttime", ""),
            "move_count": game.get("movenum", 0),
        })

    return {
        "uid": uid,
        "nickname": user_info["nickname"],
        "dan": format_dan(user_info["dan"]),
        "total_win": user_info["total_win"],
        "total_lost": user_info["total_lost"],
        "games": games,
    }


class FoxwqImportReq(BaseModel):
    nickname: str | None = None
    uid: str | None = None
    limit: int = 50
    date_from: str | None = None   # "2026-05-01"
    date_to: str | None = None     # "2026-08-05"


@app.post("/api/foxwq/search")
def foxwq_search(req: FoxwqImportReq):
    """通过野狐昵称/UID查询用户和对局列表"""
    # 支持 UID 直接查询
    if req.uid:
        uid = req.uid
        nickname = req.uid
    else:
        if not req.nickname:
            raise HTTPException(400, "请提供昵称或UID")
        try:
            user_info = query_user_by_name(req.nickname)
        except Exception as e:
            raise HTTPException(400, f"查询用户失败: {e}")
        uid = user_info["uid"]

    try:
        # 翻页获取更多历史对局
        all_chess = []
        lastcode = "0"
        for _ in range(10):  # 最多翻10页
            chess_list = fetch_chess_list(uid) if lastcode == "0" else _fetch_chess_list_paged(uid, lastcode)
            if not chess_list:
                break
            all_chess.extend(chess_list)
            lastcode = chess_list[-1].get("chessid", "")
            if len(all_chess) >= req.limit * 2:
                break

        # 日期过滤
        filtered = []
        for game in all_chess:
            dt = game.get("starttime", "")[:10]
            if req.date_from and dt < req.date_from:
                continue
            if req.date_to and dt > req.date_to:
                continue
            filtered.append(game)

        games = []
        for game in filtered[:req.limit]:
            games.append({
                "chessid": game.get("chessid", ""),
                "black_name": game.get("blacknick", "?"),
                "white_name": game.get("whitenick", "?"),
                "black_dan": format_dan(game.get("blackdan", 0)),
                "white_dan": format_dan(game.get("whitedan", 0)),
                "result": parse_result(game.get("winner", 0), game.get("point", 0), game.get("reason", 0)),
                "start_time": game.get("starttime", ""),
                "move_count": game.get("movenum", 0),
            })

        return {
            "uid": uid,
            "nickname": req.nickname or uid,
            "games": games,
            "total_found": len(all_chess),
            "total_filtered": len(filtered),
        }
    except Exception as e:
        raise HTTPException(400, f"获取棋谱列表失败: {e}")


def _fetch_chess_list_paged(uid: str, lastcode: str):
    """带分页参数获取棋谱列表"""
    import urllib.request, urllib.parse, json
    encoded_uid = urllib.parse.quote(uid)
    url = f"https://h5.foxwq.com/yehuDiamond/chessbook_local/YHWQFetchChessList?srcuid=0&dstuid={encoded_uid}&type=1&lastcode={lastcode}&searchkey=&uin={encoded_uid}"
    req = urllib.request.Request(url)
    req.add_header("User-Agent", "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15")
    with urllib.request.urlopen(req, timeout=20) as resp:
        data = json.loads(resp.read().decode("utf-8"))
    if data.get("result") != 0:
        return []
    return data.get("chesslist", [])


@app.post("/api/foxwq/import")
def foxwq_import(req: FoxwqImportReq):
    """通过野狐昵称/UID批量导入棋谱（增量去重 + 时间段过滤）"""
    import time as _time

    # 获取 UID
    if req.uid:
        uid = req.uid
    else:
        if not req.nickname:
            raise HTTPException(400, "请提供昵称或UID")
        try:
            user_info = query_user_by_name(req.nickname)
        except Exception as e:
            raise HTTPException(400, f"查询用户失败: {e}")
        uid = user_info["uid"]

    # 翻页获取棋谱列表
    try:
        all_chess = []
        lastcode = "0"
        for _ in range(10):
            chess_list = fetch_chess_list(uid) if lastcode == "0" else _fetch_chess_list_paged(uid, lastcode)
            if not chess_list:
                break
            all_chess.extend(chess_list)
            lastcode = chess_list[-1].get("chessid", "")
            if len(all_chess) >= req.limit * 2:
                break
    except Exception as e:
        raise HTTPException(400, f"获取棋谱列表失败: {e}")

    # 日期过滤 + 增量去重 + 下载导入
    imported = 0
    skipped = 0
    failed = 0
    for game in all_chess:
        chessid = game.get("chessid", "")
        if not chessid:
            continue

        # 日期过滤
        dt = game.get("starttime", "")[:10]
        if req.date_from and dt < req.date_from:
            continue
        if req.date_to and dt > req.date_to:
            continue

        # 增量去重
        if store.has_chess_id(chessid):
            skipped += 1
            continue

        # 下载 SGF
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

        if imported >= req.limit:
            break

    return {
        "imported": imported,
        "skipped": skipped,
        "failed": failed,
        "message": f"导入完成：新增 {imported} 局，跳过已存在 {skipped} 局，失败 {failed} 局"
    }


# ===== 棋力面板 =====
@app.get("/api/rating/history")
def rating_history():
    return store.get_rating_history()


@app.post("/api/game/record")
def record_game(req: RecordGameReq):
    p = store.load_profile()
    if not p:
        raise HTTPException(400, "无用户档案")
    opp_elo = opponent_elo_for_training(p["elo"])
    score = 1.0 if req.result == "win" else 0.0
    new_elo = int(update_elo(p["elo"], opp_elo, score))
    store.record_game(req.result, req.opponent_dan, p["elo"], new_elo, req.sgf)
    return new_elo


# ===== WebSocket: 流式复盘 =====
@app.websocket("/ws/review")
async def ws_review(ws: WebSocket):
    """流式复盘：逐手推送 KataGo 分析结果"""
    await ws.accept()
    try:
        data = await ws.receive_json()
        sgf = data.get("sgf", "")
        threshold = data.get("threshold", 0.03)
        game_id = data.get("game_id")

        moves = parse_moves(sgf)
        if not moves:
            await ws.send_json({"error": "棋谱无着手"})
            return
        if not analysis_engine.is_running:
            await ws.send_json({"error": "分析引擎未启动"})
            return

        size = parse_metadata(sgf)["board_size"]
        await analysis_engine.command("clear_board")
        total = len(moves)
        all_moves = []
        winrate_curve = []
        blunder_count = 0
        inaccuracy_count = 0

        for i, (color, x, y) in enumerate(moves):
            col_str = color
            analyze_raw = await analysis_engine.command(f"lz-analyze {col_str} 1")
            best_wr = _extract_winrate(analyze_raw)
            best_move = ""
            for part in analyze_raw.split():
                if part.startswith("move"):
                    best_move = part[4:]

            vertex = "pass" if x == 0xFFFF else xy_to_gtp(x, y, size)
            await analysis_engine.command(f"play {col_str} {vertex}")
            a2 = await analysis_engine.command(f"lz-analyze {Color(col_str).opp_str()} 1")
            played_wr = 1.0 - _extract_winrate(a2)

            kind = "good"
            loss = best_wr - played_wr
            if loss >= 0.10:
                kind = "blunder"
                blunder_count += 1
            elif loss >= threshold:
                kind = "inaccuracy"
                inaccuracy_count += 1

            if kind != "good":
                cat = "fuseki" if i / total < 0.33 else ("tesuji" if i / total < 0.75 else "endgame")
                store.add_weakness(cat, kind == "blunder")

            move_data = {
                "move_index": i, "best_winrate": best_wr, "played_winrate": played_wr,
                "loss": loss, "kind": kind, "best_move": best_move,
                "category": _phase_label(i, total),
            }
            all_moves.append(move_data)
            winrate_curve.append(played_wr)

            # 逐手推送进度
            await ws.send_json({"type": "progress", "move": move_data, "current": i + 1, "total": total})

        summary = _build_summary(total, blunder_count, inaccuracy_count, all_moves)
        if game_id:
            store.save_review_result(game_id, json.dumps(winrate_curve), json.dumps(all_moves),
                                     blunder_count, inaccuracy_count, summary)
            store.update_game_meta(game_id, reviewed=True)

        await ws.send_json({
            "type": "done",
            "moves": all_moves, "winrate_curve": winrate_curve,
            "blunder_count": blunder_count, "inaccuracy_count": inaccuracy_count,
            "summary": summary,
        })
    except WebSocketDisconnect:
        pass
    except Exception as e:
        await ws.send_json({"type": "error", "message": str(e)})


# ===== 静态文件（前端） =====
dist_path = Path(__file__).parent.parent / "dist"
if dist_path.exists():
    app.mount("/", StaticFiles(directory=str(dist_path), html=True), name="static")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)
