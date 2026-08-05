"""
JadenSai 93局逐盘深度分析
分析维度：布局选点质量、布局节奏、中盘特征、官子表现、胜负原因
当前棋力：业余2段 → 目标：业余5段
"""
import os, re, json
from collections import Counter

sgf_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'sgf_games')
files = sorted([f for f in os.listdir(sgf_dir) if f.endswith('.sgf')])

results = []

for fname in files:
    with open(os.path.join(sgf_dir, fname), 'r', encoding='utf-8') as f:
        sgf = f.read()

    # 基本信息
    pb = re.search(r'PB\[([^\]]*)\]', sgf)
    pw = re.search(r'PW\[([^\]]*)\]', sgf)
    re_match = re.search(r'RE\[([^\]]*)\]', sgf)
    dt_match = re.search(r'DT\[([^\]]*)\]', sgf)
    sz_match = re.search(r'SZ\[([^\]]*)\]', sgf)

    black_name = pb.group(1) if pb else '?'
    white_name = pw.group(1) if pw else '?'
    result_str = re_match.group(1) if re_match else ''
    date = (dt_match.group(1) if dt_match else '')[:10]
    size = int(sz_match.group(1)) if sz_match else 19

    is_jaden_black = 'JadenSai' in black_name
    jaden_color = 'B' if is_jaden_black else 'W'

    # 解析全部着手
    moves = re.findall(r';([BW])\[([a-z]{2}|)\]', sgf)
    play_moves = [(c, coord) for c, coord in moves if coord and len(coord) == 2]
    total_moves = len(play_moves)
    passes = len(moves) - len(play_moves)

    # 判定胜负
    won = (result_str.startswith('B+') and is_jaden_black) or (result_str.startswith('W+') and not is_jaden_black)
    result_label = '胜' if won else '负'

    # 结果类型
    reason = ''
    margin = 0
    if 'R' in result_str:
        reason = '认输'
    elif 'T' in result_str:
        reason = '超时'
    elif result_str and result_str[2:]:
        try:
            margin = float(result_str[2:])
            reason = f'点目{margin}'
        except:
            reason = '中盘'
    else:
        reason = '中盘'

    opp_name = white_name if is_jaden_black else black_name
    opp_rank = ''
    br = re.search(r'BR\[([^\]]*)\]', sgf)
    wr = re.search(r'WR\[([^\]]*)\]', sgf)
    if is_jaden_black:
        opp_rank = wr.group(1) if wr else ''
        jaden_rank = br.group(1) if br else ''
    else:
        opp_rank = br.group(1) if br else ''
        jaden_rank = wr.group(1) if wr else ''

    # ===== 布局分析（前30手）=====
    opening_moves = play_moves[:30]
    corners_taken = 0
    stars_taken = 0
    small_eyes = 0
    third_line = 0
    second_line = 0
    first_line = 0
    center_early = 0
    early_contact = False
    jaden_opening_moves = []

    for i, (color, coord) in enumerate(opening_moves):
        x = ord(coord[0]) - ord('a')
        y = ord(coord[1]) - ord('a')
        mx = min(x, size-1-x)
        my = min(y, size-1-y)
        edge_dist = min(mx, my)

        # 角部判断
        if mx <= 5 and my <= 5:
            corners_taken += 1
            if (mx, my) == (3,3) or (mx,my) == (4,4):
                if (mx,my) == (4,4): stars_taken += 1
                else: small_eyes += 1

        # 线判断
        if edge_dist == 0: first_line += 1
        elif edge_dist == 1: second_line += 1
        elif edge_dist == 2: third_line += 1
        elif edge_dist >= 5 and i < 15: center_early += 1

        # JadenSai 的布局选点
        if color == jaden_color:
            jaden_opening_moves.append((mx, my, edge_dist))

        # 早期接触检测（前12手）
        if i >= 4 and i < 12:
            for j in range(max(0,i-3), i):
                if j < len(opening_moves):
                    _, pc = opening_moves[j]
                    if len(pc) == 2:
                        px = ord(pc[0]) - ord('a')
                        py = ord(pc[1]) - ord('a')
                        if abs(x-px) + abs(y-py) <= 1:
                            early_contact = True

    # JadenSai 第一手质量评分
    jaden_first = jaden_opening_moves[0] if jaden_opening_moves else (0,0,0)
    fx, fy, fed = jaden_first
    first_move_quality = ''
    first_move_score = 0
    if (fx, fy) == (3,3):
        first_move_quality = '三三'; first_move_score = 3
    elif (fx, fy) == (4,4):
        first_move_quality = '星位'; first_move_score = 3
    elif (fx, fy) in [(3,4),(4,3)]:
        first_move_quality = '小目'; first_move_score = 3
    elif (fx, fy) in [(3,5),(5,3)]:
        first_move_quality = '高目'; first_move_score = 2
    elif (fx, fy) in [(4,5),(5,4)]:
        first_move_quality = '目外'; first_move_score = 2
    elif fed <= 1:
        first_move_quality = f'二线({fx},{fy})'; first_move_score = 0
    else:
        first_move_quality = f'非标准({fx},{fy})'; first_move_score = 1

    # 布局评分（0-5分）
    opening_score = 0
    if stars_taken + small_eyes >= 3: opening_score += 2
    elif stars_taken + small_eyes >= 1: opening_score += 1
    if not early_contact: opening_score += 1
    if second_line + first_line <= 2: opening_score += 1
    if center_early <= 1: opening_score += 1

    # ===== 中盘分析（30-150手）=====
    midgame_moves = play_moves[30:150] if len(play_moves) > 30 else []
    mid_center = 0
    mid_third = 0
    mid_fourth = 0
    mid_contact = 0

    for color, coord in midgame_moves:
        x = ord(coord[0]) - ord('a')
        y = ord(coord[1]) - ord('a')
        ed = min(min(x,size-1-x), min(y,size-1-y))
        if ed >= 5: mid_center += 1
        elif ed == 2: mid_third += 1
        elif ed == 3: mid_fourth += 1

    midgame_feature = ''
    if len(midgame_moves) > 0:
        center_ratio = mid_center / len(midgame_moves)
        if center_ratio > 0.4:
            midgame_feature = '中腹作战多'
        elif center_ratio < 0.2:
            midgame_feature = '偏实地'
        else:
            midgame_feature = '均衡'

    # ===== 官子分析（150手以后）=====
    endgame_moves = play_moves[150:] if len(play_moves) > 150 else []
    endgame_len = len(endgame_moves)

    # ===== 综合评价 =====
    issues = []
    if first_move_score <= 1:
        issues.append('开局选点不佳')
    if early_contact:
        issues.append('布局过早接触')
    if second_line + first_line > 5:
        issues.append('二线/一线棋过多')
    if total_moves < 80 and not won:
        issues.append('速败')
    if total_moves > 250:
        issues.append('持久战')
    if reason == '认输' and not won:
        issues.append('认输')
    if margin > 10:
        issues.append('大败')
    if margin > 0 and margin <= 3:
        issues.append('惜败/险胜')
    if not issues:
        issues.append('无明显异常')

    results.append({
        'date': date,
        'opp': opp_name[:12],
        'opp_rank': opp_rank,
        'color': '黑' if is_jaden_black else '白',
        'result': result_label,
        'reason': reason,
        'moves': total_moves,
        'first_move': first_move_quality,
        'opening_score': opening_score,
        'early_contact': '是' if early_contact else '否',
        'midgame': midgame_feature,
        'endgame_hands': endgame_len,
        'issues': ' / '.join(issues),
    })

