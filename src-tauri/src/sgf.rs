use crate::error::{AppError, AppResult};
use crate::game_state::Color;

/// SGF 元数据
pub struct SgfMetadata {
    pub black_name: String,   // PB[xxx]
    pub white_name: String,   // PW[xxx]
    pub black_rank: String,   // BR[xxx]
    pub white_rank: String,   // WR[xxx]
    pub result: String,       // RE[xxx]
    pub board_size: usize,    // SZ[xxx]
    pub played_date: String,  // DT[xxx]
    pub move_count: usize,
}

/// 从 SGF 中提取属性值：找 `KEY[...]` 返回括号内容（取第一个匹配）
fn extract_property(sgf: &str, key: &str) -> String {
    let pattern = format!("{key}[");
    if let Some(start) = sgf.find(&pattern) {
        let content_start = start + pattern.len();
        if let Some(end) = sgf[content_start..].find(']') {
            return sgf[content_start..content_start + end].to_string();
        }
    }
    String::new()
}

/// 解析 SGF 元数据（双方名字/段位/结果/棋盘/日期/手数）
pub fn parse_metadata(sgf: &str) -> SgfMetadata {
    let board_size = extract_property(sgf, "SZ")
        .parse::<usize>()
        .unwrap_or(19);
    let move_count = parse_moves(sgf)
        .map(|m| m.len())
        .unwrap_or(0);
    SgfMetadata {
        black_name: extract_property(sgf, "PB"),
        white_name: extract_property(sgf, "PW"),
        black_rank: extract_property(sgf, "BR"),
        white_rank: extract_property(sgf, "WR"),
        result: extract_property(sgf, "RE"),
        board_size,
        played_date: extract_property(sgf, "DT"),
        move_count,
    }
}

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

    #[test]
    fn parse_foxwq_metadata() {
        let sgf = "(;GM[1]FF[4]SZ[19]PB[柯洁]BR[9d]PW[申真谞]WR[9d]RE[B+2.5]DT[2024-03-15];B[qd];W[dd])";
        let m = parse_metadata(sgf);
        assert_eq!(m.black_name, "柯洁");
        assert_eq!(m.white_name, "申真谞");
        assert_eq!(m.black_rank, "9d");
        assert_eq!(m.white_rank, "9d");
        assert_eq!(m.result, "B+2.5");
        assert_eq!(m.board_size, 19);
        assert_eq!(m.played_date, "2024-03-15");
        assert_eq!(m.move_count, 2);
    }

    #[test]
    fn parse_metadata_defaults_when_missing() {
        let sgf = "(;GM[1]SZ[13];B[ee])";
        let m = parse_metadata(sgf);
        assert_eq!(m.black_name, "");
        assert_eq!(m.board_size, 13);
        assert_eq!(m.move_count, 1);
        assert_eq!(m.result, "");
    }
}

