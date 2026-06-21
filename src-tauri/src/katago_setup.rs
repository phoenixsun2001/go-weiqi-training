use crate::error::{AppError, AppResult};
use std::path::{Path, PathBuf};

/// KataGo 安装目录（应用数据目录下）
pub fn katago_dir() -> PathBuf {
    let base = std::env::current_dir()
        .unwrap_or_else(|_| PathBuf::from("."))
        .join("katago");
    let _ = std::fs::create_dir_all(&base);
    base
}

pub fn katago_binary_path() -> PathBuf {
    katago_dir().join("katago.exe")
}

pub fn katago_model_path() -> PathBuf {
    katago_dir().join("model.bin.gz")
}

pub fn katago_config_path() -> PathBuf {
    katago_dir().join("default_gtp.cfg")
}

/// 检查 KataGo 是否已安装（二进制 + 权重 + 配置齐全）
pub fn is_installed() -> bool {
    katago_binary_path().exists()
        && katago_model_path().exists()
        && katago_config_path().exists()
}

/// 下载单个文件到指定路径（带 User-Agent，避免被部分服务器拒绝）
fn download(url: &str, dest: &Path) -> AppResult<()> {
    let dest_str = dest.to_string_lossy();
    let ps_script = format!(
        "try {{ [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; \
         $ProgressPreference='SilentlyContinue'; \
         $h=@{{'User-Agent'='Mozilla/5.0'}}; \
         Invoke-WebRequest -Uri '{}' -OutFile '{}' -UseBasicParsing -Headers $h -TimeoutSec 600; \
         Write-Output 'OK' }} catch {{ Write-Error $_.Exception.Message; exit 1 }}",
        url, dest_str
    );
    let status = std::process::Command::new("powershell.exe")
        .args(["-NoProfile", "-Command", &ps_script])
        .status()?;
    if !status.success() {
        return Err(AppError::Engine(format!(
            "下载失败: {url}"
        )));
    }
    Ok(())
}

/// 解压 zip 到 katago 目录
fn unzip(zip_path: &Path, dest_dir: &Path) -> AppResult<()> {
    let zip_str = zip_path.to_string_lossy();
    let dest_str = dest_dir.to_string_lossy();
    let ps_script = format!(
        "Expand-Archive -Path '{}' -DestinationPath '{}' -Force",
        zip_str, dest_str
    );
    let status = std::process::Command::new("powershell.exe")
        .args(["-NoProfile", "-Command", &ps_script])
        .status()?;
    if !status.success() {
        return Err(AppError::Engine("解压失败".into()));
    }
    Ok(())
}

/// 生成 KataGo GTP 配置文件（OpenCL 后端，适配 AMD APU）
pub fn generate_config() -> AppResult<()> {
    let cfg = r#"# KataGo GTP 配置 - 自动生成（OpenCL 后端）
# 适配 AMD Radeon 780M（4GB 显存）

# 日志
logDir = gtp_logs
logSearchInfo = false
logToStdout = true

# 棋盘
maxBoardSize = 19

# 搜索参数（默认强度，对战时会通过 GTP 动态调整 maxVisits）
maxVisits = 800
numSearchThreads = 4

# 神经网络（OpenCL 后端）
nnMaxBatchSize = 8
nnCacheSizePowerOfTwo = 21
nnMutexPoolSizePowerOfTwo = 14
numNNServerThreadsPerModel = 2

# OpenCL 后端
trtPredict = false
useFP16 = false
"#;
    std::fs::write(katago_config_path(), cfg)?;
    Ok(())
}

/// 寻找解压后的 katago.exe（可能在子目录里）
fn find_binary(dir: &Path) -> Option<PathBuf> {
    // 直接在根目录
    let direct = dir.join("katago.exe");
    if direct.exists() {
        return Some(direct);
    }
    // 搜索子目录
    if let Ok(entries) = std::fs::read_dir(dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                let candidate = path.join("katago.exe");
                if candidate.exists() {
                    return Some(candidate);
                }
            }
        }
    }
    None
}

/// 一键下载并安装 KataGo（OpenCL 版 + b18c384 权重）
pub fn install() -> AppResult<String> {
    let dir = katago_dir();

    // 如果已安装，直接返回
    if is_installed() {
        return Ok("已安装".into());
    }

    // 1) 下载 KataGo OpenCL 版（适配 AMD Radeon 780M）
    let zip_path = dir.join("katago.zip");
    let binary_url = "https://github.com/lightvector/KataGo/releases/download/v1.16.5/katago-v1.16.5-opencl-windows-x64.zip";
    download(binary_url, &zip_path)?;
    unzip(&zip_path, &dir)?;
    let _ = std::fs::remove_file(&zip_path);

    // 把 katago.exe 移到目录根
    if let Some(bin) = find_binary(&dir) {
        if bin != katago_binary_path() {
            let _ = std::fs::copy(&bin, katago_binary_path());
        }
    }
    if !katago_binary_path().exists() {
        return Err(AppError::Engine(
            "解压后未找到 katago.exe，请手动下载".into(),
        ));
    }

    // 2) 下载网络权重（b18c384nbt-uec，b18c384 架构，兼容 v1.16.5）
    //    用 GitHub Release 的版本（katagotraining.org 在部分地区被限制访问）
    let model_url = "https://github.com/lightvector/KataGo/releases/download/v1.12.0/b18c384nbt-uec.bin.gz";
    download(model_url, &katago_model_path())?;
    if !katago_model_path().exists() {
        return Err(AppError::Engine("权重下载失败".into()));
    }

    // 3) 生成配置
    generate_config()?;

    Ok(format!(
        "KataGo 安装完成：{}",
        katago_binary_path().display()
    ))
}

/// 返回启动 KataGo 所需的参数
pub fn gtp_args() -> Vec<String> {
    vec![
        "gtp".to_string(),
        "-model".to_string(),
        katago_model_path().to_string_lossy().into_owned(),
        "-config".to_string(),
        katago_config_path().to_string_lossy().into_owned(),
    ]
}
