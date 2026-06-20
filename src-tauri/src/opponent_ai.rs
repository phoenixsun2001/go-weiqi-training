use crate::engine_manager::EngineHandle;
use crate::error::AppResult;

/// 业余段位 -> KataGo maxVisits 近似映射（实测校准见 spec 开放问题）。
/// 弱段位用极少 visits 模拟人类失误。
pub fn dan_to_max_visits(dan: i32) -> u32 {
    match dan {
        1 => 8,
        2 => 16,
        3 => 40,
        4 => 100,
        _ => 800, // 5段及以上
    }
}

pub fn build_play_command(color: &str, vertex: &str) -> String {
    format!("play {color} {vertex}")
}

pub fn build_genmove_command(color: &str) -> String {
    format!("genmove {color}")
}

/// 在引擎上落用户的子，并生成对手的应手。
/// 返回对手应手的 GTP 顶点（如 "D4" 或 "pass" / "resign"）。
pub fn user_move_then_ai_reply(
    engine: &EngineHandle,
    user_color: &str,
    user_vertex: &str,
    ai_color: &str,
) -> AppResult<String> {
    engine.command(&build_play_command(user_color, user_vertex))?;
    let reply = engine.command(&build_genmove_command(ai_color))?;
    Ok(reply)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn dan_to_visits_decreases_with_weakness() {
        let v1 = dan_to_max_visits(1);
        let v5 = dan_to_max_visits(5);
        assert!(v1 < v5, "弱段位应 visits 更少: v1={v1} v5={v5}");
        assert!(v1 > 0);
    }

    #[test]
    fn build_gtp_play_command() {
        let cmd = build_play_command("black", "D4");
        assert_eq!(cmd, "play black D4");
    }

    #[test]
    fn genmove_command_format() {
        let cmd = build_genmove_command("white");
        assert_eq!(cmd, "genmove white");
    }
}
