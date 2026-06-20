use crate::error::{AppError, AppResult};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Color {
    Black,
    White,
}

impl Color {
    pub fn opp(self) -> Color {
        match self {
            Color::Black => Color::White,
            Color::White => Color::Black,
        }
    }

    pub fn opp_str(self) -> &'static str {
        match self {
            Color::Black => "white",
            Color::White => "black",
        }
    }
}

#[derive(Clone, Debug)]
pub struct GameState {
    size: usize,
    board: Vec<Option<Color>>, // size*size，行主序：index = y*size + x
    turn: Color,
    ko_point: Option<(usize, usize)>,
    pub moves: Vec<MoveRecord>,
}

#[derive(Clone, Debug)]
pub enum MoveRecord {
    Play {
        color: Color,
        x: usize,
        y: usize,
        captured: usize,
    },
    Pass {
        color: Color,
    },
}

impl GameState {
    pub fn new(size: usize) -> Self {
        Self {
            size,
            board: vec![None; size * size],
            turn: Color::Black,
            ko_point: None,
            moves: vec![],
        }
    }

    pub fn size(&self) -> usize {
        self.size
    }

    pub fn turn(&self) -> Color {
        self.turn
    }

    pub fn stone_at(&self, (x, y): (usize, usize)) -> Option<Color> {
        self.board[y * self.size + x]
    }

    /// 测试辅助：直接摆子，不走规则
    pub fn set_stone(&mut self, color: Color, (x, y): (usize, usize)) {
        self.board[y * self.size + x] = Some(color);
    }

    /// 测试辅助：直接设劫点
    pub fn set_ko_point(&mut self, pt: Option<(usize, usize)>) {
        self.ko_point = pt;
    }

    pub fn pass(&mut self, color: Color) -> AppResult<()> {
        if color != self.turn {
            return Err(AppError::Rule("非该方回合".into()));
        }
        self.moves.push(MoveRecord::Pass { color });
        self.turn = self.turn.opp();
        self.ko_point = None;
        Ok(())
    }

    pub fn play(&mut self, color: Color, pt: (usize, usize)) -> AppResult<usize> {
        let (x, y) = pt;
        if color != self.turn {
            return Err(AppError::Rule("非该方回合".into()));
        }
        if x >= self.size || y >= self.size {
            return Err(AppError::Rule(format!("坐标越界 ({x},{y})")));
        }
        if self.board[y * self.size + x].is_some() {
            return Err(AppError::Rule("该点已有子".into()));
        }
        if self.ko_point == Some(pt) {
            return Err(AppError::Rule("劫争禁手（不可立即回提）".into()));
        }

        // 试落
        self.board[y * self.size + x] = Some(color);
        let opp = color.opp();

        // 提对方无气棋串
        let mut captured = 0usize;
        let mut captured_single: Option<(usize, usize)> = None;
        for (nx, ny) in self.neighbors(x, y) {
            if self.board[ny * self.size + nx] == Some(opp) {
                let (group, liberties) = self.group_and_liberties(nx, ny);
                if liberties == 0 {
                    for &(gx, gy) in &group {
                        self.board[gy * self.size + gx] = None;
                        captured += 1;
                    }
                    if group.len() == 1 {
                        captured_single = group.first().copied();
                    }
                }
            }
        }

        // 自杀检查
        let (_, my_lib) = self.group_and_liberties(x, y);
        if my_lib == 0 {
            // 回滚
            self.board[y * self.size + x] = None;
            return Err(AppError::Rule("自杀禁手".into()));
        }

        // 判定劫：恰提一子且自己也只一子且只有一气
        let new_ko = if captured == 1 {
            let (_, lib) = self.group_and_liberties(x, y);
            if lib == 1 {
                captured_single
            } else {
                None
            }
        } else {
            None
        };
        self.ko_point = new_ko;

        self.moves.push(MoveRecord::Play {
            color,
            x,
            y,
            captured,
        });
        self.turn = self.turn.opp();
        Ok(captured)
    }

    fn neighbors(&self, x: usize, y: usize) -> Vec<(usize, usize)> {
        let mut v = vec![];
        if x > 0 {
            v.push((x - 1, y));
        }
        if x + 1 < self.size {
            v.push((x + 1, y));
        }
        if y > 0 {
            v.push((x, y - 1));
        }
        if y + 1 < self.size {
            v.push((x, y + 1));
        }
        v
    }

