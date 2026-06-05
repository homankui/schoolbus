const express = require('express');
require('express-async-errors');
const http = require('http');
const cors = require('cors');
const path = require('path');
const multer = require('multer');
const { PrismaClient } = require('@prisma/client');

// ── 基础配置 ────────────────────────────────────────────────
const prisma = new PrismaClient();
const app = express();
const server = http.createServer(app);
const SECRET = process.env.JWT_SECRET || 'smart_bus_secret';
const CORS_ORIGINS = (process.env.CORS_ORIGINS || 'http://localhost:5173,http://localhost:3000,http://localhost:8080')
  .split(',').map(s => s.trim());
const photoUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

// ── 全局中间件 ───────────────────────────────────────────────
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || CORS_ORIGINS.includes(origin)) callback(null, true);
    else callback(new Error('Not allowed by CORS'));
  }
}));
app.use(express.json({ limit: '1mb' }));
app.use(function (req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  next();
});
app.use('/student-faces', express.static(path.join(__dirname, '..', 'uploads', 'student-faces')));

// ── 模块加载 ─────────────────────────────────────────────────
const loginLimiter = require('./middleware/loginLimiter');
const { createLimiter } = require('./middleware/apiLimiter');
const createAuthMiddleware = require('./middleware/auth');
const { createStudentService } = require('./services/studentService');
const { createArrivalDetection } = require('./services/arrivalDetection');
const { createRealtimeMapRoutes, buildBusLocationPayload, saveBusLocation, wgs84ToGcj02 } = require('./routes/realtimeMap');
const createSocketModule = require('./socket');

const createAuthRoutes = require('./routes/auth');
const createSchoolRoutes = require('./routes/schools');
const createCrudRouter = require('./routes/crud');
const createTeacherRoutes = require('./routes/teachers');
const createStudentRoutes = require('./routes/students');
const createRideAssignRoutes = require('./routes/rideAssign');
const createRideRecordRoutes = require('./routes/rideRecords');
const createNotificationRoutes = require('./routes/notifications');
const createDashboardRoutes = require('./routes/dashboard');
const createWechatRoutes = require('./routes/wechat');
const createAppRoutes = require('./routes/appApi');
const createUserRoutes = require('./routes/users');
const createBusTrajectoryRoutes = require('./routes/busTrajectory');
const createStressTestRoutes = require('./routes/stressTest');

// ── 微信推送服务（共享）───────────────────────────────────────
const { sendParentBoardNotice } = require('./services/wechatNotify');

// ════════════════════════════════════════════════════════════
// 按依赖顺序实例化
// ════════════════════════════════════════════════════════════

// 1. 鉴权中间件
const { auth, buildClassTeacherStudentScope, isClassTeacherUser,
  isSchoolLeaderUser, isAdminUser, buildSchoolScope, ensureClassTeacherStudentAccess }
  = createAuthMiddleware(prisma, SECRET);

// 2. 学生服务
const studentService = createStudentService(prisma);
const {
  loadStudentRows, findStudentsByOpenid, findStudentByOpenid, detectPhotoImportStatus,
  getStudentFacePhotoUrl, saveStudentFacePhoto, buildPhotoImportFaceId,
  createStudentRecord, updateStudentRecord, attachStudentStops, sanitizeStudentPayload
} = studentService;

// 3. Socket.io（在 appApi 之前创建）
const io = createSocketModule(server, CORS_ORIGINS, SECRET, prisma);

// 4. 到站检测服务
const arrival = createArrivalDetection(prisma, { buildBusLocationPayload, sendParentBoardNotice });
const { getSessionArrivalState, buildSessionRealtimeSnapshot, searchAmapPlaceKeywords, detectSessionArrival } = arrival;

// 5. 微信路由 — openid 查找辅助函数
const findClassTeacherByOpenid = (openid) =>
  prisma.classTeacher.findFirst({ where: { wechat_openid: openid } });

const findEscortTeacherByOpenid = (openid) =>
  prisma.escortTeacher.findFirst({ where: { wechat_openid: openid } });

const findSchoolLeaderByOpenid = (openid) =>
  prisma.user.findFirst({ where: { wechat_openid: openid, role: 'school_leader' } });

const wechatRouter = createWechatRoutes(prisma, {
  findStudentsByOpenid, findStudentByOpenid, loadStudentRows, detectPhotoImportStatus,
  saveStudentFacePhoto, buildPhotoImportFaceId, updateStudentRecord,
  buildBusLocationPayload, getSessionArrivalState, auth, photoUpload,
  findClassTeacherByOpenid, findEscortTeacherByOpenid, findSchoolLeaderByOpenid
});

