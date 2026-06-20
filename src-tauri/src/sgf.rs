use crate::error::{AppError, AppResult};
use crate::game_state::Color;

/// 解析 SGF 中的着手序列。pass 用 (usize::MAX, usize::MAX) 表示。
pub fn parse_moves(sgf: &str) -> AppResult<Vec<(Color, usize, usize)>> {
    let mut moves = vec![];
    let bytes = sgf.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b';' {
            i += 1;
            // 跳过空白
            while i < bytes.len() && bytes[i].is_ascii_whitespace() {
                i += 1;
            }
            if i >= bytes.len() {
                break;
            }
            let color = match bytes[i] {
                b'B' => Color::Black,
                b'W' => Color::White,
                _ => {
                    i += 1;
                    continue;
                }
            };
            i += 1;
            // 找到 '['
            while i < bytes.len() && bytes[i] != b'[' {
                i += 1;
            }
            if i >= bytes.len() {
                break;
            }
            i += 1; // 跳过 '['
            let start = i;
            while i < bytes.len() && bytes[i] != b']' {
                i += 1;
            }
            let content = &sgf[start..i];
            if content.is_empty() {
                moves.push((color, usize::MAX, usize::MAX)); // pass
            } else {
                let cb = content.as_bytes();
                if cb.len() < 2 {
                    return Err(AppError::Rule(format!("非法 SGF 坐标: {content}")));
                }
                let col = (cb[0] as u8).wrapping_sub(b'a') as usize;
                let row = (cb[1] as u8).wrapping_sub(b'a') as usize;
                moves.push((color, col, row));
            }
            // 跳过 ']'
            if i < bytes.len() {
                i += 1;
            }
        } else {
            i += 1;
        }
    }
    Ok(moves)
}

pub fn export_sgf(size: usize, moves: &[(Color, usize, usize)]) -> AppResult<String> {
    let mut out = format!("(;GM[1]FF[4]SZ[{size}]\n");
    for (color, x, y) in moves {
        let c = match color {
            Color::Black => "B",
            Color::White => "W",
        };
        let coord = if *x == usize::MAX {
            String::new()
        } else {
            let cx = (b'a' + *x as u8) as char;
            let cy = (b'a' + *y as u8) as char;
            format!("{cx}{cy}")
        };
        out.push_str(&format!(";{c}[{coord}]\n"));
    }
    out.push(')');
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_simple_sgf() {
        let sgf = "(;GM[1]SZ[9];B[ee];W[ed];B[fd])";
        let moves = parse_moves(sgf).unwrap();
        assert_eq!(moves.len(), 3);
        assert_eq!(moves[0], (Color::Black, 4, 4)); // ee -> (4,4)
        assert_eq!(moves[1], (Color::White, 4, 3)); // ed -> (4,3)
        assert_eq!(moves[2], (Color::Black, 5, 3)); // fd -> (5,3)
    }

    #[test]
    fn parse_pass_as_marker() {
        let sgf = "(;GM[1]SZ[9];B[];W[ee])";
        let moves = parse_moves(sgf).unwrap();
        assert_eq!(moves.len(), 2);
        assert_eq!(moves[0], (Color::Black, usize::MAX, usize::MAX)); // pass 标记
    }

    #[test]
    fn export_roundtrip() {
        let moves = vec![(Color::Black, 4, 4), (Color::White, 4, 3)];
        let sgf = export_sgf(9, &moves).unwrap();
        let reparsed = parse_moves(&sgf).unwrap();
        assert_eq!(reparsed, moves);
    }
}
