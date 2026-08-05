"""
AI 智能复盘引擎（不依赖 KataGo）
基于围棋棋理和棋型分析，对每盘棋的每个阶段给出评语。
"""
import re
from sgf_parser import parse_moves, parse_metadata


def review_game(sgf: str) -> dict:
    """
    完整复盘一局棋，返回逐阶段评语。
    不调用 KataGo，基于棋型分析。
    """
    meta = parse_metadata(sgf)
    moves = parse_moves(sgf)
    if not moves:
        return {"error": "无着手"}

    size = meta["board_size"]
    total = len(moves)
    pb = re.search(r'PB\[([^\]]*)\]', sgf)
    pw = re.search(r'PW\[([^\]]*)\]', sgf)
    re_match = re.search(r'RE\[([^\]]*)\]', sgf)
    black = pb.group(1) if pb else "?"
    white = pw.group(1) if pw else "?"
    result = re_match.group(1) if re_match else ""

    is_black_jaden = True  # 假设分析黑方视角

    # ===== 逐阶段分析 =====
    phases = []

    # 布局阶段（前15%手数）
    opening_end = max(15, int(total * 0.15))
    opening_moves = moves[:opening_end]
    opening_review = _review_opening(opening_moves, size, sgf)
    phases.append({"phase": "布局", "range": f"第1-{opening_end}手", **opening_review})

    # 序盘过渡（15%-30%）
    transition_end = max(opening_end + 5, int(total * 0.30))
    transition_moves = moves[opening_end:transition_end]
    transition_review = _review_transition(transition_moves, size, opening_end)
    phases.append({"phase": "序盘", "range": f"第{opening_end+1}-{transition_end}手", **transition_review})

    # 中盘（30%-70%）
    midgame_end = max(transition_end + 10, int(total * 0.70))
    midgame_moves = moves[transition_end:midgame_end]
    midgame_review = _review_midgame(midgame_moves, size, transition_end)
    phases.append({"phase": "中盘", "range": f"第{transition_end+1}-{midgame_end}手", **midgame_review})

    # 官子（70%-100%）
    endgame_moves = moves[midgame_end:]
    endgame_review = _review_endgame(endgame_moves, size, midgame_end, result)
    phases.append({"phase": "官子", "range": f"第{midgame_end+1}-{total}手", **endgame_review})

    # ===== 关键手分析 =====
    key_moves = _find_key_moves(moves, size, total)

    # ===== 总结 =====
    summary = _build_summary(phases, result, total, meta)

    # ===== 形势估算（基于选点分析） =====
    territory_est = _estimate_territory(moves, size, total)

    br = re.search(r'BR\[([^\]]*)\]', sgf)
    wr = re.search(r'WR\[([^\]]*)\]', sgf)
    black_rank = br.group(1) if br else ""
    white_rank = wr.group(1) if wr else ""
    dt_match = re.search(r'DT\[([^\]]*)\]', sgf)
    date = (dt_match.group(1) if dt_match else "")[:10]

    return {
        "black": black,
        "white": white,
        "black_rank": black_rank,
        "white_rank": white_rank,
        "result": result,
        "total_moves": total,
        "board_size": size,
        "date": date,
        "meta": meta,
        "phases": phases,
        "key_moves": key_moves,
        "summary": summary,
        "territory_estimate": territory_est,
    }


def _coord_to_xy(coord, size=19):
    if len(coord) != 2:
        return None
    x = ord(coord[0]) - ord('a')
    y = ord(coord[1]) - ord('a')
    if x < 0 or x >= size or y < 0 or y >= size:
        return None
    return x, y


def _edge_dist(x, y, size):
    return min(min(x, size-1-x), min(y, size-1-y))


def _classify_point(x, y, size):
    mx = min(x, size-1-x)
    my = min(y, size-1-y)
    if (mx, my) == (4, 4): return "星位"
    if (mx, my) == (3, 3): return "三三"
    if (mx, my) in [(3,4),(4,3)]: return "小目"
    if (mx, my) in [(3,5),(5,3)]: return "高目"
    if (mx, my) in [(4,5),(5,4)]: return "目外"
    ed = _edge_dist(x, y, size)
    if ed == 0: return "一线"
    if ed == 1: return "二线"
    if ed == 2: return "三线"
    if ed == 3: return "四线"
    if ed == 4: return "五线"
    return "中腹"


