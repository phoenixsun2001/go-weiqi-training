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
    # 复盘持久化服务注入 store
    from review_service import set_store, backfill_all
    set_store(store)
    # 启动时补算缺失的 AI 复盘（幂等；新库/增量导入后自动填充）
    try:
        bf = backfill_all(store)
        if bf["processed"]:
            print(f"[startup] AI复盘回填: {bf['processed']} 局, 库存 {bf['cached_total']}")
    except Exception as e:
        print(f"[startup] AI复盘回填失败: {e}")

    # 启动时 seed 题库（如果为空）
    if store.count_problems() == 0:
        seed_problems()

    # 启动野狐定时同步调度器
    from sync_scheduler import start_scheduler
    scheduler_task = start_scheduler(store)

    yield

    # 关闭时停止引擎与调度器
    scheduler_task.cancel()
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
    """从 backend/resources/tsumego 导入死活题（按 question_sgf 去重，可重复执行）"""
    base = Path(__file__).parent / "resources" / "tsumego"
    if not base.exists():
        base = Path(__file__).parent.parent / "resources" / "tsumego"
    levels = [("easy", 2), ("intermediate", 4), ("hard", 6)]
    imported = 0
    skipped = 0
    for dir_name, diff in levels:
        d = base / dir_name
        if not d.exists():
            continue
        for sgf_file in d.glob("*.sgf"):
            sgf_content = sgf_file.read_text(encoding="utf-8")
            if store.problem_sgf_exists(sgf_content):
                skipped += 1
                continue
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
    print(f"[seed] 导入 {imported} 道死活题（已存在 {skipped} 道跳过）")


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



# ===== AI 智能复盘（不依赖 KataGo）=====
from ai_review import review_game


class AiReviewReq(BaseModel):
    sgf: str
    game_id: int | None = None


@app.post("/api/review/ai")
def ai_review_endpoint(req: AiReviewReq):
    """AI 智能复盘：基于棋型分析，不依赖 KataGo；带 game_id 时结果落库"""
    try:
        result = review_game(req.sgf)
    except Exception as e:
        raise HTTPException(400, f"复盘失败: {e}")
    if req.game_id and "error" not in result and result.get("phases"):
        try:
            store.upsert_ai_review(req.game_id, result)
            result["saved"] = True
        except Exception as e:
            print(f"[ai-review] 落库失败 game_id={req.game_id}: {e}")
    return result


@app.get("/api/review/ai/result/{game_id}")
def ai_review_result(game_id: int):
    """读取已落库的 AI 复盘（联查对局元数据；无则 None）"""
    row = store.get_ai_review(game_id)
    if not row:
        return None
    g = store.get_imported_game(game_id)
    out = {
        "game_id": game_id,
        "analyzed_at": row["analyzed_at"],
        "reviewee": row.get("reviewee", ""),
        "reviewee_color": row.get("reviewee_color", ""),
        "reviewee_won": bool(row.get("reviewee_won")),
        "total_moves": row.get("total_moves", 0),
        "phases": json.loads(row.get("phases_json") or "[]"),
        "key_moves": json.loads(row.get("key_moves_json") or "[]"),
        "territory_estimate": json.loads(row.get("territory_json") or "{}"),
        "summary": row.get("summary", ""),
    }
    if g:
        out.update({
            "black": g["black_name"], "white": g["white_name"],
            "black_rank": g["black_rank"], "white_rank": g["white_rank"],
            "result": g["result"], "board_size": g["board_size"],
            "date": g["played_date"],
        })
    return out


@app.post("/api/review/ai/batch")
def ai_review_batch():
    """为对局库中所有未复盘棋谱批量补算并落库（幂等）"""
    from review_service import backfill_all
    return backfill_all(store)


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
    from foxwq_api import sync_import_games
    try:
        result = sync_import_games(
            store,
            nickname=req.nickname, uid=req.uid, limit=req.limit,
            date_from=req.date_from, date_to=req.date_to,
        )
    except ValueError as e:
        raise HTTPException(400, str(e))
    except Exception as e:
        raise HTTPException(400, f"导入失败: {e}")
    return {
        **result,
        "message": f"导入完成：新增 {result['imported']} 局，跳过已存在 {result['skipped']} 局，失败 {result['failed']} 局"
    }


# ===== 野狐定时同步 =====
from sync_scheduler import run_sync_once


@app.get("/api/foxwq/sync/config")
def get_sync_config():
    cfg = store.get_sync_config()
    last_logs = store.list_sync_logs(limit=1)
    return {"config": cfg, "last_run": last_logs[0] if last_logs else None}


