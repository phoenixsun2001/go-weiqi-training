"""
生成15道基础死活形题目（角部/边部经典形），并自动验证答案正确性。
验证方式：GameState 真实模拟——杀棋题枚举白棋所有抵抗（两层搜索），
做活题枚举白棋所有破眼手段，用严格真眼判定（4邻全己方/盘外）检查。
运行：python generate_tsumego.py
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from game_state import GameState, Color
from copy import deepcopy

SIZE = 19

# ===== 题目定义 =====
# 每道题：眼位空格集合 E（被杀方/做活方围出的眼位区域）+ 答案点 + 难度目录 + 名称
# E 的盘内邻格 = 棋手棋子（被杀方或做活方），棋子的邻格 = 包围方
PROBLEMS = [
    # ---- easy：角部基础杀棋 ----
    {"name": "basic-straight-three-corner-kill", "dir": "easy", "title": "直三·角部杀",
     "eyes": [(16,18),(17,18),(18,18)], "answer": (17,18), "type": "kill"},
    {"name": "basic-bent-three-corner-kill", "dir": "easy", "title": "曲三·角部杀",
     "eyes": [(17,18),(18,18),(18,17)], "answer": (18,18), "type": "kill"},
    {"name": "basic-bulky-four-corner-kill", "dir": "easy", "title": "丁四·角部杀",
     "eyes": [(16,18),(17,18),(18,18),(17,17)], "answer": (17,18), "type": "kill"},
    {"name": "basic-rabbity-six-corner-kill", "dir": "easy", "title": "刀把五·角部杀",
     "eyes": [(16,18),(17,18),(16,17),(17,17),(18,18)], "answer": (18,18), "type": "kill"},
    {"name": "basic-flower-five-corner-kill", "dir": "easy", "title": "梅花五·角部杀",
     "eyes": [(17,17),(16,17),(18,17),(17,16),(17,18)], "answer": (17,17), "type": "kill"},
    # ---- easy：做活 ----
    # extend = 轮廓端子外侧延伸（模拟真实局面中与外势联络，防止对方提端打劫）
    {"name": "basic-straight-three-live", "dir": "easy", "title": "直三·做活",
     "eyes": [(1,0),(2,0),(3,0)], "answer": (2,0), "type": "live", "extend": [(0,1),(4,1)]},
    {"name": "basic-bent-three-live", "dir": "easy", "title": "曲三·做活",
     "eyes": [(1,0),(2,0),(2,1)], "answer": (2,0), "type": "live", "extend": [(0,1),(4,1)]},
    # ---- intermediate：边部/进阶 ----
    {"name": "basic-bulky-four-live", "dir": "intermediate", "title": "丁四·做活",
     "eyes": [(1,0),(2,0),(3,0),(2,1)], "answer": (2,0), "type": "live"},
    {"name": "basic-flower-five-live", "dir": "intermediate", "title": "梅花五·做活",
     "eyes": [(2,1),(1,1),(3,1),(2,0),(2,2)], "answer": (2,1), "type": "live"},
    {"name": "basic-plate-six-corner-kill", "dir": "intermediate", "title": "板六·角部杀",
     "eyes": [(16,18),(17,18),(18,18),(16,17),(17,17),(18,17)], "answer": (17,18), "type": "kill"},
    {"name": "basic-bent-four-edge-kill", "dir": "intermediate", "title": "曲四·边部杀",
     "eyes": [(8,18),(9,18),(10,18),(8,17)], "answer": (9,18), "type": "kill"},
    {"name": "basic-straight-three-edge-kill", "dir": "intermediate", "title": "直三·边部杀",
     "eyes": [(9,18),(10,18),(11,18)], "answer": (10,18), "type": "kill"},
    {"name": "basic-bulky-four-edge-kill", "dir": "intermediate", "title": "丁四·边部杀",
     "eyes": [(8,18),(9,18),(10,18),(9,17)], "answer": (9,18), "type": "kill"},
    {"name": "basic-flower-five-edge-kill", "dir": "intermediate", "title": "梅花五·边部杀",
     "eyes": [(9,17),(8,17),(10,17),(9,16),(9,18)], "answer": (9,17), "type": "kill"},
    {"name": "basic-bent-four-corner-kill-tl", "dir": "intermediate", "title": "曲四·左上角杀",
     "eyes": [(0,0),(1,0),(2,0),(0,1)], "answer": (1,0), "type": "kill"},
]


def build_board(eyes: list[tuple[int, int]], player: Color) -> tuple[list[tuple[int,int]], list[tuple[int,int]]]:
    """由眼位空格生成棋子与包围圈。
    player = 拥有眼位的棋手（被杀方或做活方）
    返回 (player_stones, opponent_stones)"""
    eye_set = set(eyes)
    gs = GameState.new(SIZE)
    for x, y in eyes:
        gs.set_stone(Color.WHITE, x, y)  # 临时占位，仅用于取邻格
    stones: set[tuple[int,int]] = set()
    for x, y in eyes:
        for nx, ny in gs._neighbors(x, y):
            if (nx, ny) in eye_set:
                continue  # 眼位格是空的，不是棋子
            stones.add((nx, ny))
    # 包围 = 棋子的邻格（非棋子、非眼位）
    stones_list = list(stones)
    for x, y in stones_list:
        gs.set_stone(Color.BLACK, x, y)
    surround: set[tuple[int,int]] = set()
    for x, y in stones_list:
        for nx, ny in gs._neighbors(x, y):
            if (nx, ny) in eye_set or (nx, ny) in stones:
                continue
            surround.add((nx, ny))
    return stones_list, list(surround)


def setup(eyes, player: Color, extend: list[tuple[int,int]] | None = None) -> GameState:
    """摆出完整局面：player 棋子 + 对方包围 + 眼位留空
    extend：做活方轮廓端子的延伸子（替换原包围位置）"""
    extend = extend or []
    stones, surround = build_board(eyes, player)
    surround = [s for s in surround if s not in extend]
    gs = GameState.new(SIZE)
    for x, y in stones:
        gs.set_stone(player, x, y)
    for x, y in extend:
        gs.set_stone(player, x, y)
    for x, y in surround:
        gs.set_stone(player.opp(), x, y)
    gs.turn = Color.BLACK
    return gs


def count_true_eyes(gs: GameState, color: Color) -> int:
    """严格真眼：空点且所有盘内邻格都是己方"""
    eyes = 0
    for y in range(gs.size):
        for x in range(gs.size):
            if gs.stone_at(x, y) is not None:
                continue
            ok = True
            for nx, ny in gs._neighbors(x, y):
                if gs.stone_at(nx, ny) != color.value:
                    ok = False
                    break
            if ok:
                eyes += 1
    return eyes


def legal_moves(gs: GameState) -> list[tuple[int, int]]:
    return [(x, y) for y in range(gs.size) for x in range(gs.size)
            if gs.stone_at(x, y) is None]


def try_play(gs: GameState, color: Color, pt: tuple[int,int]) -> GameState | None:
    g2 = deepcopy(gs)
    try:
        g2.play(color, *pt)
        return g2
    except ValueError:
        return None


def verify_kill(gs: GameState, answer: tuple[int,int]) -> bool:
    """杀棋验证：黑点答案后，白所有应对 x 黑所有回应，白眼 <2 才算杀"""
    gs1 = try_play(gs, Color.BLACK, answer)
    if gs1 is None:
        return False
    for wp in legal_moves(gs1):
        g2 = try_play(gs1, Color.WHITE, wp)
        if g2 is None:
            continue
        # 存在黑回应使白 <2 眼 → 白此应对无效
        black_can_kill = False
        for bp in legal_moves(g2):
            g3 = try_play(g2, Color.BLACK, bp)
            if g3 is None:
                continue
            if count_true_eyes(g3, Color.WHITE) < 2:
                black_can_kill = True
                break
        if not black_can_kill:
            return False  # 白有抵抗手段
    return True


def verify_live(gs: GameState, answer: tuple[int,int]) -> bool:
    """做活验证：黑点答案后，白所有破眼应对，黑再应一手后仍 >=2 眼才算活"""
    gs1 = try_play(gs, Color.BLACK, answer)
    if gs1 is None:
        return False
    for wp in legal_moves(gs1):
        g2 = try_play(gs1, Color.WHITE, wp)
        if g2 is None:
            continue
        # 黑再下一手（可提回破眼子）：存在黑应使黑眼 >=2 → 白此应无效
        black_survives = False
        for bp in legal_moves(g2):
            g3 = try_play(g2, Color.BLACK, bp)
            if g3 is None:
                continue
            if count_true_eyes(g3, Color.BLACK) >= 2:
                black_survives = True
                break
        if not black_survives:
            return False  # 白破眼成功
    return True


def to_sgf_pt(pt: tuple[int,int]) -> str:
    return chr(97 + pt[0]) + chr(97 + pt[1])


def write_sgf(p: dict, stones, surround, out_dir: str) -> str:
    eyes = p["eyes"]
    extend = p.get("extend", [])
    surround = [s for s in surround if s not in extend]
    # stones = 被杀方（kill）或做活方（live）；黑棋 = AB，白棋 = AW
    if p["type"] == "kill":
        ab, aw = surround, stones
    else:
        ab, aw = stones + extend, surround
    ab_str = "".join(f"[{to_sgf_pt(s)}]" for s in ab)
    aw_str = "".join(f"[{to_sgf_pt(s)}]" for s in aw)
    ans = to_sgf_pt(p["answer"])
    sgf = (
        f"(;GM[1]FF[4]CA[UTF-8]RU[Japanese]SZ[19]"
        f"C[Black to play. {p['title']}]\n"
        f"AW{aw_str}AB{ab_str}\n"
        f"(;B[{ans}]C[Correct]))"
    )
    path = os.path.join(out_dir, f"{p['name']}.sgf")
    with open(path, "w", encoding="utf-8") as f:
        f.write(sgf)
    return path


def main():
    base = os.path.join(os.path.dirname(os.path.abspath(__file__)), "resources", "tsumego")
    ok = 0
    for p in PROBLEMS:
        player = Color.WHITE if p["type"] == "kill" else Color.BLACK
        gs = setup(p["eyes"], player, p.get("extend"))
        if p["type"] == "kill":
            passed = verify_kill(gs, p["answer"])
        else:
            passed = verify_live(gs, p["answer"])
        status = "OK" if passed else "FAIL"
        print(f"[{status}] {p['title']} answer={to_sgf_pt(p['answer'])}")
        if passed:
            stones, surround = build_board(p["eyes"], player)
            out_dir = os.path.join(base, p["dir"])
            path = write_sgf(p, stones, surround, out_dir)
            print(f"        写入 {path}")
            ok += 1
        else:
            print(f"        警告：{p['title']} 验证失败，未写入！")
    print(f"\n完成：{ok}/{len(PROBLEMS)} 道验证通过")


if __name__ == "__main__":
    main()
