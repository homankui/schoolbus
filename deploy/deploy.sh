#!/bin/bash
# 在云服务器上执行此脚本完成部署

set -e

PROJECT_DIR=/var/www/smart-bus

# 安装依赖
apt-get update -y
apt-get install -y nginx mysql-server nodejs npm
npm install -g pm2

# 上传代码后执行以下步骤
cd $PROJECT_DIR

# 初始化数据库（首次部署）
# mysql -u root -p < database/init.sql

# 安装后端依赖并启动
cd $PROJECT_DIR/backend
npm install --production
cp deploy/ecosystem.config.js .
pm2 start ecosystem.config.js
pm2 save
pm2 startup

# 构建前端
cd $PROJECT_DIR/frontend
npm install
npm run build

# 配置 Nginx
cp $PROJECT_DIR/deploy/nginx.conf /etc/nginx/sites-available/smart-bus
ln -sf /etc/nginx/sites-available/smart-bus /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx

echo "部署完成！访问 http://your-domain.com"