class SyncConfigReq(BaseModel):
    enabled: bool
    nickname: str | None = None
    uid: str | None = None
    interval_hours: float = 24
    limit_count: int = 30


@app.put("/api/foxwq/sync/config")
def put_sync_config(req: SyncConfigReq):
    if not req.enabled and req.nickname is None:
        pass  # 仅开关状态也允许保存
    cfg = store.set_sync_config(
        enabled=1 if req.enabled else 0,
        nickname=req.nickname, uid=req.uid,
        interval_hours=max(1, req.interval_hours),
        limit_count=min(max(1, req.limit_count), 100),
    )
    return {"ok": True, "config": cfg}


@app.post("/api/foxwq/sync/run")
def run_foxwq_sync():
    """立即执行一次野狐同步（同步等待结果）"""
    import asyncio
    result = asyncio.run(run_sync_once(store, trigger_type="manual"))
    # 启动自动回填新导入棋谱的 AI 复盘
    if result.get("imported", 0) > 0:
        try:
            from review_service import backfill_all
            backfill = backfill_all(store)
            result["ai_backfill"] = backfill["processed"]
        except Exception:
            pass
    return result


@app.get("/api/foxwq/sync/logs")
def foxwq_sync_logs():
    return store.list_sync_logs(limit=15)


# ===== 定式学习 =====
from joseki_data import get_all_joseki, get_categories


@app.get("/api/joseki/list")
def joseki_list(category: str | None = None):
    """获取定式列表，可按分类筛选"""
    all_joseki = get_all_joseki()
    if category:
        all_joseki = [j for j in all_joseki if j["category"] == category]
    return {"joseki": all_joseki, "categories": get_categories()}


@app.get("/api/joseki/concepts")
def joseki_concepts():
    """棋理解读概念索引：concept -> 相关定式列表（训练任务定位用）"""
    index: dict[str, list[dict]] = {}
    for j in get_all_joseki():
        for p in j.get("principles", []):
            concept = p["concept"]
            if concept not in index:
                index[concept] = []
            index[concept].append({
                "name": j["name"], "category": j["category"],
                "difficulty": j["difficulty"], "explanation": p["explanation"],
            })
    return index


# ===== 专项强化计划 =====
from training_plan import generate_plan, get_weakness_summary
from game_matcher import match_games_for_tasks


@app.get("/api/training/matches")
def training_matches():
    """为训练计划中的复盘任务匹配典型对局（优先读落库复盘，缺失自动补算）"""
    tasks = store.list_training_tasks()
    games = store.list_imported_games()
    if not tasks or not games:
        return {}
    return match_games_for_tasks(store, tasks, games)


@app.post("/api/training/generate")
def training_generate():
    """分析对局库中的棋谱，生成4周训练计划"""
    # 如果已有计划，不重复生成
    if store.training_task_count() > 0:
        return {"message": "训练计划已存在", "task_count": store.training_task_count()}

    # 获取对局库中的棋谱
    games = store.list_imported_games()
    if not games:
        return {"message": "对局库为空，请先导入棋谱", "task_count": 0}

    # 生成计划
    tasks = generate_plan()
    for t in tasks:
        store.insert_training_task(
            t["week"], t["day"], t["category"], t["title"], t["description"],
            t["target_module"], t["difficulty"], t["sort_order"]
        )
    return {"message": f"训练计划已生成：{len(tasks)}个任务（4周）", "task_count": len(tasks)}


@app.get("/api/training/tasks")
def training_tasks():
    """获取全部训练任务"""
    return store.list_training_tasks()


@app.get("/api/training/progress")
def training_progress():
    """获取训练进度统计"""
    tasks = store.list_training_tasks()
    total = len(tasks)
    done = sum(1 for t in tasks if t["status"] == "done")
    skipped = sum(1 for t in tasks if t["status"] == "skipped")
    pending = total - done - skipped
    # 按周统计
    weeks = {}
    for t in tasks:
        w = t["week"]
        if w not in weeks:
            weeks[w] = {"total": 0, "done": 0, "pending": 0}
        weeks[w]["total"] += 1
        if t["status"] == "done":
            weeks[w]["done"] += 1
        else:
            weeks[w]["pending"] += 1
    return {
        "total": total, "done": done, "skipped": skipped, "pending": pending,
        "completion_rate": round(done / max(total, 1) * 100),
        "weeks": weeks,
    }


class TaskStatusReq(BaseModel):
    status: str  # "done" | "skipped" | "pending"


