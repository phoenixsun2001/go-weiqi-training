"""围棋棋局规则：落子/提子/劫/自杀/pass，单一事实源"""

from dataclasses import dataclass, field
from enum import Enum


class Color(Enum):
    BLACK = "black"
    WHITE = "white"

    def opp(self) -> "Color":
        return Color.WHITE if self == Color.BLACK else Color.BLACK

    def opp_str(self) -> str:
        return "white" if self == Color.BLACK else "black"


@dataclass
class MoveRecord:
    color: Color
    x: int = -1
    y: int = -1
    captured: int = 0
    is_pass: bool = False


@dataclass
class GameState:
    size: int
    board: list[str | None]  # size*size, row-major: index = y*size + x
    turn: Color = Color.BLACK
    ko_point: tuple[int, int] | None = None
    moves: list[MoveRecord] = field(default_factory=list)

    @classmethod
    def new(cls, size: int) -> "GameState":
        return cls(size=size, board=[None] * (size * size))

    def stone_at(self, x: int, y: int) -> str | None:
        return self.board[y * self.size + x]

    def set_stone(self, color: Color, x: int, y: int) -> None:
        self.board[y * self.size + x] = color.value

    def set_ko_point(self, pt: tuple[int, int] | None) -> None:
        self.ko_point = pt

    def pass_turn(self, color: Color) -> None:
        if color != self.turn:
            raise ValueError("非该方回合")
        self.moves.append(MoveRecord(color=color, is_pass=True))
        self.turn = self.turn.opp()
        self.ko_point = None

    def play(self, color: Color, x: int, y: int) -> int:
        """落子，返回提子数。失败时抛 ValueError。"""
        if color != self.turn:
            raise ValueError("非该方回合")
        if x >= self.size or y >= self.size:
            raise ValueError(f"坐标越界 ({x},{y})")
        if self.board[y * self.size + x] is not None:
            raise ValueError("该点已有子")
        if self.ko_point == (x, y):
            raise ValueError("劫争禁手（不可立即回提）")

        idx = y * self.size + x
        self.board[idx] = color.value
        opp = color.opp()

        captured = 0
        captured_single: tuple[int, int] | None = None
        for nx, ny in self._neighbors(x, y):
            if self.board[ny * self.size + nx] == opp.value:
                group, liberties = self._group_and_liberties(nx, ny)
                if liberties == 0:
                    for gx, gy in group:
                        self.board[gy * self.size + gx] = None
                        captured += 1
                    if len(group) == 1:
                        captured_single = group[0]

        # 自杀检查
        _, my_lib = self._group_and_liberties(x, y)
        if my_lib == 0:
            self.board[idx] = None  # 回滚
            raise ValueError("自杀禁手")

        # 判定劫
        new_ko = None
        if captured == 1:
            _, lib = self._group_and_liberties(x, y)
            if lib == 1:
                new_ko = captured_single

        self.ko_point = new_ko
        self.moves.append(MoveRecord(color=color, x=x, y=y, captured=captured))
        self.turn = self.turn.opp()
        return captured

    def _neighbors(self, x: int, y: int) -> list[tuple[int, int]]:
        v = []
        if x > 0:
            v.append((x - 1, y))
        if x + 1 < self.size:
            v.append((x + 1, y))
        if y > 0:
            v.append((x, y - 1))
        if y + 1 < self.size:
            v.append((x, y + 1))
        return v

    def _group_and_liberties(self, x: int, y: int) -> tuple[list[tuple[int, int]], int]:
        color = self.board[y * self.size + x]
        if color is None:
            return [], 0
        group: list[tuple[int, int]] = []
        visited = [False] * (self.size * self.size)
        stack = [(x, y)]
        libs: set[tuple[int, int]] = set()
        while stack:
            cx, cy = stack.pop()
            idx = cy * self.size + cx
            if visited[idx]:
                continue
            visited[idx] = True
            group.append((cx, cy))
            for nx, ny in self._neighbors(cx, cy):
                val = self.board[ny * self.size + nx]
                if val is None:
                    libs.add((nx, ny))
                elif val == color and not visited[ny * self.size + nx]:
                    stack.append((nx, ny))
        return group, len(libs)
