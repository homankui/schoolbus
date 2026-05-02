# 智慧校车管理系统

## 快速启动

### 1. 初始化数据库
```bash
mysql -u root -p < database/init.sql
```

### 2. 启动后端
```bash
cd backend
# 修改 .env 中的数据库密码
npm install
npm run dev
```

### 3. 启动前端
```bash
cd frontend
npm install
npm run dev
```

访问 http://localhost:5173，账号 `admin` / 密码 `password`

### 4. 高德地图配置
在 [高德开放平台](https://lbs.amap.com/) 申请免费 Key，替换 [MapView.vue](frontend/src/views/MapView.vue) 中的 `YOUR_AMAP_KEY`

## 项目结构
```
smart-bus-system/
├── backend/          # Node.js + Express API (端口 3000)
├── frontend/         # Vue3 + Vite 前端 (端口 5173)
└── database/         # MySQL 初始化 SQL
```

## 功能模块
- 首页概览：统计卡片 + 今日乘车记录 + 最新通知
- 实时地图：Socket.io 推送校车位置，高德地图展示
- 车辆/司机/路线/学生管理：增删改查
- 乘车记录：分页查询，支持日期筛选
- 通知管理：上下车提醒，标记已读

## App 对接说明
手机 App 人脸识别上下车后，调用以下接口写入数据：
- `POST /api/ride-records` 写入乘车记录
- `POST /api/notifications` 发送家长通知
