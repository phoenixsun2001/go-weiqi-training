"""KataGo GTP 引擎管理：asyncio 子进程，修复管道问题"""
import asyncio
import os
from pathlib import Path

# 段位 -> maxVisits 映射
DAN_TO_VISITS = {1: 8, 2: 16, 3: 40, 4: 100, 5: 800}


def dan_to_max_visits(dan: int) -> int:
    return DAN_TO_VISITS.get(dan, 800)


class KatagoEngine:
    """管理一个 KataGo GTP 子进程，异步命令收发"""

    def __init__(self):
        self.process: asyncio.subprocess.Process | None = None
        self._lock = asyncio.Lock()

    @property
    def is_running(self) -> bool:
        return self.process is not None and self.process.returncode is None

    async def start(self, binary_path: str, args: list[str]):
        """启动 KataGo。stderr 重定向到日志文件（不使用管道，避免缓冲区满导致崩溃）。"""
        working_dir = str(Path(binary_path).parent)

        # stderr 写入日志文件（不用管道！这是 os error 232 的根因修复）
        log_path = os.path.join(working_dir, "katago_stderr.log")
        stderr_file = open(log_path, "a", encoding="utf-8")

        self.process = await asyncio.create_subprocess_exec(
            binary_path,
            *args,
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=stderr_file,
            cwd=working_dir,
        )

    async def stop(self):
        if self.process and self.process.returncode is None:
            self.process.kill()
            await self.process.wait()
        self.process = None

    async def command(self, cmd: str) -> str:
        """发送 GTP 命令并读取响应。自动跳过 KataGo 日志行。"""
        if not self.is_running:
            raise RuntimeError("KataGo 引擎未运行")

        async with self._lock:
            stdin = self.process.stdin
            stdout = self.process.stdout

            stdin.write((cmd + "\n").encode())
            await stdin.drain()

            collected = ""
            found_response_start = False
            while True:
                line_bytes = await stdout.readline()
                if not line_bytes:
                    # EOF = 进程关闭
                    if found_response_start:
                        break
                    raise RuntimeError("KataGo 引擎已意外关闭（进程退出）")
                line = line_bytes.decode("utf-8", errors="replace").rstrip("\r\n")

                if not line:
                    if found_response_start:
                        break
                    continue

                if line.startswith("=") or line.startswith("?"):
                    found_response_start = True
                    collected = line
                    continue

                if found_response_start:
                    if collected:
                        collected += "\n"
                    collected += line
                # 否则是日志行，跳过

            return self._parse_response(collected)

    def _parse_response(self, raw: str) -> str:
        raw = raw.strip()
        if raw.startswith("="):
            return raw[1:].strip()
        if raw.startswith("?"):
            raise RuntimeError(f"GTP 错误: {raw[1:].strip()}")
        if not raw:
            raise RuntimeError("空响应")
        return raw


def find_katago_dir() -> Path:
    """查找 KataGo 安装目录"""
    candidates = []

    # 从后端脚本位置推断（最可靠）
    backend_dir = Path(__file__).parent
    project_dir = backend_dir.parent
    candidates.append(project_dir / "katago")
    candidates.append(project_dir / "src-tauri" / "katago")
    candidates.append(backend_dir / "katago")

    # 从当前工作目录推断
    cwd = Path.cwd()
    candidates.append(cwd / "katago")
    candidates.append(cwd / "src-tauri" / "katago")

    for c in candidates:
        if (c / "katago.exe").exists() or (c / "katago").exists():
            return c

    # 默认
    default = project_dir / "katago"
    default.mkdir(parents=True, exist_ok=True)
    return default


def get_binary_path() -> Path:
    d = find_katago_dir()
    exe = d / "katago.exe"
    if exe.exists():
        return exe
    linux = d / "katago"
    if linux.exists():
        return linux
    return exe  # 返回 exe 路径（即使不存在，用于错误提示）


def get_model_path() -> Path:
    d = find_katago_dir()
    for name in ["b18c384nbt-uec.bin.gz", "kata1_b18c384nbt-65d471d3.bin.gz", "model.bin.gz"]:
        p = d / name
        if p.exists():
            return p
    return d / "model.bin.gz"


def get_config_path() -> Path:
    """优化配置路径"""
    d = find_katago_dir()
    return d / "gtp_optimized.cfg"


def ensure_config():
    """生成优化配置：以 KataGo 自带 default_gtp.cfg 为基础，替换高内存参数"""
    import re
    cfg_path = get_config_path()
    if cfg_path.exists():
        return

    katago_dir = find_katago_dir()
    default_cfg = katago_dir / "default_gtp.cfg"

    if default_cfg.exists():
        content = default_cfg.read_text(encoding="utf-8")
    else:
        content = ""

    # 替换已存在的 key 值（用正则替换 key = value 行）
    replacements = {
        "logSearchInfo": "false",
        "maxVisits": "300",
        "numSearchThreads": "3",
        "nnCacheSizePowerOfTwo": "19",
        "nnMutexPoolSizePowerOfTwo": "12",
        "numNNServerThreadsPerModel": "1",
    }
    for key, val in replacements.items():
        # 匹配 key = oldval 或 # key = oldval，替换为 key = val
        content = re.sub(
            rf'^({re.escape(key)}\s*=\s*).*$',
            f'\\g<1>{val}',
            content,
            flags=re.MULTILINE,
        )
        # 如果 key 不存在（全被注释了），追加
        if not re.search(rf'^{re.escape(key)}\s*=', content, re.MULTILINE):
            content += f"\n{key} = {val}\n"

    cfg_path.write_text(content, encoding="utf-8")


def get_gtp_args() -> list[str]:
    ensure_config()
    return [
        "gtp",
        "-model", str(get_model_path()),
        "-config", str(get_config_path()),
    ]


def is_installed() -> bool:
    return get_binary_path().exists() and get_model_path().exists()
