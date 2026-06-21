use crate::error::{AppError, AppResult};
use std::io::{BufRead, BufReader, Write};
use std::process::{Child, ChildStdin, ChildStdout, Command, Stdio};
use std::sync::Mutex;

/// 解析单条 GTP 响应（去掉 '= ' 前缀，'? ' 为错误）
pub fn parse_gtp_response(raw: &str) -> AppResult<String> {
    let raw = raw.trim();
    if let Some(rest) = raw.strip_prefix('=') {
        Ok(rest.trim().to_string())
    } else if let Some(rest) = raw.strip_prefix('?') {
        Err(AppError::Engine(rest.trim().to_string()))
    } else {
        Err(AppError::Engine(format!("无法解析 GTP 响应: {raw}")))
    }
}

pub struct EngineHandle {
    child: Child,
    stdin: Mutex<ChildStdin>,
    stdout: Mutex<BufReader<ChildStdout>>,
}

impl EngineHandle {
    /// 启动 KataGo 进程。binary_path 为 katago 可执行文件路径。
    /// 工作目录自动设为二进制所在目录（KataGo 需要访问 tuning 缓存等相对路径）。
    pub fn spawn(binary_path: &str, args: &[&str]) -> AppResult<Self> {
        // 工作目录设为二进制所在目录
        let working_dir = std::path::Path::new(binary_path)
            .parent()
            .map(|p| p.to_path_buf())
            .unwrap_or_else(|| std::path::PathBuf::from("."));

        let mut child = Command::new(binary_path)
            .args(args)
            .current_dir(&working_dir)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()?;
        let stdin = child
            .stdin
            .take()
            .ok_or_else(|| AppError::Engine("无 stdin".into()))?;
        let stdout = child
            .stdout
            .take()
            .ok_or_else(|| AppError::Engine("无 stdout".into()))?;
        Ok(Self {
            child,
            stdin: Mutex::new(stdin),
            stdout: Mutex::new(BufReader::new(stdout)),
        })
    }

    /// 发送 GTP 命令并读取直到空行（标准 GTP 响应边界）。
    /// 自动跳过 KataGo 的日志输出行（不以 = 或 ? 开头的行）。
    pub fn command(&self, cmd: &str) -> AppResult<String> {
        {
            let mut stdin = self.stdin.lock().unwrap();
            writeln!(stdin, "{cmd}")?;
            stdin.flush()?;
        }
        let mut stdout = self.stdout.lock().unwrap();
        let mut buf = String::new();
        let mut collected = String::new();
        let mut found_response_start = false;
        loop {
            buf.clear();
            let n = stdout.read_line(&mut buf)?;
            if n == 0 {
                break; // 进程关闭
            }
            let line = buf.trim_end_matches(['\n', '\r']);
            // 跳过空行（如果不是响应结束前的空行）
            if line.is_empty() {
                if found_response_start {
                    break; // GTP 响应以空行结束
                }
                continue; // 初始化期间的空行，跳过
            }
            // GTP 响应以 = 或 ? 开头
            if line.starts_with('=') || line.starts_with('?') {
                found_response_start = true;
                collected = line.to_string();
                continue;
            }
            // 响应开始后的后续行（多行响应，如分析数据）
            if found_response_start {
                if !collected.is_empty() {
                    collected.push('\n');
                }
                collected.push_str(line);
            }
            // 否则是 KataGo 的日志输出行，跳过
        }
        parse_gtp_response(&collected)
    }

    pub fn is_alive(&mut self) -> bool {
        matches!(self.child.try_wait(), Ok(None))
    }
}

impl Drop for EngineHandle {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_gtp_success() {
        let line = "= D4";
        let r = parse_gtp_response(line);
        assert!(r.is_ok(), "应为成功: {:?}", r);
        assert_eq!(r.unwrap(), "D4");
    }

    #[test]
    fn parse_gtp_error() {
        let line = "? illegal move";
        let r = parse_gtp_response(line);
        assert!(r.is_err());
    }

    #[test]
    fn parse_gtp_multiline() {
        let line = "= line1\nline2\nline3";
        let r = parse_gtp_response(line);
        assert_eq!(r.unwrap(), "line1\nline2\nline3");
    }
}