def _review_opening(moves, size, sgf):
    """分析布局阶段"""
    comments = []
    score = 5  # 满分5分
    issues = []

    # 1. 角部占领情况
    corner_moves = []
    for color, x, y in moves:
        pt = _classify_point(x, y, size)
        if pt in ["星位", "三三", "小目", "高目", "目外"]:
            corner_moves.append((color, x, y, pt))

    # 2. 第一手评估
    if moves:
        _, fx, fy = moves[0]
        first_pt = _classify_point(fx, fy, size)
        ed = _edge_dist(fx, fy, size)
        if ed <= 1:
            comments.append(f"第1手下在{_gtp(fx,fy,size)}（{first_pt}），这是二线低位，效率很低。标准开局应选星位(Q16/D4)或小目。")
            score -= 2
            issues.append("开局选点低效")
        elif first_pt in ["星位", "小目", "三三"]:
            comments.append(f"第1手{_gtp(fx,fy,size)}（{first_pt}），选点合理。")
        elif first_pt in ["高目", "目外"]:
            comments.append(f"第1手{_gtp(fx,fy,size)}（{first_pt}），可接受但不如星位/小目常见。")
            score -= 1
        else:
            comments.append(f"第1手{_gtp(fx,fy,size)}不在标准角部位置。")
            score -= 1
            issues.append("开局不在角部")

    # 3. 前8手角部占领
    early_corners = sum(1 for _, x, y in moves[:8] if _classify_point(x, y, size) in ["星位","三三","小目","高目","目外"])
    if early_corners < 3:
        comments.append(f"前8手仅{early_corners}手在标准角部位置，角部占领不足。理想情况下前8手双方应占满4角。")
        score -= 1
        issues.append("角部占领不足")

    # 4. 二线棋检查
    second_line = sum(1 for _, x, y in moves[:12] if _edge_dist(x, y, size) <= 1)
    if second_line >= 3:
        comments.append(f"前12手有{second_line}手在二线/一线，棋子效率过低。二线棋发展空间小，容易被压制。")
        score -= 1
        issues.append("二线棋过多")

    # 5. 过早接触战检测
    early_contact = False
    for i in range(4, min(12, len(moves))):
        _, x, y = moves[i]
        for j in range(max(0, i-3), i):
            _, px, py = moves[j]
            if abs(x - px) + abs(y - py) <= 1:
                early_contact = True
                break
    if early_contact:
        comments.append("布局阶段过早发生贴身接触战，跳过了占角拆边的基本流程。建议前15手先完成布局再战斗。")
        score -= 1
        issues.append("过早接触战")

    # 6. 过早中腹
    early_center = sum(1 for _, x, y in moves[:12] if _edge_dist(x, y, size) >= 5)
    if early_center >= 2:
        comments.append(f"布局阶段有{early_center}手在中腹，放弃了角边实地。")
        score -= 1
        issues.append("过早中腹")

    if not issues:
        comments.append("布局基本符合围棋原理，角部占领合理。")

    return {
        "score": max(0, score),
        "comments": comments,
        "issues": issues,
    }


def _review_transition(moves, size, start_idx):
    """分析序盘过渡"""
    comments = []
    issues = []

    if not moves:
        return {"score": 3, "comments": ["序盘阶段手数较少"], "issues": []}

    # 检查是否在边部拆边
    side_moves = sum(1 for _, x, y in moves if _edge_dist(x, y, size) in [2, 3])
    center_moves = sum(1 for _, x, y in moves if _edge_dist(x, y, size) >= 5)
    contact_moves = 0

    for i in range(1, len(moves)):
        _, x, y = moves[i]
        for j in range(max(0, i-3), i):
            _, px, py = moves[j]
            if abs(x - px) + abs(y - py) <= 1:
                contact_moves += 1

    if contact_moves > len(moves) * 0.3:
        comments.append(f"序盘阶段接触战频繁（{contact_moves}手贴身），可能过早进入战斗。建议先完成边部拆边。")
        issues.append("序盘急于战斗")

    if center_moves > len(moves) * 0.3:
        comments.append(f"序盘阶段中腹棋子较多（{center_moves}手），可能在没有外围厚势的情况下贸然打入。")
        issues.append("序盘中腹浮棋")

    if side_moves > len(moves) * 0.4:
        comments.append("序盘注重边部发展，实地意识较好。")

    if not comments:
        comments.append("序盘过渡较为平稳。")

    score = 3 - len(issues)
    return {"score": max(0, score), "comments": comments, "issues": issues}


