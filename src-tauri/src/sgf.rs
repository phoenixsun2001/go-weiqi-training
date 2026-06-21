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

/// 从死活题 SGF 的变化树中提取正解第一手。
/// 在包含 "Correct" 的分支路径上，找到第一个 B[..] 或 W[..] 的着手。
/// 返回 GPT 顶点（大写，如 "Q16"），可能有多个正解则取第一个。
pub fn extract_tsumego_answer(sgf: &str) -> Option<String> {
    // 查找 "Correct" 标记所在的分支
    // 死活题结构：(;...setup...(;B[xx];W[yy](;B[zz]C[Correct])(;B[aa]))...)
    // 正解是到达 Correct 之前的第一手黑棋（通常是主分支的第一个 B[..]）

    // 策略1: 找 C[Correct] 之前的最后一个 B[xx]
    // 找到 Correct 之前最近的 B[...] 作为正解
    if let Some(correct_pos) = sgf.find("Correct") {
        let before = &sgf[..correct_pos];
        // 从 Correct 位置往前找最近的 B[xx]
        // 在 SGF 变化树中，到达 Correct 的路径就是正解手
        // 找到 Correct 所在的子树，往前回溯到第一个 B[xx]
        return find_last_move_before(before);
    }
    // 如果没有 Correct 标记，取第一个 B[xx] 作为答案
    find_first_black_move(sgf)
}

fn find_last_move_before(text: &str) -> Option<String> {
    // 找所有 B[xx] 的最后一个
    let mut last: Option<String> = None;
    let bytes = text.as_bytes();
    let mut i = 0;
    while i + 2 < bytes.len() {
        if bytes[i] == b';' && (bytes[i + 1] == b'B' || bytes[i + 1] == b'W') && bytes[i + 2] == b'[' {
            // 提取 [xx] 内容
            let start = i + 3;
            if let Some(end) = text[start..].find(']') {
                let coord = &text[start..start + end];
                if coord.len() == 2 {
                    // SGF 小写坐标转 GTP 顶点
                    last = Some(sgf_coord_to_gtp(coord));
                }
            }
        }
        i += 1;
    }
    last
}

fn find_first_black_move(sgf: &str) -> Option<String> {
    let bytes = sgf.as_bytes();
    let mut i = 0;
    while i + 2 < bytes.len() {
        if bytes[i] == b';' && bytes[i + 1] == b'B' && bytes[i + 2] == b'[' {
            let start = i + 3;
            if let Some(end) = sgf[start..].find(']') {
                let coord = &sgf[start..start + end];
                if coord.len() == 2 {
                    return Some(sgf_coord_to_gtp(coord));
                }
            }
        }
        i += 1;
    }
    None
}

/// SGF 小写坐标 "pq" 转 GTP 大写顶点 "P4"
fn sgf_coord_to_gpt(coord: &str) -> String {
    let cb = coord.as_bytes();
    if cb.len() < 2 {
        return String::new();
    }
    let x = cb[0] - b'a'; // 0-based
    let y = cb[1] - b'a';
    // GTP 列：跳过 I
    let col = if x < 8 {
        (b'A' + x) as char
    } else {
        (b'A' + x + 1) as char
    };
    // GTP 行：从下到上，需要知道棋盘大小
    // 简化：用 19 路标准，y=0 是顶部 → GTP 行 = 19 - y
    let row = 19 - y;
    format!("{col}{row}")
}

// 保留原名兼容
fn sgf_coord_to_gtp(coord: &str) -> String {
    sgf_coord_to_gpt(coord)
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

