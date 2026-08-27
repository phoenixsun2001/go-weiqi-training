"""
野狐棋谱定时同步调度器：
- FastAPI lifespan 启动的 asyncio 后台任务
- 每 10 分钟检查一次：到点（距上次成功运行 >= interval_hours）且配置启用时自动导入
- 运行记录写入 foxwq_sync_log
"""
import asyncio
import sys, os, datetime
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

CHECK_INTERVAL_SECONDS = 600  # 10 分钟检查一次


def _now() -> datetime.datetime:
    return datetime.datetime.now()


def _parse_dt(s: str) -> datetime.datetime | None:
    try:
        return datetime.datetime.fromisoformat(s)
    except Exception:
        return None


async def run_sync_once(store, trigger_type: str = "auto") -> dict:
    """执行一次野狐同步（端点直接调用或调度器调用）"""
    cfg = store.get_sync_config()
    log_id = store.insert_sync_log(trigger_type)
    if not (cfg.get("nickname") or cfg.get("uid")):
        store.finish_sync_log(log_id, "failed", message="未配置昵称/UID")
        return {"ok": False, "message": "未配置昵称/UID"}

    try:
        from foxwq_api import sync_import_games
        result = await asyncio.to_thread(
            sync_import_games,
            store,
            nickname=cfg.get("nickname") or None,
            uid=cfg.get("uid") or None,
            limit=cfg.get("limit_count", 30),
            date_from=None, date_to=None,
        )
        status = "success" if result["imported"] > 0 or result["skipped"] > 0 else "empty"
        msg = f"导入{result['imported']} 跳过{result['skipped']} 失败{result['failed']}"
        store.finish_sync_log(log_id, status, result["imported"], result["skipped"],
                              result["failed"], msg)
        return {"ok": True, **result}
    except Exception as e:
        store.finish_sync_log(log_id, "failed", message=str(e)[:300])
        return {"ok": False, "message": str(e)[:300]}


async def scheduler_loop(store):
    """周期检查并执行到期同步"""
    while True:
        try:
            cfg = store.get_sync_config()
            if cfg.get("enabled") and (cfg.get("nickname") or cfg.get("uid")):
                due = True
                last_logs = [l for l in store.list_sync_logs(limit=5)
                             if l.get("finished_at")]
                if last_logs:
                    last_fin = _parse_dt(last_logs[0]["finished_at"])
                    if last_fin is not None:
                        elapsed_h = (_now() - last_fin).total_seconds() / 3600
                        due = elapsed_h >= float(cfg.get("interval_hours", 24))
                if due:
                    print(f"[sync-scheduler] 到期，开始定时同步 {cfg.get('nickname')}")
                    res = await run_sync_once(store, trigger_type="auto")
                    print(f"[sync-scheduler] 结果: {res}")
        except Exception as e:
            print(f"[sync-scheduler] 异常: {e}")
        await asyncio.sleep(CHECK_INTERVAL_SECONDS)


def start_scheduler(store):
    """注册为后台任务（在 FastAPI lifespan 中调用）"""
    return asyncio.create_task(scheduler_loop(store))