    /// 从 (x,y) 出发的同色连通块及其气数
    fn group_and_liberties(&self, x: usize, y: usize) -> (Vec<(usize, usize)>, usize) {
        let color = match self.board[y * self.size + x] {
            Some(c) => c,
            None => return (vec![], 0),
        };
        let mut group = vec![];
        let mut visited = vec![false; self.size * self.size];
        let mut stack = vec![(x, y)];
        let mut libs = std::collections::HashSet::new();
        while let Some((cx, cy)) = stack.pop() {
            let idx = cy * self.size + cx;
            if visited[idx] {
                continue;
            }
            visited[idx] = true;
            group.push((cx, cy));
            for (nx, ny) in self.neighbors(cx, cy) {
                match self.board[ny * self.size + nx] {
                    None => {
                        libs.insert((nx, ny));
                    }
                    Some(c) if c == color => {
                        if !visited[ny * self.size + nx] {
                            stack.push((nx, ny));
                        }
                    }
                    _ => {}
                }
            }
        }
        (group, libs.len())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empty_board_black_to_move() {
        let gs = GameState::new(9);
        assert_eq!(gs.turn(), Color::Black);
        assert_eq!(gs.size(), 9);
    }

    #[test]
    fn play_alternates_turn() {
        let mut gs = GameState::new(9);
        assert!(gs.play(Color::Black, (0, 0)).is_ok());
        assert_eq!(gs.turn(), Color::White);
        assert!(gs.play(Color::White, (1, 1)).is_ok());
        assert_eq!(gs.turn(), Color::Black);
    }

    #[test]
    fn capture_removes_group() {
        // 9路角部提子：白(0,0) 被黑(1,0) 与 (0,1) 包围后提掉。
        // 严格交替：W B W B W B
        let mut gs = GameState::new(9);
        gs.play(Color::Black, (8, 8)).unwrap(); // 黑占位（第一手黑）
        gs.play(Color::White, (0, 0)).unwrap(); // 白下角
        gs.play(Color::Black, (8, 7)).unwrap(); // 黑占位
        gs.play(Color::White, (8, 6)).unwrap(); // 白占位
        gs.play(Color::Black, (1, 0)).unwrap(); // 黑堵白(0,0)右气
        gs.play(Color::White, (8, 5)).unwrap(); // 白占位
        let captured = gs.play(Color::Black, (0, 1)).unwrap(); // 黑堵上气 -> 提白(0,0)
        assert_eq!(captured, 1);
        assert_eq!(gs.stone_at((0, 0)), None, "白子应被提掉");
    }

    #[test]
    fn suicide_forbidden() {
        // 白 (0,0) 已是白子，黑往内部填形成自杀（构造简单自杀）
        let mut gs = GameState::new(9);
        gs.set_stone(Color::White, (1, 0));
        gs.set_stone(Color::White, (0, 1));
        // 黑下 (0,0)：无气且未提对方子 => 自杀
        let res = gs.play(Color::Black, (0, 0));
        assert!(res.is_err(), "自杀应被拒绝");
    }

    #[test]
    fn simple_ko_forbidden() {
        // 直接设劫点，验证回提被拒
        let mut gs = GameState::new(9);
        gs.set_ko_point(Some((1, 1)));
        let res = gs.play(Color::White, (1, 1));
        assert!(res.is_err(), "劫点回提应被拒绝");
    }

    #[test]
    fn pass_passes() {
        let mut gs = GameState::new(9);
        assert!(gs.pass(Color::Black).is_ok());
        assert_eq!(gs.turn(), Color::White);
    }

    #[test]
    fn wrong_turn_rejected() {
        let mut gs = GameState::new(9);
        // 第一手白下应被拒（黑先）
        let res = gs.play(Color::White, (4, 4));
        assert!(res.is_err());
    }

    #[test]
    fn occupied_point_rejected() {
        let mut gs = GameState::new(9);
        gs.play(Color::Black, (4, 4)).unwrap();
        gs.play(Color::White, (5, 5)).unwrap();
        let res = gs.play(Color::Black, (4, 4));
        assert!(res.is_err(), "已有子的点不能再下");
    }
}
