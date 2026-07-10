"""坐标转换：GTP 顶点 <-> 内部 (x, y)，跳过字母 I"""


def gtp_to_xy(gtp: str) -> tuple[int, int]:
    """GTP 顶点（如 'D4'）转内部 (x, y)，跳过字母 I"""
    gtp = gtp.strip()
    if len(gtp) < 2:
        raise ValueError(f"坐标过短: {gtp}")
    col_char = gtp[0].upper()
    if 'A' <= col_char <= 'H':
        x = ord(col_char) - ord('A')
    elif 'J' <= col_char <= 'T':
        x = ord(col_char) - ord('A') - 1
    else:
        raise ValueError(f"非法列字母: {col_char}")
    row = int(gtp[1:])
    if row == 0:
        raise ValueError("行号从 1 开始")
    return x, row - 1


def xy_to_gtp(x: int, y: int, size: int) -> str:
    """内部 (x, y, size) 转 GTP 顶点，跳过字母 I"""
    if x >= size or y >= size:
        raise ValueError(f"坐标越界: ({x},{y}) size={size}")
    if x < 8:
        col = chr(ord('A') + x)
    else:
        col = chr(ord('A') + x + 1)  # 跳过 I
    return f"{col}{y + 1}"
