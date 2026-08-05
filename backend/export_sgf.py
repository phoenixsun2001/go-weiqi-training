"""从 SQLite 数据库直接导出全部对局为 SGF 文件"""
import sqlite3, os, re

db_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'training.db')
out_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'sgf_games')
os.makedirs(out_dir, exist_ok=True)

conn = sqlite3.connect(db_path)
conn.row_factory = sqlite3.Row
rows = conn.execute("SELECT * FROM imported_game ORDER BY played_date").fetchall()

count = 0
for row in rows:
    date = row['played_date'] or 'unknown'
    black = re.sub(r'[^\w]', '_', row['black_name'] or '?')[:15]
    white = re.sub(r'[^\w]', '_', row['white_name'] or '?')[:15]
    result = (row['result'] or '').replace('+', '')
    filename = f"{date}_{black}_vs_{white}_{result}_{row['id']}.sgf"
    filepath = os.path.join(out_dir, filename)
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(row['sgf'])
    count += 1

conn.close()
print(f"已导出 {count} 个 SGF 文件到 {out_dir}")
