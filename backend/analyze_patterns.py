"""深度棋型分析：布局模式、中盘战斗特征、官子习惯"""
import os, re
from collections import Counter, defaultdict

sgf_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'sgf_games')
files = sorted([f for f in os.listdir(sgf_dir) if f.endswith('.sgf')])

# 分析维度
opening_patterns = Counter()  # 布局模式
fuseki_types = Counter()      # 布局类型（星/小目/中国流等）
invasion_count = 0            # 侵入次数
contact_fight_early = 0       # 早期接触战（前20手内）
endgame_point_diff = []       # 官子分差
territory_balance = []        # 实地平衡
third_row_moves = Counter()   # 三线选点
fourth_row_moves = Counter()  # 四线选点
fifth_row_moves = Counter()   # 五线选点
center_moves = 0
edge_contact = 0
jaden_first_move = Counter()  # JadenSai 第一手
second_move_response = Counter()  # 第二手回应模式

# 详细分析每局
for fname in files:
    with open(os.path.join(sgf_dir, fname), 'r', encoding='utf-8') as f:
        sgf = f.read()
    
    pb = re.search(r'PB\[([^\]]*)\]', sgf)
    pw = re.search(r'PW\[([^\]]*)\]', sgf)
    is_black = 'JadenSai' in (pb.group(1) if pb else '')
    
    moves = re.findall(r';([BW])\[([a-z]{2}|)\]', sgf)
    play_moves = [(c, coord) for c, coord in moves if coord]
    
    if not play_moves:
        continue
    
    # JadenSai 第一手
    first_jaden = None
    for color, coord in play_moves[:4]:
        if (is_black and color == 'B') or (not is_black and color == 'W'):
            first_jaden = coord
            break
    
    if first_jaden and len(first_jaden) == 2:
        x = ord(first_jaden[0]) - ord('a')
        y = ord(first_jaden[1]) - ord('a')
        # 归类为星位附近/小目附近/其他
        mx = min(x, 18-x)
        my = min(y, 18-y)
        if (mx, my) == (4,4):
            jaden_first_move['星位'] += 1
        elif (mx,my) in [(3,4),(4,3)]:
            jaden_first_move['小目'] += 1
        elif (mx,my) in [(3,3)]:
            jaden_first_move['三三'] += 1
        elif (mx,my) in [(3,5),(5,3)]:
            jaden_first_move['高目'] += 1
        elif (mx,my) in [(4,5),(5,4)]:
            jaden_first_move['目外'] += 1
        else:
            jaden_first_move[f'({mx},{my})'] += 1
    
    # 前10手的布局模式（判断是否中国流/小目守角等）
    first_10 = play_moves[:10]
    star_count = 0
    for color, coord in first_10:
        if len(coord) == 2:
            x = ord(coord[0]) - ord('a')
            y = ord(coord[1]) - ord('a')
            mx = min(x, 18-x)
            my = min(y, 18-y)
            if (mx,my) == (4,4):
                star_count += 1
    
    if star_count >= 3:
        fuseki_types['多星位布局'] += 1
    elif star_count == 2:
        fuseki_types['双星位'] += 1
    elif star_count == 1:
        fuseki_types['单星位'] += 1
    else:
        fuseki_types['非星位布局'] += 1
    
    # 前20手内是否有接触战（非角部直接贴身）
    early_contact = False
    for i, (color, coord) in enumerate(first_10[4:], 5):  # 第5手以后
        if len(coord) != 2:
            continue
        x = ord(coord[0]) - ord('a')
        y = ord(coord[1]) - ord('a')
        # 检查是否与已有棋子相邻（贴身）
        for j in range(max(0, i-1), -1, -1):
            if j >= len(first_10):
                continue
            _, prev_coord = first_10[j]
            if len(prev_coord) != 2:
                continue
            px = ord(prev_coord[0]) - ord('a')
            py = ord(prev_coord[1]) - ord('a')
            dist = abs(x-px) + abs(y-py)
            if dist == 1 and i < 15:  # 前15手内贴身
                early_contact = True
                break
        if early_contact:
            break
    if early_contact:
        contact_fight_early += 1
    
    # 全局选点线分析
    for color, coord in play_moves:
        if len(coord) != 2:
            continue
        x = ord(coord[0]) - ord('a')
        y = ord(coord[1]) - ord('a')
        row = min(y, 18-y)  # 距边线
        col = min(x, 18-x)
        edge_dist = min(row, col)
        if edge_dist == 2:
            third_row_moves[f'线{edge_dist}'] += 1
        elif edge_dist == 3:
            fourth_row_moves[f'线{edge_dist}'] += 1
        elif edge_dist == 4:
            fifth_row_moves[f'线{edge_dist}'] += 1
        elif edge_dist >= 5:
            center_moves += 1
    
    # 点目分差分析
    re_match = re.search(r'RE\[([^\]]*)\]', sgf)
    result = re_match.group(1) if re_match else ''
    if result and result[2:].replace('.','').isdigit():
        pts = float(result[2:])
        endgame_point_diff.append(pts)

# 输出
print("=" * 60)
print("JadenSai 棋型深度分析")
print("=" * 60)

print(f"\n【开局习惯 - JadenSai第一手选点】")
for pos, c in jaden_first_move.most_common():
    pct = c / sum(jaden_first_move.values()) * 100
    print(f"  {pos}: {c}次 ({pct:.0f}%)")

print(f"\n【布局类型分布】")
for t, c in fuseki_types.most_common():
    print(f"  {t}: {c}局")

print(f"\n【早期接触战（前15手贴身）】")
print(f"  发生: {contact_fight_early}/{len(files)}局 ({contact_fight_early/len(files)*100:.0f}%)")
print(f"  → {'早期容易发生接触战，布局不够从容' if contact_fight_early > len(files)*0.3 else '布局较为从容'}")

total_moves = sum(third_row_moves.values()) + sum(fourth_row_moves.values()) + sum(fifth_row_moves.values()) + center_moves
print(f"\n【选点位置分布（全局）】")
if total_moves > 0:
    print(f"  三线（实地线）: {sum(third_row_moves.values())} ({sum(third_row_moves.values())/total_moves*100:.0f}%)")
    print(f"  四线（势力线）: {sum(fourth_row_moves.values())} ({sum(fourth_row_moves.values())/total_moves*100:.0f}%)")
    print(f"  五线（高位）: {sum(fifth_row_moves.values())} ({sum(fifth_row_moves.values())/total_moves*100:.0f}%)")
    print(f"  中腹（五线以上）: {center_moves} ({center_moves/total_moves*100:.0f}%)")

if endgame_point_diff:
    big_loss = [p for p in endgame_point_diff if p > 10]
    close = [p for p in endgame_point_diff if p <= 3]
    print(f"\n【官子能力分析（点目局）】")
    print(f"  点目局共{len(endgame_point_diff)}局")
    print(f"  大分差(>10目): {len(big_loss)}局 → {'官子收束能力不足，容易出现大败' if len(big_loss) > 3 else '官子能力尚可'}")
    print(f"  险胜/惜败(≤3目): {len(close)}局 → {'官子细腻，胜负在毫厘之间' if len(close) > 3 else ''}")
    print(f"  平均分差: {sum(endgame_point_diff)/len(endgame_point_diff):.1f}目")

print("\n" + "=" * 60)
