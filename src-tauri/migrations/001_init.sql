CREATE TABLE IF NOT EXISTS profile (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    elo INTEGER NOT NULL DEFAULT 1500,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS game (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    played_at TEXT NOT NULL,
    user_color TEXT NOT NULL,
    result TEXT NOT NULL,
    opponent_target_dan INTEGER NOT NULL,
    user_elo_before INTEGER NOT NULL,
    user_elo_after INTEGER NOT NULL,
    sgf TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS rating_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    recorded_at TEXT NOT NULL,
    elo INTEGER NOT NULL
);
