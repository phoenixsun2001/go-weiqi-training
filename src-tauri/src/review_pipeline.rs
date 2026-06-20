use crate::engine_manager::EngineHandle;
use crate::error::{AppError, AppResult};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum MoveKind {
    Good,
    Inaccuracy,
    Blunder,
}

/// 按胜率损失分类某手棋。loss = best - played（越大越差）。
pub fn classify_move(best_wr: f64, played_wr: f64, threshold: f64) -> MoveKind {
    let loss = best_wr - played_wr;
    if loss < threshold {
        MoveKind::Good
    } else if loss < 0.10 {
        MoveKind::Inaccuracy
    } else {
        MoveKind::Blunder
    }
}

/// 从 lz-analyze/kata-analyze 输出行提取胜率（0..1）
pub fn extract_winrate(line: &str) -> AppResult<f64> {
    let parts: Vec<&str> = line.split_whitespace().collect();
    for i in 0..parts.len() {
        if parts[i] == "winrate" && i + 1 < parts.len() {
            let v: f64 = parts[i + 1]
                .parse()
                .map_err(|_| AppError::Engine(format!("非法 winrate: {}", parts[i + 1])))?;
            // KataGo winrate 为 0..10000（百分比*100）
            return Ok(if v > 1.0 { v / 10000.0 } else { v });
        }
    }
    Err(AppError::Engine(format!("未找到 winrate: {line}")))
}

pub struct MoveAnalysis {
    pub move_index: usize,
    pub best_winrate: f64,
    pub played_winrate: f64,
    pub kind: MoveKind,
    pub best_move: String,
}

/// 对给定走法序列回放每一步，在分析引擎上记录每手胜率与分类。
pub fn analyze_game(
    engine: &EngineHandle,
    size: usize,
    moves: &[(crate::game_state::Color, usize, usize)],
    threshold: f64,
) -> AppResult<Vec<MoveAnalysis>> {
    use crate::coords::xy_to_gtp;
    use crate::game_state::Color;
    let mut results = vec![];
    // 清空引擎棋盘
    engine.command("clear_board")?;
    for (i, (color, x, y)) in moves.iter().enumerate() {
        let col_str = match color {
            Color::Black => "black",
            Color::White => "white",
        };
        // 先分析当前局面最佳
        let analyze = engine.command(&format!("lz-analyze {col_str} 1"))?;
        let best_wr = extract_winrate(&analyze).unwrap_or(0.5);
        let best_move = analyze
            .split_whitespace()
            .find(|t| t.starts_with("move"))
            .and_then(|t| t.strip_prefix("move").map(|s| s.trim().to_string()))
            .unwrap_or_default();
        // 落实际子
        let vertex = if *x == usize::MAX {
            "pass".to_string()
        } else {
            xy_to_gtp(*x, *y, size)?
        };
        let played_wr = {
            engine.command(&format!("play {col_str} {vertex}"))?;
            let a2 = engine.command(&format!("lz-analyze {} 1", color.opp_str()))?;
            // 对手视角胜率，转换为己方
            1.0 - extract_winrate(&a2).unwrap_or(0.5)
        };
        let kind = classify_move(best_wr, played_wr, threshold);
        results.push(MoveAnalysis {
            move_index: i,
            best_winrate: best_wr,
            played_winrate: played_wr,
            kind,
            best_move,
        });
    }
    Ok(results)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn marks_move_as_blunder_when_loss_exceeds_threshold() {
        let kind = classify_move(0.55, 0.40, 0.03);
        assert_eq!(kind, MoveKind::Blunder);
    }

    #[test]
    fn marks_move_as_good_when_close_to_best() {
        let kind = classify_move(0.55, 0.54, 0.03);
        assert_eq!(kind, MoveKind::Good);
    }

    #[test]
    fn marks_move_as_inaccuracy_in_between() {
        let kind = classify_move(0.60, 0.55, 0.03);
        assert_eq!(kind, MoveKind::Inaccuracy);
    }

    #[test]
    fn parse_analyze_line_extracts_winrate() {
        let line = "info move D4 visits 123 winrate 5400 prior 0.5 pv D4 Q16";
        let wr = extract_winrate(line).unwrap();
        assert!((wr - 0.54).abs() < 1e-9);
    }
}
