/// 标准 Elo 期望胜率
pub fn expected_score(rating_a: f64, rating_b: f64) -> f64 {
    1.0 / (1.0 + 10f64.powf((rating_b - rating_a) / 400.0))
}

/// 按实际得分更新 Elo。score: 胜=1.0 负=0.0。
pub fn update_elo(rating: f64, opponent: f64, score: f64, k: f64) -> f64 {
    let expected = expected_score(rating, opponent);
    rating + k * (score - expected)
}

/// 业余段位映射：1500=1d, 1600=2d, ..., 1900=5d
pub fn dan_from_elo(elo: i32) -> i32 {
    let d = (elo - 1400) / 100;
    d.clamp(1, 9)
}

/// 目标段位对应的对手 Elo（略高于用户，"跳一跳够得着"）
pub fn opponent_elo_for_training(user_elo: i32) -> i32 {
    user_elo + 100
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn expected_score_equal_rating() {
        let e = expected_score(1500.0, 1500.0);
        assert!((e - 0.5).abs() < 1e-9);
    }

    #[test]
    fn expected_score_higher_stronger() {
        let e = expected_score(1800.0, 1500.0);
        assert!(e > 0.7 && e < 1.0);
    }

    #[test]
    fn update_elo_win_increases() {
        let new = update_elo(1500.0, 1600.0, 1.0, 32.0);
        assert!(new > 1500.0);
    }

    #[test]
    fn update_elo_loss_decreases() {
        let new = update_elo(1500.0, 1400.0, 0.0, 32.0);
        assert!(new < 1500.0);
    }

    #[test]
    fn dan_from_elo_bounds() {
        assert_eq!(dan_from_elo(1500), 1);
        assert_eq!(dan_from_elo(1900), 5);
        assert_eq!(dan_from_elo(1700), 3);
    }
}
