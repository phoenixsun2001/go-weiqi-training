"""Elo 棋力评级与段位映射"""


def expected_score(rating_a: float, rating_b: float) -> float:
    """标准 Elo 期望胜率"""
    return 1.0 / (1.0 + 10 ** ((rating_b - rating_a) / 400.0))


def update_elo(rating: float, opponent: float, score: float, k: float = 32.0) -> float:
    """按实际得分更新 Elo。score: 胜=1.0 负=0.0"""
    expected = expected_score(rating, opponent)
    return rating + k * (score - expected)


def dan_from_elo(elo: int) -> int:
    """业余段位映射：1500=1d, 1600=2d, ..., 1900=5d"""
    d = (elo - 1400) // 100
    return max(1, min(9, d))


def opponent_elo_for_training(user_elo: int) -> int:
    """目标段位对应的对手 Elo（略高于用户）"""
    return user_elo + 100
