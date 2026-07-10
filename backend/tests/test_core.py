"""基础模块单元测试（移植自 Rust 44 项测试中的核心部分）"""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from coords import gtp_to_xy, xy_to_gtp
from game_state import GameState, Color
from sgf_parser import parse_moves, export_sgf, parse_metadata, extract_tsumego_answer
from rating import expected_score, update_elo, dan_from_elo


# ===== coords =====
def test_gtp_corner():
    assert gtp_to_xy("A1") == (0, 0)

def test_gtp_skips_i():
    x, _ = gtp_to_xy("J1")
    assert x == 8

def test_xy_roundtrip():
    gtp = xy_to_gtp(3, 4, 9)
    assert gtp_to_xy(gtp) == (3, 4)

def test_invalid_coord():
    try:
        gtp_to_xy("Z1")
        assert False
    except ValueError:
        pass


# ===== game_state =====
def test_empty_board():
    gs = GameState.new(9)
    assert gs.turn == Color.BLACK
    assert gs.size == 9

def test_alternates():
    gs = GameState.new(9)
    gs.play(Color.BLACK, 0, 0)
    assert gs.turn == Color.WHITE
    gs.play(Color.WHITE, 1, 1)
    assert gs.turn == Color.BLACK

def test_capture():
    gs = GameState.new(9)
    gs.play(Color.BLACK, 8, 8)  # placeholder
    gs.play(Color.WHITE, 0, 0)
    gs.play(Color.BLACK, 8, 7)
    gs.play(Color.WHITE, 8, 6)
    gs.play(Color.BLACK, 1, 0)
    gs.play(Color.WHITE, 8, 5)
    captured = gs.play(Color.BLACK, 0, 1)
    assert captured == 1
    assert gs.stone_at(0, 0) is None

def test_suicide():
    gs = GameState.new(9)
    gs.set_stone(Color.WHITE, 1, 0)
    gs.set_stone(Color.WHITE, 0, 1)
    try:
        gs.play(Color.BLACK, 0, 0)
        assert False, "自杀应被拒绝"
    except ValueError:
        pass

def test_ko():
    gs = GameState.new(9)
    gs.set_ko_point((1, 1))
    try:
        gs.play(Color.WHITE, 1, 1)
        assert False, "劫点回提应被拒绝"
    except ValueError:
        pass

def test_pass():
    gs = GameState.new(9)
    gs.pass_turn(Color.BLACK)
    assert gs.turn == Color.WHITE


# ===== sgf =====
def test_parse_simple():
    moves = parse_moves("(;GM[1]SZ[9];B[ee];W[ed];B[fd])")
    assert len(moves) == 3
    assert moves[0] == ("black", 4, 4)

def test_export_roundtrip():
    moves = [("black", 4, 4), ("white", 4, 3)]
    sgf = export_sgf(9, moves)
    reparsed = parse_moves(sgf)
    assert reparsed == moves

def test_metadata():
    sgf = "(;GM[1]SZ[19]PB[柯洁]BR[9d]PW[申真谞]WR[9d]RE[B+2.5]DT[2024-03-15];B[qd];W[dd])"
    m = parse_metadata(sgf)
    assert m["black_name"] == "柯洁"
    assert m["result"] == "B+2.5"
    assert m["board_size"] == 19
    assert m["move_count"] == 2

def test_tsumego_answer():
    sgf = "(;GM[1]SZ[19]AB[op];B[rs];W[rr];B[ns]C[Correct])"
    ans = extract_tsumego_answer(sgf)
    assert ans is not None


# ===== rating =====
def test_expected_equal():
    assert abs(expected_score(1500, 1500) - 0.5) < 1e-9

def test_elo_win():
    assert update_elo(1500, 1600, 1.0) > 1500

def test_elo_loss():
    assert update_elo(1500, 1400, 0.0) < 1500

def test_dan_bounds():
    assert dan_from_elo(1500) == 1
    assert dan_from_elo(1900) == 5
    assert dan_from_elo(1700) == 3
