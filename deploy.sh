#!/bin/bash
set -e

echo "=========================================="
echo "  围棋棋力训练 - 一键部署脚本"
echo "=========================================="

# 安装系统依赖
echo "[1/6] 安装系统依赖..."
apt-get update -qq
apt-get install -y -qq python3 python3-pip git > /dev/null 2>&1

# 安装 Node.js
echo "[2/6] 安装 Node.js..."
if ! command -v node &> /dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash - > /dev/null 2>&1
    apt-get install -y -qq nodejs > /dev/null 2>&1
fi
echo "  Node.js: $(node --version)"

# 克隆代码
echo "[3/6] 克隆代码..."
cd /opt
if [ -d "go-weiqi-training" ]; then
    cd go-weiqi-training && git pull
else
    git clone https://github.com/phoenixsun2001/go-weiqi-training.git
    cd go-weiqi-training
fi

# 安装前端依赖并构建
echo "[4/6] 构建前端..."
npm install -q 2>/dev/null
npm run build 2>/dev/null

# 安装 Python 依赖
echo "[5/6] 安装 Python 依赖..."
pip3 install -q fastapi uvicorn 2>/dev/null

# 导入题库
echo "[6/6] 初始化题库..."
cd backend
python3 -c "
import sys; sys.path.insert(0, '.')
from main import seed_problems
seed_problems()
" 2>/dev/null || true

# 创建 systemd 服务
echo "创建系统服务..."
cat > /etc/systemd/system/weiqi-training.service << 'EOF'
[Unit]
Description=围棋棋力训练 Web 应用
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/go-weiqi-training
ExecStart=/usr/bin/python3 backend/main.py
Restart=always
RestartSec=5
Environment=PYTHONPATH=/opt/go-weiqi-training/backend

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable weiqi-training
systemctl restart weiqi-training

# 开放防火墙
echo "配置防火墙..."
if command -v ufw &> /dev/null; then
    ufw allow 8000/tcp 2>/dev/null || true
fi
iptables -I INPUT -p tcp --dport 8000 -j ACCEPT 2>/dev/null || true

# 等待服务启动
sleep 3
STATUS=$(systemctl is-active weiqi-training)

echo ""
echo "=========================================="
echo "  部署完成！"
echo "=========================================="
echo ""
echo "  服务状态: $STATUS"
echo "  访问地址: http://$(curl -s ifconfig.me):8000"
echo ""
echo "  管理命令:"
echo "    systemctl status weiqi-training   # 查看状态"
echo "    systemctl restart weiqi-training  # 重启"
echo "    journalctl -u weiqi-training -f   # 查看日志"
echo ""
echo "  注意: KataGo 未安装（Lighthouse 无 GPU）"
echo "  AI棋型复盘/题库/定式/对局库功能正常"
echo "=========================================="
