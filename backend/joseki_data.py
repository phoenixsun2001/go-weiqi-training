"""
定式学习模块：内置业余5段前需掌握的主要定式
每个定式包含：名称、分类、难度、局面SGF、说明、关键要点
"""

JOSEKI_DATA = [
    # ===== 星位定式 =====
    {
        "name": "星位·点三三（黑挡退）",
        "category": "星位",
        "difficulty": 2,
        "description": "现代围棋最主流的定式。白点三三后，黑挡退，白扳粘，形成黑得外势、白取实地的两分。",
        "key_points": "黑3挡方向选择（从宽阔一侧挡）；白6扳后黑7退是本手；最终黑厚势对中腹有影响力。",
        "moves_sgf": "(;GM[1]FF[4]SZ[19];B[qd];W[dc];W[oc];B[od];W[nd];B[oe];W[ne];B[of];W[nf];B[pg];W[pe];B[qf];W[qe];B[nc];W[mc];B[nb];W[pd];B[qc])",
    },
    {
        "name": "星位·一间跳应（守角型）",
        "category": "星位",
        "difficulty": 2,
        "description": "对方挂角后，一间跳应是最简明的守角方式，兼顾防守与发展。",
        "key_points": "黑3一间跳是好形，后续可大飞守角形成立体阵地；白若打入则形成战斗。",
        "moves_sgf": "(;GM[1]FF[4]SZ[19];B[qd];W[pe];B[qf])",
    },
    {
        "name": "星位·小飞挂·一间低夹",
        "category": "星位",
        "difficulty": 3,
        "description": "对星位小飞挂角的一间低夹是积极的下法，迫使对方选择跳出或托退。",
        "key_points": "白3一间低夹是积极的攻击；黑4跳出是最常见的应对；后续围绕角部和边部展开战斗。",
        "moves_sgf": "(;GM[1]FF[4]SZ[19];B[qd];W[pe];B[of];W[oe];B[pf];W[qf];B[og])",
    },
    {
        "name": "星位·双挂（双飞燕）",
        "category": "星位",
        "difficulty": 4,
        "description": "对方双挂角时，星位一子受攻。需选择正确方向靠压，争取先手转身。",
        "key_points": "靠压较强的一方（有接应的一侧）；不可两面作战；通常选择弃角取势。",
        "moves_sgf": "(;GM[1]FF[4]SZ[19];B[qd];W[pe];W[pf];B[qg];W[og];B[of];W[ph];B[ng];W[qf];B[rf])",
    },

    # ===== 小目定式 =====
    {
        "name": "小目·一间高挂·托退",
        "category": "小目",
        "difficulty": 2,
        "description": "小目一间高挂后的托退是最基本的定式之一，黑白各取实地与厚势。",
        "key_points": "黑3托是手筋；白4扳后黑5退，白6粘；结果两分，是基本棋形。",
        "moves_sgf": "(;GM[1]FF[4]SZ[19];B[qd];W[pe];B[pd];W[qc];B[pc];W[qd];B[oe])",
    },
    {
        "name": "小目·一间高挂·一间跳",
        "category": "小目",
        "difficulty": 2,
        "description": "对方一间高挂时，一间跳是最简明的应法，重视速度和全局配合。",
        "key_points": "黑3一间跳轻快；不拘泥于角部得失；适合有全局配合时选择。",
        "moves_sgf": "(;GM[1]FF[4]SZ[19];B[qd];W[pe];B[of])",
    },
    {
        "name": "小目·小飞挂·小雪崩",
        "category": "小目",
        "difficulty": 3,
        "description": "小飞挂角后形成的经典雪崩型，变化复杂但结果通常两分。",
        "key_points": "黑3内挡形成雪崩；白4长后黑5长是关键；后续形成复杂战斗。",
        "moves_sgf": "(;GM[1]FF[4]SZ[19];B[qd];W[pf];B[qc];W[qe];B[rd];W[re];B[qf];W[pd];B[rc];W[pe];B[se])",
    },
    {
        "name": "小目·大飞挂·一间跳应",
        "category": "小目",
        "difficulty": 2,
        "description": "大飞挂比小飞挂轻，一间跳应后形成舒展的局面。",
        "key_points": "大飞挂重视边部发展；一间跳应最简明；后续可拆边形成大模样。",
        "moves_sgf": "(;GM[1]FF[4]SZ[19];B[qd];W[pg];B[of])",
    },

    # ===== 三三定式 =====
    {
        "name": "三三·肩冲",
        "category": "三三",
        "difficulty": 2,
        "description": "三三的肩冲是最常见的应对方式，取外势压低对方。",
        "key_points": "黑3肩冲压低白棋；白4爬后黑5长；根据全局选择挡的方向。",
        "moves_sgf": "(;GM[1]FF[4]SZ[19];B[dd];W[df];B[ef];W[dg];B[eg];W[dh];B[eh];W[di];B[ei])",
    },
    {
        "name": "三三·大飞守角",
        "category": "三三",
        "difficulty": 1,
        "description": "三三大飞守角是取角部实地的基本手法，简单实用。",
        "key_points": "大飞守角形成基本活形；角部实地约7-8目；适合实地棋风。",
        "moves_sgf": "(;GM[1]FF[4]SZ[19];B[dd];B[fd])",
    },

    # ===== 高目/目外定式 =====
    {
        "name": "高目·小目位置挂",
        "category": "高目",
        "difficulty": 3,
        "description": "高目挂角的变化，注重外势与实地的平衡。",
        "key_points": "根据全局配合选择挡的方向；高目定式通常注重厚势。",
        "moves_sgf": "(;GM[1]FF[4]SZ[19];B[pe];W[qd];B[pd];W[qc];B[pc];W[qe];B[oe])",
    },

    # ===== 布局常型 =====
    {
        "name": "中国流布局（高）",
        "category": "布局",
        "difficulty": 3,
        "description": "中国流是现代最流行的布局之一，注重全局配合和速度。",
        "key_points": "星+小目+拆边形成立体阵地；可攻可守；适合业余棋手掌握的主流布局。",
        "moves_sgf": "(;GM[1]FF[4]SZ[19];B[qd];B[dc];B[qo])",
    },
    {
        "name": "小目守角（一间跳守角）",
        "category": "布局",
        "difficulty": 1,
        "description": "小目一间跳守角是最基本的守角方式，确保角部实地。",
        "key_points": "一间跳守角后角部实地约10目；是最坚实的守角方式之一。",
        "moves_sgf": "(;GM[1]FF[4]SZ[19];B[qd];B[of])",
    },
    {
        "name": "星位·大飞守角",
        "category": "布局",
        "difficulty": 1,
        "description": "星位大飞守角是最常见的守角方式，兼顾实地与发展。",
        "key_points": "大飞守角后角部实地约8目；可以向边发展；后续可连片形成大模样。",
        "moves_sgf": "(;GM[1]FF[4]SZ[19];B[qd];B[pc])",
    },
]


def get_all_joseki():
    """返回全部定式"""
    return JOSEKI_DATA


def get_joseki_by_category(category: str):
    """按分类获取定式"""
    return [j for j in JOSEKI_DATA if j["category"] == category]


def get_categories():
    """获取所有分类"""
    return list(dict.fromkeys(j["category"] for j in JOSEKI_DATA))
