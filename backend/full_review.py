"""批量深度复盘全部93局，生成逐局复盘报告"""
import os, re, json

sgf_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'sgf_games')
files = sorted([f for f in os.listdir(sgf_dir) if f.endswith('.sgf')])

def to_gtp(coord, size=19):
    x = ord(coord[0]) - ord('a')
    y = ord(coord[1]) - ord('a')
    col = chr(65+x) if x < 8 else chr(66+x)
    return f"{col}{size-y}"

def classify_move(x, y, size, move_idx, total):
    """分析单手棋的特征"""
    mx = min(x, size-1-x)
    my = min(y, size-1-y)
    edge = min(mx, my)
    
    # 位置分类
    if edge == 0: pos = "一线"
    elif edge == 1: pos = "二线"
    elif edge == 2: pos = "三线"
    elif edge == 3: pos = "四线"
    elif edge == 4: pos = "五线"
    else: pos = "中腹"
    
    # 角部具体点
    corner = ""
    if mx <= 5 and my <= 5:
        if (mx,my) == (4,4): corner = "星位"
        elif (mx,my) == (3,3): corner = "三三"
        elif (mx,my) in [(3,4),(4,3)]: corner = "小目"
        elif (mx,my) in [(3,5),(5,3)]: corner = "高目"
        elif (mx,my) in [(4,5),(5,4)]: corner = "目外"
        elif mx <= 2 or my <= 2: corner = "低位角"
        else: corner = "角部其他"
    
    # 阶段
    frac = move_idx / max(total, 1)
    if frac < 0.15: phase = "布局"
    elif frac < 0.6: phase = "中盘"
    else: phase = "官子"
    
    return pos, corner, phase, edge

reports = []