// 6. CRUD 路由工厂
const crudRouter = createCrudRouter(prisma, {
  auth, isClassTeacherUser, buildClassTeacherStudentScope,
  isSchoolLeaderUser, buildSchoolScope,
  loadStudentRows, sanitizeStudentPayload, createStudentRecord,
  updateStudentRecord, attachStudentStops
});

// 7. 教师路由
const { escortRouter, classTeacherRouter } = createTeacherRoutes(prisma, {
  auth, isClassTeacherUser, ensureClassTeacherStudentAccess
});

// 8. App 接口路由
const saveBusFn = (payload) => saveBusLocation(prisma, payload);
const appRouter = createAppRoutes(prisma, io, {
  auth, loadStudentRows, findStudentByOpenid, detectPhotoImportStatus,
  getStudentFacePhotoUrl, saveStudentFacePhoto, buildPhotoImportFaceId,
  createStudentRecord, updateStudentRecord, sendParentBoardNotice,
  getSessionArrivalState, buildSessionRealtimeSnapshot, saveBusLocation: saveBusFn,
  wgs84ToGcj02, detectSessionArrival
});

// ════════════════════════════════════════════════════════════
// 挂载路由
// ════════════════════════════════════════════════════════════

// 登录
app.use(createAuthRoutes(prisma, SECRET, loginLimiter));

// 学校
app.use(createSchoolRoutes(prisma, auth));

// 微信 OAuth 授权
app.use(require('./routes/wechatOAuth'));

// 微信家长端 — 速率限制 (60次/分钟/IP)
const wechatLimiter = createLimiter({ max: 60, windowMs: 60_000 });
app.use('/api/wechat', wechatLimiter);

// 微信家长端 + 请假申请
app.use('/api', wechatRouter);

// 通用 CRUD
app.use('/api/fleets',    crudRouter('fleets'));
app.use('/api/buses',     crudRouter('buses'));
app.use('/api/drivers',   crudRouter('drivers'));
app.use('/api/routes',    crudRouter('routes'));
app.use('/api/sessions',  crudRouter('sessions'));
app.use('/api/stops',     crudRouter('stops'));
app.use('/api/grades',    crudRouter('grades'));
app.use('/api/classes',   crudRouter('classes'));
app.use('/api/students',  crudRouter('students'));

// 教师
app.use('/api/escort-teachers', escortRouter);
app.use('/api/class-teachers',  classTeacherRouter);

// 学生专用接口
app.use('/api/students', createStudentRoutes(prisma, {
  auth, isClassTeacherUser, loadStudentRows, findStudentByOpenid,
  detectPhotoImportStatus, getStudentFacePhotoUrl, saveStudentFacePhoto,
  buildPhotoImportFaceId, updateStudentRecord, createStudentRecord,
  sanitizeStudentPayload
}));

// 搭乘管理
app.use('/api/ride-assign', createRideAssignRoutes(prisma, { auth, loadStudentRows }));

// 乘车记录
app.use(createRideRecordRoutes(prisma, auth));

// 实时地图
app.use(createRealtimeMapRoutes(prisma, auth, {
  buildBusLocationPayload, saveBusLocation: saveBusFn, buildSessionRealtimeSnapshot
}));

// 通知
app.use(createNotificationRoutes(prisma, auth));

// Dashboard
app.use(createDashboardRoutes(prisma, auth));

// 用户管理（admin only）
app.use('/api/users', createUserRoutes(prisma, { auth, isAdminUser }));

// 轨迹回放
app.use('/api', createBusTrajectoryRoutes(prisma, auth));

// 压力测试
app.use('/api', createStressTestRoutes(prisma, auth));

// App 接口
app.use('/api/app', appRouter);
app.use('/api/map', appRouter);

// ── 全局错误处理 ────────────────────────────────────────────
app.use((err, req, res, _next) => {
  console.error('[error]', req.method, req.path, err);

  // Prisma 已知错误
  if (err.code && String(err.code).startsWith('P')) {
    const prismaMessages = {
      P2002: '数据已存在，请勿重复添加',
      P2025: '目标记录不存在，可能已被删除',
      P2003: '存在关联数据，无法删除'
    };
    const message = prismaMessages[err.code] || `数据库操作失败 (${err.code})`;
    return res.status(400).json({ message });
  }

  // Multer 文件大小超限
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ message: '文件大小不能超过5MB' });
  }

  // JWT 无效（非 auth 中间件拦截的）
  if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
    return res.status(401).json({ message: '认证已过期，请重新登录' });
  }

  // 默认 500
  res.status(500).json({ message: '服务器内部错误' });
});

// ════════════════════════════════════════════════════════════
// 启动
// ════════════════════════════════════════════════════════════
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log('Server running on http://localhost:' + PORT);
});