def _review_midgame(moves, size, start_idx):
    """分析中盘"""
    comments = []
    issues = []

    if not moves or len(moves) < 5:
        return {"score": 3, "comments": ["中盘阶段较短"], "issues": []}

    center = sum(1 for _, x, y in moves if _edge_dist(x, y, size) >= 5)
    third = sum(1 for _, x, y in moves if _edge_dist(x, y, size) == 2)
    contact = 0

    for i in range(1, len(moves)):
        _, x, y = moves[i]
        for j in range(max(0, i-3), i):
            _, px, py = moves[j]
            if abs(x - px) + abs(y - py) <= 1:
                contact += 1

    contact_ratio = contact / len(moves) if moves else 0
    center_ratio = center / len(moves) if moves else 0

    if center_ratio > 0.35:
        comments.append(f"中盘中腹作战频繁（{center}手在中腹，占{center_ratio*100:.0f}%），需注意孤棋安全。浮棋容易被攻击。")
        issues.append("中腹浮棋风险")

    if contact_ratio > 0.25:
        comments.append(f"中盘贴身战斗激烈（接触率{contact_ratio*100:.0f}%），需注意战斗的得失。局部不利时应及时转身。")

    if third / len(moves) > 0.35:
        comments.append("中盘偏重三线实地，注意不要过于保守，适当扩张外势。")

    # 检查是否有打入（对方势力范围内的选点）
    invasions = 0
    for i, (color, x, y) in enumerate(moves):
        if _edge_dist(x, y, size) <= 3:
            # 检查周围是否被对方棋子包围
            nearby_opp = 0
            for j in range(max(0, i-5), min(len(moves), i+5)):
                if j == i:
                    continue
                oc, ox, oy = moves[j]
                if oc != color and abs(x-ox) + abs(y-oy) <= 4:
                    nearby_opp += 1
            if nearby_opp >= 2:
                invasions += 1

    if invasions > len(moves) * 0.15:
        comments.append(f"中盘有{invasions}手疑似打入/侵消，注意打入时机和安全。")

    if not comments:
        comments.append("中盘选点较为均衡，攻守兼备。")

    score = 3
    if "中腹浮棋风险" in issues:
        score -= 1

    return {"score": max(0, score), "comments": comments, "issues": issues}


def _review_endgame(moves, size, start_idx, result):
    """分析官子"""
    comments = []
    issues = []

    if not moves:
        return {"score": 3, "comments": ["未进入官子阶段"], "issues": []}

    # 官子手数评估
    if len(moves) > 120:
        comments.append(f"官子阶段长达{len(moves)}手，收束效率可能偏低。高水平对局官子通常在60-80手内完成。")
        issues.append("官子冗长")
    elif len(moves) < 20 and 'R' not in result and 'T' not in result:
        comments.append("官子阶段很短，可能在官子前就结束了。")

    # 检查一线/二线官子（扳粘等）
    edge_moves = sum(1 for _, x, y in moves if _edge_dist(x, y, size) <= 1)
    if edge_moves > len(moves) * 0.3:
        comments.append(f"官子阶段一线/二线棋较多（{edge_moves}手），可能存在先后手判断不当。")

    # 结果分析
    if result:
        if 'R' in result:
            comments.append(f"本局以{'认输' if 'R' in result else ''}结束，在认输前应确认形势是否真的不可逆转。")
        elif result[2:].replace('.', '').isdigit():
            margin = float(result[2:])
            if margin <= 3:
                comments.append(f"点目差距仅{margin}目，胜负在毫厘之间，官子能力值得肯定。")
            elif margin > 10:
                comments.append(f"点目差距{margin}目较大，说明中盘可能已经崩盘，官子无力回天。")
                issues.append("大分差")

    if not comments:
        comments.append("官子阶段表现正常。")

    return {"score": 3, "comments": comments, "issues": issues}