for fname in files:
    with open(os.path.join(sgf_dir, fname), 'r', encoding='utf-8') as f:
        sgf = f.read()
    
    pb = re.search(r'PB\[([^\]]*)\]', sgf)
    pw = re.search(r'PW\[([^\]]*)\]', sgf)
    re_match = re.search(r'RE\[([^\]]*)\]', sgf)
    dt_match = re.search(r'DT\[([^\]]*)\]', sgf)
    br = re.search(r'BR\[([^\]]*)\]', sgf)
    wr = re.search(r'WR\[([^\]]*)\]', sgf)
    
    black_name = pb.group(1) if pb else '?'
    white_name = pw.group(1) if pw else '?'
    result = re_match.group(1) if re_match else ''
    date = (dt_match.group(1) if dt_match else '')[:10]
    is_black = 'JadenSai' in black_name
    opp = white_name if is_black else black_name
    opp_rank = (wr if is_black else br)
    opp_rank = opp_rank.group(1) if opp_rank else ''
    
    moves = re.findall(r';([BW])\[([a-z]{2}|)\]', sgf)
    play_moves = [(c, coord) for c, coord in moves if coord and len(coord) == 2]
    total = len(play_moves)
    
    won = (result.startswith('B+') and is_black) or (result.startswith('W+') and not is_black)
    
    # 分析JadenSai的每手棋
    jaden_color = 'B' if is_black else 'W'
    jaden_moves = []
    for i, (color, coord) in enumerate(play_moves):
        if color == jaden_color:
            x = ord(coord[0]) - ord('a')
            y = ord(coord[1]) - ord('a')
            jaden_idx = len([m for m in play_moves[:i+1] if m[0] == jaden_color]) - 1
            pos, corner, phase, edge = classify_move(x, y, 19, i, total)
            jaden_moves.append({
                'move': jaden_idx + 1,
                'gtp': to_gtp(coord),
                'pos': pos, 'corner': corner, 'phase': phase, 'edge': edge,
                'game_move': i + 1,
            })
    
    # 统计JadenSai各阶段选点
    opening = [m for m in jaden_moves if m['phase'] == '布局']
    midgame = [m for m in jaden_moves if m['phase'] == '中盘']
    endgame = [m for m in jaden_moves if m['phase'] == '官子']
    
    # 布局质量评估
    layout_issues = []
    
    # 1. 第一手
    first = jaden_moves[0] if jaden_moves else None
    if first:
        if first['edge'] <= 1:
            layout_issues.append(f"第一手{first['gtp']}({first['pos']})效率极低，应下星位(Q16/D16/D4/Q4)或小目")
        elif first['corner'] in ['星位','小目','三三']:
            pass  # OK
        elif not first['corner']:
            layout_issues.append(f"第一手{first['gtp']}不在角部，应先占角")
    
    # 2. 前4手（应占4角）
    first4 = jaden_moves[:4]
    corners_in_opening = sum(1 for m in first4 if m['corner'])
    if corners_in_opening < 2 and len(first4) >= 2:
        layout_issues.append(f"前4手仅占{corners_in_opening}角，应优先占满4角")
    
    # 3. 二线棋比例
    second_line_count = sum(1 for m in opening if m['edge'] <= 1)
    if second_line_count > 3:
        layout_issues.append(f"布局阶段有{second_line_count}手二线/一线棋，效率过低")
    
    # 4. 过早中腹
    early_center = sum(1 for m in opening if m['edge'] >= 5)
    if early_center > 2:
        layout_issues.append(f"布局阶段有{early_center}手中腹棋，过早放弃角边")
    
    # 中盘特征
    mid_features = []
    mid_center = sum(1 for m in midgame if m['edge'] >= 5)
    mid_third = sum(1 for m in midgame if m['edge'] == 2)
    if midgame:
        center_ratio = mid_center / len(midgame)
        if center_ratio > 0.35:
            mid_features.append("中腹作战频繁，可能有浮棋")
        if mid_third / len(midgame) > 0.35:
            mid_features.append("偏重三线实地")
    
    # 官子特征
    end_features = []
    if len(endgame) > 100:
        end_features.append("官子极长(>100手)，可能收束效率低")
    elif len(endgame) == 0 and total > 80:
        end_features.append("中盘即结束，未进入官子")
    
    # 结果分析
    margin = 0
    result_type = ""
    if 'R' in result:
        result_type = "认输" if not won else "对手认输"
    elif 'T' in result:
        result_type = "超时" if not won else "对手超时"
    elif result and result[2:]:
        try:
            margin = float(result[2:])
            result_type = f"点目{margin}"
        except:
            result_type = "中盘"
    
    # 综合评语
    summary_parts = []
    if layout_issues:
        summary_parts.append(f"布局问题: {'; '.join(layout_issues[:2])}")
    if mid_features:
        summary_parts.append(f"中盘: {'; '.join(mid_features)}")
    if end_features:
        summary_parts.append(f"官子: {'; '.join(end_features)}")
    
    if not summary_parts:
        if won:
            summary_parts.append("本局表现尚可")
        else:
            summary_parts.append("布局和中盘均有提升空间")
    
    # 关键手分析（前10手详情）
    key_moves_detail = []
    for m in jaden_moves[:8]:
        tag = ""
        if m['edge'] <= 1: tag = "⚠低效"
        elif m['corner'] in ['星位','小目']: tag = "✓合理"
        elif m['corner']: tag = "○角部"
        elif m['phase'] == '布局' and not m['corner']: tag = "⚠非角部"
        key_moves_detail.append(f"{m['move']}手{m['gtp']}({m['corner'] or m['pos']}){tag}")
    
    reports.append({
        'date': date, 'opp': opp[:10], 'opp_rank': opp_rank,
        'color': '黑' if is_black else '白',
        'won': '胜' if won else '负',
        'result_type': result_type, 'total': total,
        'layout': layout_issues[0] if layout_issues else '基本合理',
        'mid': mid_features[0] if mid_features else '均衡',
        'endgame_hands': len(endgame),
        'summary': '; '.join(summary_parts),
        'key_moves': ' | '.join(key_moves_detail),
    })

# 输出逐局复盘
print("=" * 120)
print(f"JadenSai 93局逐局复盘报告（业余2段 → 目标5段）")
print("=" * 120)

for i, r in enumerate(reports, 1):
    print(f"\n第{i}局 | {r['date']} | {r['opp']}({r['opp_rank']}) | 执{r['color']} | {'★胜' if r['won']=='胜' else '✗负'} | {r['result_type']} | {r['total']}手")
    print(f"  关键手: {r['key_moves']}")
    print(f"  复盘: {r['summary']}")

# 输出汇总
print("\n" + "=" * 80)
print("复盘汇总")
print("=" * 80)

# 统计各类问题
from collections import Counter
layout_issues_all = Counter()
for r in reports:
    if '第一手' in r['layout'] and '效率极低' in r['layout']:
        layout_issues_all['第一手低效'] += 1
    if '前4手' in r['layout']:
        layout_issues_all['占角不足'] += 1
    if '二线' in r['layout']:
        layout_issues_all['二线棋过多'] += 1
    if '中腹' in r['layout']:
        layout_issues_all['过早中腹'] += 1
    if '浮棋' in r['mid']:
        layout_issues_all['中盘浮棋'] += 1
    if '收束效率' in r['endgame_hands'] if isinstance(r['endgame_hands'], str) else r.get('end',''):
        layout_issues_all['官子冗长'] += 1

print("\n【复盘发现问题频率】")
for issue, c in layout_issues_all.most_common():
    print(f"  {issue}: {c}局 ({c/len(reports)*100:.0f}%)")
