use crate::error::{AppError, AppResult};

/// GTP 坐标（跳过字母 I）转内部 0-based (x,y)
pub fn gtp_to_xy(gtp: &str) -> AppResult<(usize, usize)> {
    let gtp = gtp.trim();
    let bytes = gtp.as_bytes();
    if bytes.len() < 2 {
        return Err(AppError::Coord(format!("坐标过短: {gtp}")));
    }
    let col_char = (bytes[0] as char).to_ascii_uppercase();
    let col = match col_char {
        'A'..='H' => (col_char as usize) - ('A' as usize),
        'J'..='T' => (col_char as usize) - ('A' as usize) - 1,
        _ => return Err(AppError::Coord(format!("非法列字母: {col_char}"))),
    };
    let row_str = &gtp[1..];
    let row: usize = row_str
        .parse()
        .map_err(|_| AppError::Coord(format!("非法行号: {row_str}")))?;
    if row == 0 {
        return Err(AppError::Coord("行号从 1 开始".into()));
    }
    Ok((col, row - 1))
}

/// 内部 (x,y, size) 转 GTP 字符串
pub fn xy_to_gtp(x: usize, y: usize, size: usize) -> AppResult<String> {
    if x >= size || y >= size {
        return Err(AppError::Coord(format!("坐标越界: ({x},{y}) size={size}")));
    }
    let col = if x < 8 {
        (b'A' + x as u8) as char
    } else {
        (b'A' + (x as u8) + 1) as char // 跳过 I
    };
    Ok(format!("{col}{}", y + 1))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn gtp_to_internal_corner() {
        let (x, y) = gtp_to_xy("A1").unwrap();
        assert_eq!((x, y), (0, 0));
    }

    #[test]
    fn gtp_to_internal_skips_i() {
        let (x, _) = gtp_to_xy("J1").unwrap();
        assert_eq!(x, 8);
    }

    #[test]
    fn xy_to_gtp_roundtrip() {
        let gtp = xy_to_gtp(3, 4, 9).unwrap();
        let (x, y) = gtp_to_xy(&gtp).unwrap();
        assert_eq!((x, y), (3, 4));
    }

    #[test]
    fn invalid_coordinate_rejected() {
        assert!(gtp_to_xy("Z1").is_err());
    }
}