def _find_key_moves(moves, size, total):
    """找出关键手（可能有问题的选点）"""
    key_moves = []

    for i, (color, x, y) in enumerate(moves[:30]):
        ed = _edge_dist(x, y, size)
        pt = _classify_point(x, y, size)
        gtp = _gtp(x, y, size)
        move_num = i + 1

        issues = []
        if ed <= 1 and i < 15:
            issues.append("二线低位，效率低")
        elif ed >= 5 and i < 10:
            issues.append("过早进入中腹")

        # 检查是否与对手贴身（前12手）
        if i >= 2 and i < 12:
            for j in range(max(0, i-2), i):
                _, px, py = moves[j]
                if abs(x-px) + abs(y-py) <= 1:
                    issues.append("过早接触战")
                    break

        if issues:
            key_moves.append({
                "move": move_num,
                "color": "黑" if color == "black" else "白",
                "point": gtp,
                "type": pt,
                "issues": issues,
            })

    return key_moves


def _estimate_territitory(moves, size, total):
    """基于选点分析估算双方形势"""
    black_third = black_fourth = black_center = 0
    white_third = white_fourth = white_center = 0

    for color, x, y in moves:
        ed = _edge_dist(x, y, size)
        if color == "black":
            if ed == 2: black_third += 1
            elif ed == 3: black_fourth += 1
            elif ed >= 5: black_center += 1
        else:
            if ed == 2: white_third += 1
            elif ed == 3: white_fourth += 1
            elif ed >= 5: white_center += 1

    # 粗略估算（三线=实地，四线=势力，中腹=不确定）
    black_est = black_third * 2 + black_fourth * 1
    white_est = white_third * 2 + white_fourth * 1

    if black_est > white_est + 5:
        assessment = "黑方实地领先"
    elif white_est > black_est + 5:
        assessment = "白方实地领先"
    else:
        assessment = "形势均势"

    return {
        "black_territory_est": black_est,
        "white_territory_est": white_est,
        "assessment": assessment,
        "black_third_line": black_third,
        "white_third_line": white_third,
        "black_center": black_center,
        "white_center": white_center,
    }


def _estimate_territory(moves, size, total):
    return _estimate_territitory(moves, size, total)


def _build_summary(phases, result, total, meta):
    """生成总结"""
    all_issues = []
    for p in phases:
        all_issues.extend(p.get("issues", []))

    scores = [p.get("score", 3) for p in phases]
    avg_score = sum(scores) / len(scores) if scores else 3

    parts = []

    # 总体评价
    if avg_score >= 4:
        parts.append("本局整体表现良好")
    elif avg_score >= 3:
        parts.append("本局整体表现一般")
    else:
        parts.append("本局存在明显问题")

    # 主要问题
    from collections import Counter
    issue_counts = Counter(all_issues)
    if issue_counts:
        top_issues = issue_counts.most_common(3)
        parts.append("主要问题：" + "、".join(f"{iss}({cnt}次)" for iss, cnt in top_issues))

    # 结果评价
    if result:
        if 'R' in result:
            winner = "黑" if result.startswith('B') else "白"
            parts.append(f"以认输结束（{winner}方胜）")
        elif result[2:].replace('.', '').isdigit():
            margin = float(result[2:])
            winner = "黑" if result.startswith('B') else "白"
            if margin <= 3:
                parts.append(f"点目{winner}胜{margin}目，胜负在毫厘之间")
            else:
                parts.append(f"点目{winner}胜{margin}目")

    return "。".join(parts) + "。"


def _gtp(x, y, size=19):
    col = chr(65 + x) if x < 8 else chr(66 + x)
    return f"{col}{size - y}"
