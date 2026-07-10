"""SGF 解析、导出、元数据提取、死活题正解提取"""

import re
from coords import xy_to_gtp


def parse_moves(sgf: str) -> list[tuple[str, int, int]]:
    """解析 SGF 着手序列。返回 [(color, x, y), ...]，pass 用 (color, MAX, MAX)。"""
    moves: list[tuple[str, int, int]] = []
    i = 0
    data = sgf.encode('utf-8') if isinstance(sgf, str) else sgf
    text = data.decode('utf-8')
    while i < len(text):
        if text[i] == ';':
            i += 1
            while i < len(text) and text[i].isspace():
                i += 1
            if i >= len(text):
                break
            color_char = text[i]
            if color_char == 'B':
                color = "black"
            elif color_char == 'W':
                color = "white"
            else:
                i += 1
                continue
            i += 1
            while i < len(text) and text[i] != '[':
                i += 1
            if i >= len(text):
                break
            i += 1  # skip '['
            start = i
            while i < len(text) and text[i] != ']':
                i += 1
            content = text[start:i]
            if not content:
                moves.append((color, 0xFFFF, 0xFFFF))  # pass
            else:
                if len(content) >= 2:
                    x = ord(content[0]) - ord('a')
                    y = ord(content[1]) - ord('a')
                    moves.append((color, x, y))
            if i < len(text):
                i += 1  # skip ']'
        else:
            i += 1
    return moves


def export_sgf(size: int, moves: list[tuple[str, int, int]]) -> str:
    """导出 SGF。moves: [(color_str, x, y), ...]，pass 用 x=0xFFFF。"""
    out = f"(;GM[1]FF[4]SZ[{size}]\n"
    for color, x, y in moves:
        c = "B" if color == "black" else "W"
        if x == 0xFFFF:
            coord = ""
        else:
            coord = chr(ord('a') + x) + chr(ord('a') + y)
        out += f";{c}[{coord}]\n"
    out += ")"
    return out


def _extract_property(sgf: str, key: str) -> str:
    """提取 SGF 属性值 KEY[...]"""
    pattern = key + "["
    idx = sgf.find(pattern)
    if idx >= 0:
        start = idx + len(pattern)
        end = sgf.find(']', start)
        if end >= 0:
            return sgf[start:end]
    return ""


def parse_metadata(sgf: str) -> dict:
    """解析 SGF 元数据"""
    size_str = _extract_property(sgf, "SZ")
    try:
        board_size = int(size_str)
    except ValueError:
        board_size = 19
    return {
        "black_name": _extract_property(sgf, "PB"),
        "white_name": _extract_property(sgf, "PW"),
        "black_rank": _extract_property(sgf, "BR"),
        "white_rank": _extract_property(sgf, "WR"),
        "result": _extract_property(sgf, "RE"),
        "board_size": board_size,
        "played_date": _extract_property(sgf, "DT"),
        "move_count": len(parse_moves(sgf)),
    }


def extract_tsumego_answer(sgf: str) -> str | None:
    """从死活题 SGF 变化树提取正解第一手（标注 Correct 的分支）。"""
    correct_pos = sgf.find("Correct")
    if correct_pos >= 0:
        return _find_last_move_before(sgf[:correct_pos])
    return _find_first_black_move(sgf)


def _find_last_move_before(text: str) -> str | None:
    """找最后一个 ;B[xx] 或 ;W[xx] 的 GTP 顶点"""
    last: str | None = None
    for m in re.finditer(r';([BW])\[([a-z]{2})\]', text):
        coord = m.group(2)
        last = _sgf_coord_to_gtp(coord)
    return last


def _find_first_black_move(sgf: str) -> str | None:
    m = re.search(r';B\[([a-z]{2})\]', sgf)
    if m:
        return _sgf_coord_to_gtp(m.group(1))
    return None


def _sgf_coord_to_gtp(coord: str, size: int = 19) -> str:
    """SGF 小写坐标 'pq' 转 GTP 'P4'（跳过 I）"""
    if len(coord) < 2:
        return ""
    x = ord(coord[0]) - ord('a')
    y = ord(coord[1]) - ord('a')
    col = chr(ord('A') + x) if x < 8 else chr(ord('A') + x + 1)
    row = size - y
    return f"{col}{row}"