# ===== 输出 =====
print("=" * 120)
print("JadenSai 93局逐盘详细分析表（业余2段 → 目标业余5段）")
print("=" * 120)

# 表头
header = f"{'#':>3} {'日期':<12} {'对手':<14} {'对手段位':<6} {'执':>2} {'果':>2} {'结果类型':<10} {'手数':>4} {'第一手':<10} {'布局分':>4} {'早接触':>4} {'中盘特征':<10} {'官子手数':>6}  {'问题诊断'}"
print(header)
print("-" * 120)

for i, r in enumerate(results, 1):
    line = f"{i:>3} {r['date']:<12} {r['opp']:<14} {r['opp_rank']:<6} {r['color']:>2} {r['result']:>2} {r['reason']:<10} {r['moves']:>4} {r['first_move']:<10} {r['opening_score']:>4} {r['early_contact']:>4} {r['midgame']:<10} {r['endgame_hands']:>6}  {r['issues']}"
    print(line)

print("-" * 120)

# ===== 汇总统计 =====
print("\n" + "=" * 80)
print("汇总统计")
print("=" * 80)

# 开局选点统计
first_moves = Counter(r['first_move'] for r in results)
print("\n【开局第一手选点】")
for m, c in first_moves.most_common():
    print(f"  {m}: {c}次 ({c/len(results)*100:.0f}%)")

# 布局评分分布
scores = Counter(r['opening_score'] for r in results)
print("\n【布局质量评分分布（0=极差, 5=优秀）】")
for s in sorted(scores):
    bar = '█' * scores[s] * 2
    print(f"  {s}分: {scores[s]}局 {bar}")

# 问题分布
all_issues = []
for r in results:
    all_issues.extend(r['issues'].split(' / '))
issue_counts = Counter(all_issues)
print("\n【问题诊断频率】")
for issue, c in issue_counts.most_common(15):
    print(f"  {issue}: {c}次 ({c/len(results)*100:.0f}%)")

# 中盘特征
mid_features = Counter(r['midgame'] for r in results)
print("\n【中盘特征分布】")
for f, c in mid_features.most_common():
    print(f"  {f}: {c}局")

# 胜负与布局分关系
print("\n【布局分与胜负关系】")
for s in sorted(scores):
    s_games = [r for r in results if r['opening_score'] == s]
    s_wins = sum(1 for r in s_games if r['result'] == '胜')
    if s_games:
        print(f"  {s}分: {len(s_games)}局, 胜{s_wins}, 胜率{s_wins/len(s_games)*100:.0f}%")