@app.put("/api/training/task/{task_id}/status")
def update_task_status(task_id: int, req: TaskStatusReq):
    """更新任务状态"""
    store.update_task_status(task_id, req.status)
    return {"ok": True}


@app.get("/api/training/weakness")
def training_weakness():
    """获取弱点摘要（基于落库的AI复盘聚合，缺失时自动补算）"""
    from review_service import aggregate_weakness
    return aggregate_weakness(store)


# 近期问题 → 训练周 映射（闭环推荐用）
ISSUE_WEEK_MAP = {
    "开局选点低效": 1, "开局不在角部": 1, "角部占领不足": 1,
    "二线棋过多": 1, "过早接触战": 1, "过早中腹": 2,
    "序盘急于战斗": 2, "序盘中腹浮棋": 2,
    "中腹浮棋风险": 3, "孤棋被攻击": 3,
    "官子冗长": 4, "大分差": 4,
}


@app.get("/api/training/insights")
def training_insights(window: int = 10):
    """近期问题趋势分析（强化训练闭环的反馈环节）

    按 played_date 倒数取最近 window 局 vs 之前 window 局：
    - 阶段评分趋势（改善/恶化）
    - 高频问题排行及变化
    - 胜率变化
    - 建议：将高频问题映射到训练计划的待完成任务
    """
    rows = store.list_ai_reviews_with_games()
    total_stored = len(rows)
    if not rows:
        return {
            "stored_reviews": 0, "recent_count": 0, "prev_count": 0,
            "window": window, "has_data": False,
        }

    recent = rows[:window]
    prev = rows[window:2 * window]

    def _avg_phase(items: list[dict]) -> dict[str, float | None]:
        acc: dict[str, list[float]] = {}
        for r in items:
            for ph, sc in (r.get("phase_scores") or {}).items():
                acc.setdefault(ph, []).append(sc)
        return {
            ph: round(sum(v) / len(v), 1) if v else None
            for ph, v in acc.items()
        }

    def _win_rate(items: list[dict]) -> float | None:
        if not items:
            return None
        return round(sum(1 for r in items if r.get("reviewee_won")) / len(items) * 100)

    from collections import Counter
    recent_issues = Counter()
    for r in recent:
        for i in r.get("issues") or []:
            recent_issues[i] += 1
    prev_issues = Counter()
    for r in prev:
        for i in r.get("issues") or []:
            prev_issues[i] += 1

    issue_trend = []
    for iss, cnt in recent_issues.most_common(8):
        p = prev_issues.get(iss, 0)
        issue_trend.append({
            "issue": iss, "recent": cnt, "previous": p, "delta": cnt - p,
            "percentage": round(cnt / len(recent) * 100),
        })

    recent_avg = _avg_phase(recent)
    prev_avg = _avg_phase(prev)
    phase_trend = {}
    for ph in ["布局", "序盘", "中盘", "官子"]:
        now_v = recent_avg.get(ph)
        pre_v = prev_avg.get(ph)
        phase_trend[ph] = {
            "now": now_v, "previous": pre_v,
            "delta": (round(now_v - pre_v, 1) if now_v is not None and pre_v is not None else None),
        }

    # 推荐任务：近3个高频问题映射到训练计划中仍待完成的任务
    tasks = [t for t in store.list_training_tasks() if t["status"] == "pending"]
    recommendations = []
    seen_weeks: set[int] = set()
    for item in issue_trend[:5]:
        wk = ISSUE_WEEK_MAP.get(item["issue"])
        if wk is None or wk in seen_weeks:
            continue
        task = next((t for t in tasks if t["week"] == wk), None)
        if task:
            recommendations.append({
                "issue": item["issue"],
                "week": wk,
                "day": task["day"],
                "title": task["title"],
                "description": task["description"],
                "target_module": task["target_module"],
                "reason": f"最近{len(recent)}局出现{item['recent']}次",
            })
            seen_weeks.add(wk)
        if len(recommendations) >= 3:
            break

    return {
        "stored_reviews": total_stored,
        "window": window,
        "recent_count": len(recent),
        "prev_count": len(prev),
        "has_data": True,
        "recent_date_range": [
            min((r.get("played_date") or "") for r in recent) if recent else "",
            max((r.get("played_date") or "") for r in recent) if recent else "",
        ],
        "phase_trend": phase_trend,
        "issue_trend": issue_trend,
        "win_rate": {"recent": _win_rate(recent), "previous": _win_rate(prev)},
        "recommendations": recommendations,
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
    # 0.0.0.0: 服务器部署时允许外部访问（systemd 服务直接运行本文件）
    uvicorn.run(app, host="0.0.0.0", port=8000)
