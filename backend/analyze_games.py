"""分析 JadenSai 全部对局的统计与棋型模式"""
import os, re, json
from collections import Counter, defaultdict

sgf_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'sgf_games')
files = sorted([f for f in os.listdir(sgf_dir) if f.endswith('.sgf')])


def classify_opening(x, y):
    """根据坐标判断开局点"""
    corners = {
        (3,3): '三三', (4,4): '星位',
        (3,4): '小目', (4,3): '小目',
        (3,5): '高目', (5,3): '高目',
        (4,5): '目外', (5,4): '目外',
    }
    mx = min(x, 18-x)
    my = min(y, 18-y)
    return corners.get((mx, my), f'其他({x},{y})')

total = 0
wins = losses = 0
as_black = as_white = 0
black_wins = white_wins = 0
loss_types = Counter()
win_types = Counter()
move_counts = []
months = Counter()
early_resign = []
results_detail = []

# 棋型分析数据
first_moves = []  # JadenSai 的开局首手
corner_moves = Counter()  # 角部选点
side_moves = Counter()  # 边部选点
game_phases = []  # 每局各阶段手数比例
pass_games = 0
ko_games = 0

for fname in files:
    with open(os.path.join(sgf_dir, fname), 'r', encoding='utf-8') as f:
        sgf = f.read()
    
    total += 1
    
    re_match = re.search(r'RE\[([^\]]*)\]', sgf)
    result = re_match.group(1) if re_match else ''
    
    moves_raw = re.findall(r';([BW])\[([a-z]{2}|)\]', sgf)
    move_count = len([m for m in moves_raw if m[1]])  # 不含pass
    move_counts.append(move_count)
    
    dt_match = re.search(r'DT\[([^\]]*)\]', sgf)
    if dt_match:
        months[dt_match.group(1)[:7]] += 1
    
    pb = re.search(r'PB\[([^\]]*)\]', sgf)
    pw = re.search(r'PW\[([^\]]*)\]', sgf)
    black_name = pb.group(1) if pb else ''
    white_name = pw.group(1) if pw else ''
    is_black = 'JadenSai' in black_name
    
    if is_black:
        as_black += 1
    else:
        as_white += 1
    
    won = (result.startswith('B+') and is_black) or (result.startswith('W+') and not is_black)
    
    reason = ''
    if 'R' in result: reason = 'resign'
    elif 'T' in result: reason = 'timeout'
    elif result and result[2:].replace('.','').isdigit(): reason = 'point'
    else: reason = 'midboard'
    
    if won:
        wins += 1
        win_types[reason] += 1
        if is_black: black_wins += 1
        else: white_wins += 1
    else:
        losses += 1
        loss_types[reason] += 1
        if reason == 'resign' and move_count < 60:
            early_resign.append((fname, move_count))
    
    # 分析JadenSai的开局选点（前4手）
    jaden_moves = []
    for color, coord in moves_raw[:8]:
        if is_black and color == 'B':
            jaden_moves.append(coord)
        elif not is_black and color == 'W':
            jaden_moves.append(coord)
    
    for coord in jaden_moves[:4]:
        if len(coord) == 2:
            x = ord(coord[0]) - ord('a')
            y = ord(coord[1]) - ord('a')
            # 判断星位/小目/三三/高目/目外
            pos = classify_opening(x, y)
            corner_moves[pos] += 1
    
    results_detail.append({
        'file': fname, 'result': result, 'moves': move_count,
        'won': won, 'is_black': is_black, 'reason': reason
    })

def classify_opening(x, y):
    """根据坐标判断开局点"""
    # 19路棋盘的角部常见点
    corners = {
        (3,3): '三三', (3,15): '三三', (15,3): '三三', (15,15): '三三',
        (3,4): '小目', (4,3): '小目', (3,16): '小目', (4,15): '小目',
        (15,4): '小目', (16,3): '小目', (15,16): '小目', (16,15): '小目',
        (4,4): '星位', (4,16): '星位', (16,4): '星位', (16,16): '星位',
        (3,5): '高目', (5,3): '高目', (3,17): '高目', (5,15): '高目',
        (4,5): '目外', (5,4): '目外',
    }
    # 镜像到左上角
    mx = min(x, 18-x)
    my = min(y, 18-y)
    return corners.get((mx, my), f'其他({x},{y})')

# 输出报告
print("=" * 60)
print("JadenSai 93局对局综合分析报告")
print("=" * 60)

print(f"\n【总览】")
print(f"  总对局: {total}局 | 胜: {wins} | 负: {losses} | 胜率: {wins/total*100:.1f}%")
print(f"  执黑: {as_black}局(胜{black_wins}, 胜率{black_wins/max(as_black,1)*100:.0f}%)")
print(f"  执白: {as_white}局(胜{white_wins}, 胜率{white_wins/max(as_white,1)*100:.0f}%)")

print(f"\n【负局类型分析】")
for r, c in loss_types.most_common():
    label = {'resign':'认输', 'timeout':'超时', 'midboard':'中盘', 'point':'点目'}[r]
    print(f"  {label}: {c}局 ({c/max(losses,1)*100:.0f}%)")

print(f"\n【胜局类型分析】")
for r, c in win_types.most_common():
    label = {'resign':'对手认输', 'timeout':'对手超时', 'midboard':'中盘胜', 'point':'点目胜'}[r]
    print(f"  {label}: {c}局")

avg_moves = sum(move_counts) / len(move_counts)
short = [m for m in move_counts if m < 80]
mid = [m for m in move_counts if 80 <= m < 180]
long_g = [m for m in move_counts if m >= 180]
print(f"\n【手数分析】")
print(f"  平均: {avg_moves:.0f}手 | 最短: {min(move_counts)}手 | 最长: {max(move_counts)}手")
print(f"  <80手(速败/速胜): {len(short)}局 | 80-179手: {len(mid)}局 | ≥180手(持久战): {len(long_g)}局")

print(f"\n【开局选点统计】(JadenSai前4手)")
for pos, c in corner_moves.most_common(10):
    print(f"  {pos}: {c}次")

print(f"\n【月度趋势】")
for m in sorted(months):
    month_games = [d for d in results_detail if d['file'].startswith(m)]
    mw = sum(1 for d in month_games if d['won'])
    print(f"  {m}: {months[m]}局, 胜率{mw/max(months[m],1)*100:.0f}%")

if early_resign:
    print(f"\n【早期认输(<60手)】({len(early_resign)}局)")
    for fname, mc in early_resign[:5]:
        print(f"  {fname}: 仅{mc}手")

# 分析胜负与手数的关系
win_moves = [d['moves'] for d in results_detail if d['won']]
loss_moves = [d['moves'] for d in results_detail if not d['won']]
if win_moves and loss_moves:
    print(f"\n【胜负与手数关系】")
    print(f"  胜局平均: {sum(win_moves)/len(win_moves):.0f}手")
    print(f"  负局平均: {sum(loss_moves)/len(loss_moves):.0f}手")

# 点目胜负的分差
point_games = [d for d in results_detail if d['reason'] == 'point']
if point_games:
    margins = []
    for d in point_games:
        try:
            margin = float(d['result'][2:])
            margins.append(margin)
        except:
            pass
    if margins:
        print(f"\n【点目分差】")
        print(f"  最大: {max(margins):.1f} | 最小: {min(margins):.1f} | 平均: {sum(margins)/len(margins):.1f}")
        big = [m for m in margins if m > 10]
        close = [m for m in margins if m <= 3]
        print(f"  大败/大胜(>10目): {len(big)}局 | 险胜/惜败(≤3目): {len(close)}局")

print("\n" + "=" * 60)
