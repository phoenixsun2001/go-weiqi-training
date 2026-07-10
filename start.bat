@echo off
chcp 65001 >nul
title 围棋棋力训练

echo ================================
echo  围棋棋力训练 - Web 版启动
echo ================================
echo.

:: 启动后端
echo [1/2] 启动后端服务 (localhost:8000)...
cd /d "%~dp0"
start /b python backend/main.py

:: 等待后端就绪
timeout /t 3 /nobreak >nul

:: 打开浏览器
echo [2/2] 打开浏览器...
start http://127.0.0.1:8000

echo.
echo 应用已启动！浏览器应已自动打开。
echo 关闭此窗口将停止后端服务。
echo.
pause
