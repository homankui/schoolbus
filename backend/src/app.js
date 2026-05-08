require('dotenv').config();
const express = require('express');
const http = require('http');
const path = require('path');
const multer = require('multer');
const { Server } = require('socket.io');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });
const SECRET = process.env.JWT_SECRET || 'smart_bus_secret';
const photoUpload = multer({ storage: multer.memoryStorage() });

app.use(cors());
app.use(express.json());

function auth(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ message: 'Unauthorized' });
  try { req.user = jwt.verify(token, SECRET); next(); }
  catch { res.status(401).json({ message: 'Invalid token' }); }
}



// ── CSV 导出工具 ──────────────────────────────────────────
function buildStudentFaceStatusLabel(student = {}) {
  if (student.face_import_status === 'pending') return '待绑定';
  if (student.face_id) return '已绑定';
  return '未录入';
}

function toCSV(rows, fields) {
  const header = fields.map(f => f.label).join(',');
  const lines = rows.map(r => fields.map(f => `"${r[f.key] ?? ''}"`).join(','));
  return [header, ...lines].join('\n');
}

// ── Auth ──────────────────────────────────────────────────
app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  const user = await prisma.user.findFirst({ where: { username } });
  if (!user || !await bcrypt.compare(password, user.password)) {
    return res.status(401).json({ message: '用户名或密码错误' });
  }

  const token = jwt.sign({ id: user.id, role: user.role }, SECRET, { expiresIn: '8h' });
  res.json({ token, role: user.role, username: user.username });
});

// 跟车老师登录（用 phone / name / username）
app.post('/api/auth/escort-login', async (req, res) => {
  const { username, password } = req.body;
  const teacher = await prisma.escortTeacher.findFirst({
    where: {
      OR: [
        { phone: username },
        { name: username },
        { username }
      ]
    },
    include: {
      sessionLinks: true
    }
  });
  if (!teacher || !await bcrypt.compare(password, teacher.password)) {
    return res.status(401).json({ message: '账号或密码错误' });
  }

  const sessionIds = (teacher.sessionLinks || []).map(link => link.sessionId);
  const token = jwt.sign(
    { id: teacher.id, role: 'escort', session_ids: sessionIds, school_id: teacher.schoolId },
    SECRET,
    { expiresIn: '8h' }
  );
  res.json({ token, role: 'escort', username: teacher.name, session_ids: sessionIds });
});

// —— 学校 ------------------------------------------------
app.get('/api/schools', auth, async (req, res) => {
  const list = await prisma.school.findMany({
    orderBy: { id: 'asc' }
  });
  res.json(list);
});

app.post('/api/schools', auth, async (req, res) => {
  const body = { ...req.body };
  const created = await prisma.school.create({
    data: {
      name: body.name,
      address: body.address ?? null,
      contact: body.contact ?? null
    }
  });
  res.json(created);
});

app.put('/api/schools/:id', auth, async (req, res) => {
  const id = +req.params.id;
  const existing = await prisma.school.findUnique({ where: { id } });
  if (!existing) return res.status(404).json({ message: 'Not found' });

  const body = { ...req.body };
  await prisma.school.update({
    where: { id },
    data: {
      name: body.name ?? existing.name,
      address: body.address ?? existing.address,
      contact: body.contact ?? existing.contact
    }
  });

  res.json({ success: true });
});

app.delete('/api/schools/:id', auth, async (req, res) => {
  const id = +req.params.id;
  const existing = await prisma.school.findUnique({ where: { id } });
  if (!existing) return res.status(404).json({ message: 'Not found' });

  await prisma.school.delete({ where: { id } });
  res.json({ success: true });
});


// ── 通用 Prisma CRUD 工具 ────────────────────────────────
function buildModelWhere(key, query = {}) {
  const where = {};

  if (query.school_id) {
    const field = ['fleets', 'buses', 'drivers', 'routes', 'sessions', 'grades', 'classes', 'students'].includes(key)
      ? 'schoolId'
      : null;
    if (field) where[field] = +query.school_id;
  }

  if (query.route_id && key === 'sessions') where.routeId = +query.route_id;
  if (query.session_id && key === 'stops') where.sessionId = +query.session_id;
  if (query.grade_id && key === 'classes') where.gradeId = +query.grade_id;

  return where;
}

function stripViewFields(data, fields) {
  fields.forEach(field => delete data[field]);
}

function normalizeEmptyForeignKeys(data) {
  Object.keys(data).forEach(field => {
    if (field.endsWith('Id') && data[field] === '') data[field] = null;
  });
}

function sanitizeModelData(key, data) {
  normalizeEmptyForeignKeys(data);
  delete data.id;
  stripViewFields(data, ['School', 'Fleet', 'Bus', 'Route', 'Session', 'Grade', 'Class']);

  if (key === 'students') {
    stripViewFields(data, ['parents', 'Grade', 'Class', 'Sessions', 'gradeName', 'className', 'BoardStop', 'AlightStop', 'board_stop_name', 'alight_stop_name']);
    if (Object.prototype.hasOwnProperty.call(data, 'card_no')) data.card_no = data.card_no?.trim?.() || null;
    if (Object.prototype.hasOwnProperty.call(data, 'board_stop_id')) data.board_stop_id = data.board_stop_id ? +data.board_stop_id : null;
    if (Object.prototype.hasOwnProperty.call(data, 'alight_stop_id')) data.alight_stop_id = data.alight_stop_id ? +data.alight_stop_id : null;
  }

  return data;
}

function buildModelData(key, body = {}) {
  const data = { ...body };

  const renameMap = {
    fleets: { school_id: 'schoolId' },
    buses: { school_id: 'schoolId', fleet_id: 'fleetId' },
    drivers: { bus_id: 'busId', school_id: 'schoolId', fleet_id: 'fleetId' },
    routes: { school_id: 'schoolId' },
    sessions: { route_id: 'routeId', bus_id: 'busId', depart_time: 'departTime', school_id: 'schoolId' },
    stops: { session_id: 'sessionId', arrive_time: 'arriveTime' },
    grades: { school_id: 'schoolId' },
    classes: { grade_id: 'gradeId', school_id: 'schoolId' },
    students: { grade_id: 'gradeId', class_id: 'classId', school_id: 'schoolId', parent_phone: 'parentPhone', parent_name: 'parentName', face_id: 'faceId', card_no: 'cardNo', board_stop_id: 'boardStopId', alight_stop_id: 'alightStopId' }
  };

  const mapped = renameMap[key] || {};
  Object.entries(mapped).forEach(([from, to]) => {
    if (Object.prototype.hasOwnProperty.call(data, from)) {
      data[to] = data[from];
      delete data[from];
    }
  });

  return sanitizeModelData(key, data);
}

function sanitizeStudentPayload(data = {}) {
  const next = { ...data };

  if (Object.prototype.hasOwnProperty.call(next, 'card_no')) {
    next.card_no = next.card_no?.trim?.() || null;
  }
  if (Object.prototype.hasOwnProperty.call(next, 'board_stop_id')) {
    next.board_stop_id = next.board_stop_id ? +next.board_stop_id : null;
  }
  if (Object.prototype.hasOwnProperty.call(next, 'alight_stop_id')) {
    next.alight_stop_id = next.alight_stop_id ? +next.alight_stop_id : null;
  }
  delete next.board_stop_name;
  delete next.alight_stop_name;

  return next;
}

function buildStudentUpdateData(body = {}) {
  const data = {};

  if (Object.prototype.hasOwnProperty.call(body, 'name')) data.name = body.name;
  if (Object.prototype.hasOwnProperty.call(body, 'grade_id')) data.grade = body.grade_id ? { connect: { id: +body.grade_id } } : { disconnect: true };
  if (Object.prototype.hasOwnProperty.call(body, 'class_id')) data.class = body.class_id ? { connect: { id: +body.class_id } } : { disconnect: true };
  if (Object.prototype.hasOwnProperty.call(body, 'school_id')) data.school = body.school_id ? { connect: { id: +body.school_id } } : { disconnect: true };
  if (Object.prototype.hasOwnProperty.call(body, 'parent_phone')) data.parentPhone = body.parent_phone || null;
  if (Object.prototype.hasOwnProperty.call(body, 'parent_name')) data.parentName = body.parent_name || null;
  if (Object.prototype.hasOwnProperty.call(body, 'face_id')) data.faceId = body.face_id || null;
  if (Object.prototype.hasOwnProperty.call(body, 'card_no')) data.cardNo = body.card_no || null;
  if (Object.prototype.hasOwnProperty.call(body, 'board_stop_id')) data.boardStopId = body.board_stop_id || null;
  if (Object.prototype.hasOwnProperty.call(body, 'alight_stop_id')) data.alightStopId = body.alight_stop_id || null;

  return data;
}

function buildPhotoImportFaceId(cardNo = '') {
  const normalizedCardNo = normalizeStudentCardNo(cardNo);
  if (!normalizedCardNo) return '';
  return `photo:pending:${normalizedCardNo}`;
}

function detectPhotoImportStatus(faceId = '') {
  const value = String(faceId || '').trim();
  if (!value) return { source: '', status: '' };
  if (value.startsWith('photo:pending:')) return { source: 'photo-import', status: 'pending' };
  if (value.startsWith('photo:')) return { source: 'photo-import', status: 'bound' };
  return { source: 'manual', status: 'bound' };
}

async function findStudentForFaceBinding({ studentId, cardNo, studentName, schoolId = null, sessionId = null } = {}) {
  if (studentId) {
    const student = await prisma.student.findUnique({ where: { id: Number(studentId) } });
    if (student) return student;
  }

  const normalizedCardNo = normalizeStudentCardNo(cardNo);
  if (normalizedCardNo) {
    const student = await prisma.student.findFirst({
      where: {
        cardNo: normalizedCardNo,
        ...(schoolId ? { schoolId: Number(schoolId) } : {}),
        ...(sessionId ? { sessionLinks: { some: { sessionId: Number(sessionId) } } } : {})
      },
      orderBy: { id: 'asc' }
    });
    if (student) return student;
  }

  const normalizedStudentName = String(studentName || '').trim();
  if (!normalizedStudentName) return null;

  const matchedStudents = await prisma.student.findMany({
    where: {
      name: normalizedStudentName,
      ...(schoolId ? { schoolId: Number(schoolId) } : {}),
      ...(sessionId ? { sessionLinks: { some: { sessionId: Number(sessionId) } } } : {})
    },
    orderBy: { id: 'asc' }
  });

  if (matchedStudents.length === 1) return matchedStudents[0];
  return matchedStudents.length > 1 ? { ambiguous: true, count: matchedStudents.length } : null;
}

async function createStudentRecord(body = {}) {
  const payload = sanitizeStudentPayload(body);
  const result = await prisma.$queryRaw`
    INSERT INTO students (
      name,
      grade_id,
      class_id,
      school_id,
      parent_phone,
      parent_name,
      face_id,
      card_no,
      board_stop_id,
      alight_stop_id
    ) VALUES (
      ${payload.name || ''},
      ${payload.grade_id || null},
      ${payload.class_id || null},
      ${payload.school_id || null},
      ${payload.parent_phone || null},
      ${payload.parent_name || null},
      ${payload.face_id || null},
      ${payload.card_no || null},
      ${payload.board_stop_id || null},
      ${payload.alight_stop_id || null}
    )
  `;
  const createdId = Number(result?.insertId || result?.[0]?.insertId || 0);
  if (!createdId) {
    const latest = await prisma.student.findFirst({ orderBy: { id: 'desc' }, include: buildCrudConfig('students').include });
    return latest;
  }
  return prisma.student.findUnique({ where: { id: createdId }, include: buildCrudConfig('students').include });
}

async function updateStudentRecord(id, body = {}) {
  const payload = sanitizeStudentPayload(body);
  await prisma.$executeRaw`
    UPDATE students
    SET
      name = ${payload.name || null},
      grade_id = ${payload.grade_id || null},
      class_id = ${payload.class_id || null},
      school_id = ${payload.school_id || null},
      parent_phone = ${payload.parent_phone || null},
      parent_name = ${payload.parent_name || null},
      face_id = ${payload.face_id || null},
      card_no = ${payload.card_no || null},
      board_stop_id = ${payload.board_stop_id || null},
      alight_stop_id = ${payload.alight_stop_id || null}
    WHERE id = ${id}
  `;
  return prisma.student.findUnique({ where: { id }, include: buildCrudConfig('students').include });
}

async function attachStudentStops(student) {
  if (!student) return student;

  const boardStopId = student.board_stop_id ?? student.boardStopId ?? null;
  const alightStopId = student.alight_stop_id ?? student.alightStopId ?? null;
  const stopIds = [...new Set([boardStopId, alightStopId].filter(Boolean))];

  if (!stopIds.length) {
    return {
      ...student,
      BoardStop: null,
      AlightStop: null
    };
  }

  const stops = await prisma.stop.findMany({
    where: { id: { in: stopIds } },
    include: { session: true }
  });
  const stopMap = new Map(stops.map(stop => [stop.id, stop]));

  return {
    ...student,
    BoardStop: stopMap.get(boardStopId) || null,
    AlightStop: stopMap.get(alightStopId) || null
  };
}

async function loadStudentRows(where = {}) {
  const schoolId = where.school_id ? Number(where.school_id) : null;
  const sql = `
    SELECT
      s.id,
      s.name,
      s.grade_id,
      s.class_id,
      s.school_id,
      s.parent_phone,
      s.parent_name,
      s.face_id,
      s.card_no,
      s.board_stop_id,
      s.alight_stop_id,
      g.id AS grade_ref_id,
      g.name AS grade_name,
      c.id AS class_ref_id,
      c.name AS class_name,
      bs.id AS board_stop_ref_id,
      bs.name AS board_stop_name,
      as2.id AS alight_stop_ref_id,
      as2.name AS alight_stop_name
    FROM students s
    LEFT JOIN grades g ON s.grade_id = g.id
    LEFT JOIN classes c ON s.class_id = c.id
    LEFT JOIN stops bs ON s.board_stop_id = bs.id
    LEFT JOIN stops as2 ON s.alight_stop_id = as2.id
    ${schoolId ? `WHERE s.school_id = ${schoolId}` : ''}
    ORDER BY s.id ASC
  `;
  const rows = await prisma.$queryRawUnsafe(sql);

  return rows.map(row => ({
    id: row.id,
    name: row.name,
    grade_id: row.grade_id,
    class_id: row.class_id,
    school_id: row.school_id,
    parent_phone: row.parent_phone,
    parent_name: row.parent_name,
    face_id: row.face_id,
    face_import_source: detectPhotoImportStatus(row.face_id).source,
    face_import_status: detectPhotoImportStatus(row.face_id).status,
    card_no: row.card_no,
    board_stop_id: row.board_stop_id,
    alight_stop_id: row.alight_stop_id,
    Grade: row.grade_ref_id ? { id: row.grade_ref_id, name: row.grade_name } : null,
    Class: row.class_ref_id ? { id: row.class_ref_id, name: row.class_name } : null,
    BoardStop: row.board_stop_ref_id ? { id: row.board_stop_ref_id, name: row.board_stop_name } : null,
    AlightStop: row.alight_stop_ref_id ? { id: row.alight_stop_ref_id, name: row.alight_stop_name } : null,
    board_stop_name: row.board_stop_name || '',
    alight_stop_name: row.alight_stop_name || '',
    gradeName: row.grade_name || '',
    className: row.class_name || '',
    Sessions: []
  }));
}

function mapModelRecord(key, item) {
  if (key === 'fleets') {
    return {
      id: item.id,
      name: item.name,
      school_id: item.schoolId,
      School: item.school || null
    };
  }

  if (key === 'buses') {
    return {
      id: item.id,
      plate: item.plate,
      model: item.model,
      capacity: item.capacity,
      status: item.status,
      school_id: item.schoolId,
      fleet_id: item.fleetId,
      School: item.school || null,
      Fleet: item.fleet || null
    };
  }

  if (key === 'drivers') {
    return {
      id: item.id,
      name: item.name,
      phone: item.phone,
      license: item.license,
      bus_id: item.busId,
      school_id: item.schoolId,
      fleet_id: item.fleetId,
      Bus: item.bus || null,
      School: item.school || null,
      Fleet: item.fleet || null
    };
  }

  if (key === 'routes') {
    return {
      id: item.id,
      name: item.name,
      school_id: item.schoolId,
      School: item.school || null
    };
  }

  if (key === 'sessions') {
    return {
      id: item.id,
      name: item.name,
      type: item.type,
      route_id: item.routeId,
      bus_id: item.busId,
      depart_time: item.departTime,
      school_id: item.schoolId,
      Route: item.route || null,
      Bus: item.bus || null,
      School: item.school || null
    };
  }

  if (key === 'stops') {
    return {
      id: item.id,
      name: item.name,
      session_id: item.sessionId,
      lat: item.lat,
      lng: item.lng,
      order: item.order,
      arrive_time: item.arriveTime,
      Session: item.session || null
    };
  }

  if (key === 'grades') {
    return {
      id: item.id,
      name: item.name,
      school_id: item.schoolId,
      School: item.school || null
    };
  }

  if (key === 'classes') {
    return {
      id: item.id,
      name: item.name,
      grade_id: item.gradeId,
      school_id: item.schoolId,
      Grade: item.grade || null,
      School: item.school || null
    };
  }

  if (key === 'students') {
    const grade = item.grade || null;
    const cls = item.class || null;
    const sessions = (item.sessionLinks || []).map(link => link.session).filter(Boolean);

    return {
      id: item.id,
      name: item.name,
      grade_id: item.gradeId,
      class_id: item.classId,
      school_id: item.schoolId,
      parent_phone: item.parentPhone,
      parent_name: item.parentName,
      face_id: item.faceId,
      card_no: item.card_no ?? item.cardNo ?? null,
      board_stop_id: item.board_stop_id ?? item.boardStopId ?? null,
      alight_stop_id: item.alight_stop_id ?? item.alightStopId ?? null,
      Grade: grade,
      Class: cls,
      BoardStop: item.BoardStop || item.boardStopRelation || null,
      AlightStop: item.AlightStop || item.alightStopRelation || null,
      board_stop_name: (item.BoardStop || item.boardStopRelation)?.name || '',
      alight_stop_name: (item.AlightStop || item.alightStopRelation)?.name || '',
      gradeName: grade?.name || '',
      className: cls?.name || '',
      Sessions: sessions
    };
  }

  return item;
}

function buildCrudConfig(key) {
  if (key === 'fleets') {
    return {
      model: prisma.fleet,
      include: { school: true },
      orderBy: { id: 'asc' }
    };
  }

  if (key === 'buses') {
    return {
      model: prisma.bus,
      include: { school: true, fleet: true },
      orderBy: { id: 'asc' }
    };
  }

  if (key === 'drivers') {
    return {
      model: prisma.driver,
      include: { bus: true, school: true, fleet: true },
      orderBy: { id: 'asc' }
    };
  }

  if (key === 'routes') {
    return {
      model: prisma.route,
      include: { school: true },
      orderBy: { id: 'asc' }
    };
  }

  if (key === 'sessions') {
    return {
      model: prisma.session,
      include: { route: true, bus: true, school: true },
      orderBy: { id: 'asc' }
    };
  }

  if (key === 'stops') {
    return {
      model: prisma.stop,
      include: { session: true },
      orderBy: [{ sessionId: 'asc' }, { order: 'asc' }, { id: 'asc' }]
    };
  }

  if (key === 'grades') {
    return {
      model: prisma.grade,
      include: { school: true },
      orderBy: { id: 'asc' }
    };
  }

  if (key === 'classes') {
    return {
      model: prisma.class,
      include: { grade: true, school: true },
      orderBy: { id: 'asc' }
    };
  }

  if (key === 'students') {
    return {
      model: prisma.student,
      include: {
        grade: true,
        class: true,
        sessionLinks: {
          include: { session: true }
        }
      },
      orderBy: { id: 'asc' }
    };
  }

  throw new Error(`Unsupported crud key: ${key}`);
}

function crudRouter(key) {
  const router = express.Router();
  const config = buildCrudConfig(key);

  router.get('/', auth, async (req, res) => {
    if (key === 'students') {
      const list = await loadStudentRows(req.query);
      return res.json(list);
    }

    const list = await config.model.findMany({
      where: buildModelWhere(key, req.query),
      include: config.include,
      orderBy: config.orderBy
    });
    const mapped = await Promise.all(
      list.map(async item => mapModelRecord(key, key === 'students' ? await attachStudentStops(item) : item))
    );
    res.json(mapped);
  });

  router.post('/', auth, async (req, res) => {
    const payload = key === 'students' ? sanitizeStudentPayload(req.body) : req.body;
    const created = key === 'students'
      ? await createStudentRecord(payload)
      : await config.model.create({
          data: buildModelData(key, payload),
          include: config.include
        });
    const mapped = mapModelRecord(key, key === 'students' ? await attachStudentStops(created) : created);
    res.json(mapped);
  });

  router.put('/:id', auth, async (req, res) => {
    const id = +req.params.id;
    const existing = await config.model.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ message: 'Not found' });

    const payload = key === 'students' ? sanitizeStudentPayload(req.body) : req.body;
    const updated = key === 'students'
      ? await updateStudentRecord(id, payload)
      : await config.model.update({
          where: { id },
          data: buildModelData(key, payload)
        });
    res.json(key === 'students' ? mapModelRecord(key, await attachStudentStops(updated)) : { success: true });
  });

  router.delete('/:id', auth, async (req, res) => {
    const id = +req.params.id;
    const existing = await config.model.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ message: 'Not found' });

    await config.model.delete({ where: { id } });
    res.json({ success: true });
  });

  router.get('/export', auth, async (req, res) => {
    const enriched = key === 'students'
      ? (await loadStudentRows(req.query)).map(student => ({
          ...student,
          face_status_label: buildStudentFaceStatusLabel(student)
        }))
      : (await config.model.findMany({
          where: buildModelWhere(key, req.query),
          include: config.include,
          orderBy: config.orderBy
        })).map(item => mapModelRecord(key, item));
    const fieldMap = {
      buses:    [{ key: 'plate', label: '车牌' }, { key: 'model', label: '型号' }, { key: 'capacity', label: '载客量' }, { key: 'status', label: '状态' }],
      drivers:  [{ key: 'name', label: '姓名' }, { key: 'phone', label: '电话' }, { key: 'license', label: '驾照号' }],
      students: [
        { key: 'name', label: '姓名' },
        { key: 'card_no', label: '学生卡号' },
        { key: 'gradeName', label: '年级' },
        { key: 'className', label: '班级' },
        { key: 'board_stop_name', label: '上车站点' },
        { key: 'alight_stop_name', label: '下车站点' },
        { key: 'parent_phone', label: '家长电话' },
        { key: 'parent_name', label: '家长姓名' },
        { key: 'face_id', label: '人脸ID' },
        { key: 'face_status_label', label: '人脸状态' }
      ],
      sessions: [{ key: 'name', label: '班次名称' }, { key: 'type', label: '类型' }, { key: 'depart_time', label: '发车时间' }],
      stops:    [{ key: 'name', label: '站点名称' }, { key: 'order', label: '顺序' }, { key: 'arrive_time', label: '到站时间' }, { key: 'lat', label: '纬度' }, { key: 'lng', label: '经度' }]
    };
    const fields = fieldMap[key] || [{ key: 'id', label: 'ID' }, { key: 'name', label: '名称' }];
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${key}.csv"`);
    res.send('﻿' + toCSV(enriched, fields));
  });

  return router;
}

app.use('/api/fleets',   crudRouter('fleets'));
app.use('/api/buses',    crudRouter('buses'));
app.use('/api/drivers',  crudRouter('drivers'));
app.use('/api/routes',   crudRouter('routes'));
app.use('/api/sessions', crudRouter('sessions'));
app.use('/api/stops',    crudRouter('stops'));
app.use('/api/grades',   crudRouter('grades'));
app.use('/api/classes',  crudRouter('classes'));
app.use('/api/students', crudRouter('students'));
// 跟车老师 & 班级老师（密码需 hash，覆盖 POST/PUT）
function teacherRouter(key) {
  const router = express.Router();

  function getTeacherConfig() {
    if (key === 'escortTeachers') {
      return {
        model: prisma.escortTeacher,
        include: {
          school: true,
          sessionLinks: {
            include: { session: true }
          }
        }
      };
    }

    return {
      model: prisma.classTeacher,
      include: {
        school: true,
        grade: true,
        class: true
      }
    };
  }

  function mapTeacherRecord(item) {
    if (key === 'escortTeachers') {
      return {
        id: item.id,
        name: item.name,
        phone: item.phone,
        username: item.username,
        school_id: item.schoolId,
        session_ids: (item.sessionLinks || []).map(link => link.sessionId),
        School: item.school || null,
        Sessions: (item.sessionLinks || []).map(link => link.session).filter(Boolean)
      };
    }

    return {
      id: item.id,
      name: item.name,
      phone: item.phone,
      username: item.username,
      school_id: item.schoolId,
      grade_id: item.gradeId,
      class_id: item.classId,
      School: item.school || null,
      Grade: item.grade || null,
      Class: item.class || null
    };
  }

  function sanitizeTeacherPayload(body = {}) {
    if (key === 'escortTeachers') {
      return {
        name: body.name,
        phone: body.phone ?? null,
        username: body.username ?? null,
        password: body.password,
        school_id: body.school_id,
        session_ids: Array.isArray(body.session_ids) ? body.session_ids : []
      };
    }

    return {
      name: body.name,
      phone: body.phone ?? null,
      username: body.username ?? null,
      password: body.password,
      school_id: body.school_id,
      grade_id: body.grade_id,
      class_id: body.class_id
    };
  }

  const config = getTeacherConfig();

  router.get('/', auth, async (req, res) => {
    const where = {};
    if (req.query.school_id) where.schoolId = +req.query.school_id;
    const list = await config.model.findMany({
      where,
      include: config.include,
      orderBy: { id: 'asc' }
    });
    res.json(list.map(mapTeacherRecord));
  });

  router.post('/', auth, async (req, res) => {
    const body = sanitizeTeacherPayload(req.body);
    if (body.password) body.password = await bcrypt.hash(body.password, 10);

    if (key === 'escortTeachers') {
      const sessionIds = [...new Set(body.session_ids.map(Number).filter(Boolean))];
      const created = await config.model.create({
        data: {
          name: body.name,
          phone: body.phone,
          username: body.username,
          password: body.password,
          schoolId: body.school_id != null && body.school_id !== '' ? +body.school_id : null,
          sessionLinks: {
            create: sessionIds.map(sessionId => ({ session: { connect: { id: sessionId } } }))
          }
        },
        include: config.include
      });
      return res.json(mapTeacherRecord(created));
    }

    const created = await config.model.create({
      data: {
        name: body.name,
        phone: body.phone,
        username: body.username,
        password: body.password,
        schoolId: body.school_id != null && body.school_id !== '' ? +body.school_id : null,
        gradeId: body.grade_id != null && body.grade_id !== '' ? +body.grade_id : null,
        classId: body.class_id != null && body.class_id !== '' ? +body.class_id : null
      },
      include: config.include
    });
    res.json(mapTeacherRecord(created));
  });

  router.put('/:id', auth, async (req, res) => {
    const id = +req.params.id;
    const existing = await config.model.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ message: 'Not found' });

    const body = sanitizeTeacherPayload(req.body);
    if (body.password) body.password = await bcrypt.hash(body.password, 10);
    else delete body.password;

    if (key === 'escortTeachers') {
      const sessionIds = Array.isArray(body.session_ids)
        ? [...new Set(body.session_ids.map(Number).filter(Boolean))]
        : null;

      await config.model.update({
        where: { id },
        data: {
          ...(body.name !== undefined ? { name: body.name } : {}),
          ...(body.phone !== undefined ? { phone: body.phone || null } : {}),
          ...(body.username !== undefined ? { username: body.username || null } : {}),
          ...(body.password ? { password: body.password } : {}),
          ...(body.school_id !== undefined ? { schoolId: body.school_id === '' ? null : +body.school_id } : {})
        }
      });

      if (sessionIds) {
        await prisma.escortTeacherSession.deleteMany({ where: { escortTeacherId: id } });
        if (sessionIds.length) {
          await prisma.escortTeacherSession.createMany({
            data: sessionIds.map(sessionId => ({ escortTeacherId: id, sessionId })),
            skipDuplicates: true
          });
        }
      }

      return res.json({ success: true });
    }

    await config.model.update({
      where: { id },
      data: {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.phone !== undefined ? { phone: body.phone || null } : {}),
        ...(body.username !== undefined ? { username: body.username || null } : {}),
        ...(body.password ? { password: body.password } : {}),
        ...(body.school_id !== undefined ? { schoolId: body.school_id === '' ? null : +body.school_id } : {}),
        ...(body.grade_id !== undefined ? { gradeId: body.grade_id === '' ? null : +body.grade_id } : {}),
        ...(body.class_id !== undefined ? { classId: body.class_id === '' ? null : +body.class_id } : {})
      }
    });
    res.json({ success: true });
  });

  router.delete('/:id', auth, async (req, res) => {
    const id = +req.params.id;
    const existing = await config.model.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ message: 'Not found' });

    await config.model.delete({ where: { id } });
    res.json({ success: true });
  });

  return router;
}

app.use('/api/escort-teachers', teacherRouter('escortTeachers'));
app.use('/api/class-teachers',  teacherRouter('classTeachers'));

app.get('/api/debug/escort-teachers', async (req, res) => {
  const list = await prisma.escortTeacher.findMany({
    include: { sessionLinks: true },
    orderBy: { id: 'asc' }
  });
  res.json(list.map(t => ({
    id: t.id,
    name: t.name,
    phone: t.phone,
    username: t.username,
    hasPassword: !!t.password,
    session_ids: (t.sessionLinks || []).map(link => link.sessionId)
  })));
});

// ── 学生 face_id 更新 ─────────────────────────────────────
app.put('/api/students/:id/face', auth, async (req, res) => {
  const id = +req.params.id;
  const student = await prisma.student.findUnique({ where: { id } });
  if (!student) return res.status(404).json({ message: 'Not found' });

  await prisma.student.update({
    where: { id },
    data: { faceId: req.body.face_id ?? '' }
  });
  res.json({ success: true });
});

app.post('/api/students/clear-pending-face', auth, async (req, res) => {
  const studentIds = Array.isArray(req.body.student_ids) ? req.body.student_ids.map(Number).filter(Boolean) : [];
  if (!studentIds.length) return res.status(400).json({ message: 'student_ids 不能为空' });

  const students = await prisma.student.findMany({
    where: { id: { in: studentIds } },
    select: { id: true, faceId: true }
  });

  const pendingIds = students
    .filter(student => detectPhotoImportStatus(student.faceId).status === 'pending')
    .map(student => student.id);

  if (pendingIds.length) {
    await prisma.student.updateMany({
      where: { id: { in: pendingIds } },
      data: { faceId: '' }
    });
  }

  res.json({ success: true, cleared: pendingIds.length });
});

// ── 学生导入模板 ──────────────────────────────────────────
app.get('/api/students/import-template', auth, async (req, res) => {
  const { school_id } = req.query;
  const schoolId = school_id ? +school_id : null;
  const gradeList = await prisma.grade.findMany({
    where: schoolId ? { schoolId } : {},
    orderBy: { id: 'asc' }
  });
  const classList = await prisma.class.findMany({
    where: schoolId ? { schoolId } : {},
    include: { grade: true },
    orderBy: { id: 'asc' }
  });
  const stopList = await prisma.stop.findMany({
    where: schoolId ? { session: { schoolId } } : {},
    include: { session: true },
    orderBy: [{ name: 'asc' }, { id: 'asc' }]
  });
  const gradeHint = '# 可用年级：' + gradeList.map(g => g.name).join('、') + '\n';
  const classHint = '# 可用班级：' + classList.map(c => `${c.grade?.name || ''}-${c.name}`).join('、') + '\n';
  const comment = '# 说明：请填写姓名、学生卡号、年级名称、班级名称；家长电话多个用"|"分隔；站点请在搭乘管理中导入\n';
  const header  = '姓名,学生卡号,年级名称,班级名称,家长姓名,家长电话,人脸ID(选填)';
  const example = '"张三","CARD001","三年级","1班","张父","13800138000",""';
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="students-template.csv"');
  res.send('﻿' + comment + gradeHint + classHint + [header, example].join('\n'));
});

// ── 学生 CSV 导入 ─────────────────────────────────────────
app.post('/api/students/import', auth, express.text({ type: '*/*' }), async (req, res) => {
  const { school_id } = req.query;
  const schoolId = school_id ? +school_id : null;
  const rawLines = String(req.body || '')
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map(line => String(line || '').replace(/^\uFEFF/, '').trim())
    .filter(Boolean);
  if (!rawLines.length) return res.status(400).json({ message: '文件为空' });

  let headerIndex = -1;
  let delimiter = ',';
  let header = [];
  let nameIdx = -1;
  let cardNoIdx = -1;
  let gradeIdx = -1;
  let classIdx = -1;
  let pNameIdx = -1;
  let pPhoneIdx = -1;
  let optionalFaceIdx = -1;

  for (let i = 0; i < rawLines.length; i++) {
    const rawLine = rawLines[i];
    if (isCommentCsvLine(rawLine)) continue;

    const currentDelimiter = detectCsvDelimiter(rawLine);
    const currentHeader = parseCsvLine(rawLine, currentDelimiter).map(h => h.replace(/"/g, '').trim());
    const currentNameIdx = findHeaderIndex(currentHeader, ['姓名']);
    const currentCardNoIdx = findHeaderIndex(currentHeader, ['学生卡号', '卡号']);
    const currentGradeIdx = findHeaderIndex(currentHeader, ['年级名称', '年级']);

    if (currentNameIdx !== -1 && currentCardNoIdx !== -1 && currentGradeIdx !== -1) {
      headerIndex = i;
      delimiter = currentDelimiter;
      header = currentHeader;
      nameIdx = currentNameIdx;
      cardNoIdx = currentCardNoIdx;
      gradeIdx = currentGradeIdx;
      classIdx = findHeaderIndex(header, ['班级名称', '班级']);
      pNameIdx = findHeaderIndex(header, ['家长姓名']);
      pPhoneIdx = findHeaderIndex(header, ['家长电话']);
      optionalFaceIdx = findHeaderIndex(header, ['人脸ID', '人脸ID(选填)']);
      break;
    }
  }

  if (headerIndex === -1) {
    return res.status(400).json({ message: '格式错误，请使用下载的模板' });
  }

  const dataLines = rawLines.slice(headerIndex + 1).filter(line => !isCommentCsvLine(line));
  if (!dataLines.length) return res.status(400).json({ message: '没有可导入的数据行' });

  let created = 0;
  const errors = [];
  const cardNosInFile = new Set();
  const studentsInScope = await loadStudentRows(schoolId ? { school_id: schoolId } : {});
  const existingCardNoSet = new Set(
    studentsInScope
      .map(item => normalizeStudentCardNo(item.card_no))
      .filter(Boolean)
  );

  for (const [i, line] of dataLines.entries()) {
    const cols = parseCsvLine(line, delimiter).map(c => c.replace(/"/g, '').trim());
    const name = cols[nameIdx];
    const rawCardNo = cardNoIdx >= 0 ? cols[cardNoIdx] : '';
    const cardNo = normalizeStudentCardNo(rawCardNo);
    const gradeName = gradeIdx >= 0 ? (cols[gradeIdx] || '') : '';
    const className = classIdx >= 0 ? (cols[classIdx] || '') : '';

    if (!name) {
      errors.push(`第${headerIndex + i + 2}行：姓名不能为空`);
      continue;
    }
    if (!cardNo) {
      errors.push(`第${headerIndex + i + 2}行：学生卡号不能为空`);
      continue;
    }
    if (cardNosInFile.has(cardNo)) {
      errors.push(`第${headerIndex + i + 2}行：学生卡号重复 ${cardNo}`);
      continue;
    }
    if (existingCardNoSet.has(cardNo)) {
      errors.push(`第${headerIndex + i + 2}行：学生卡号已存在 ${cardNo}`);
      continue;
    }

    let gradeId = null;
    let classId = null;

    if (gradeName) {
      const grade = await prisma.grade.findFirst({
        where: {
          name: gradeName,
          ...(schoolId ? { schoolId } : {})
        }
      });
      if (!grade) {
        errors.push(`第${headerIndex + i + 2}行：找不到年级名称 ${gradeName}`);
        continue;
      }
      gradeId = grade.id;
    }

    if (className) {
      const cls = await prisma.class.findFirst({
        where: {
          name: className,
          ...(schoolId ? { schoolId } : {}),
          ...(gradeId ? { gradeId } : {})
        }
      });
      if (!cls) {
        errors.push(`第${headerIndex + i + 2}行：找不到班级名称 ${className}`);
        continue;
      }
      classId = cls.id;
    }

    await createStudentRecord({
      name,
      card_no: cardNo,
      grade_id: gradeId,
      class_id: classId,
      school_id: schoolId,
      parent_name: pNameIdx >= 0 ? cols[pNameIdx] : '',
      parent_phone: pPhoneIdx >= 0 ? cols[pPhoneIdx] : '',
      face_id: optionalFaceIdx >= 0 ? (cols[optionalFaceIdx] || '') : ''
    });

    cardNosInFile.add(cardNo);
    existingCardNoSet.add(cardNo);
    created++;
  }

  res.json({ success: created > 0, created, errors });
});

app.post('/api/students/photo-import', auth, photoUpload.array('photos'), async (req, res) => {
  const schoolId = req.query.school_id ? +req.query.school_id : null;
  const files = Array.isArray(req.files) ? req.files : [];

  if (!files.length) {
    return res.status(400).json({ message: '请上传照片文件' });
  }

  const studentsInScope = await loadStudentRows(schoolId ? { school_id: schoolId } : {});
  const studentMap = new Map();
  studentsInScope.forEach(student => {
    const normalizedCardNo = normalizeStudentCardNo(student.card_no);
    if (normalizedCardNo && !studentMap.has(normalizedCardNo)) {
      studentMap.set(normalizedCardNo, student);
    }
  });

  let success = 0;
  let skipped = 0;
  const errors = [];
  const results = [];
  const processedCardNos = new Set();

  for (const file of files) {
    const ext = path.extname(file.originalname || '');
    const basename = path.basename(file.originalname || '', ext);
    const cardNo = normalizeStudentCardNo(basename);

    if (!cardNo) {
      errors.push(`${file.originalname}：无法从文件名识别学生卡号`);
      continue;
    }
    if (processedCardNos.has(cardNo)) {
      errors.push(`${file.originalname}：同一批次中学生卡号重复 ${cardNo}`);
      continue;
    }

    const student = studentMap.get(cardNo);
    if (!student) {
      errors.push(`${file.originalname}：找不到学生卡号 ${cardNo}`);
      continue;
    }

    const currentStatus = detectPhotoImportStatus(student.face_id);
    if (student.face_id && currentStatus.source !== 'photo-import') {
      skipped++;
      processedCardNos.add(cardNo);
      results.push({
        filename: file.originalname,
        card_no: cardNo,
        student_id: student.id,
        student_name: student.name,
        face_id: student.face_id,
        status: 'skipped',
        message: '该学生已有现成人脸ID，已跳过覆盖'
      });
      continue;
    }

    const generatedFaceId = buildPhotoImportFaceId(cardNo);
    await updateStudentRecord(student.id, { face_id: generatedFaceId });

    processedCardNos.add(cardNo);
    success++;
    results.push({
      filename: file.originalname,
      card_no: cardNo,
      student_id: student.id,
      student_name: student.name,
      face_id: generatedFaceId,
      status: 'pending',
      message: '已记录照片，等待后续人脸服务或终端完成正式绑定'
    });
  }

  res.json({
    success: success > 0,
    updated: success,
    skipped,
    errors,
    results,
    message: success
      ? '照片已按学生卡号完成匹配，已写入待绑定状态'
      : '没有成功匹配任何照片'
  });
});

// ── 搭乘调班模板（含当前班次，供批量调班用）────────────────
app.get('/api/ride-assign/change-template', auth, async (req, res) => {
  const { school_id } = req.query;
  const students = await buildRideAssignStudents({
    schoolId: school_id ? +school_id : null
  });
  const sessionList = await prisma.session.findMany({
    where: school_id ? { schoolId: +school_id } : {},
    orderBy: { id: 'asc' }
  });
  const comment     = '# 用途：批量调整学生搭乘班次\n';
  const sesHint     = '# 可用班次：' + sessionList.map(x => `${x.name}(${x.type==='morning'?'上学':'放学'})`).join('  ') + '\n';
  const rule        = '# 规则：按学生卡号匹配；新班次名称用"|"分隔多个，留空=清空所有班次，不修改=保持原值\n';
  const header      = '学生卡号,姓名,年级,班级,当前班次名称,新班次名称';
  const lines = students.map(s => {
    const curNames = s.Sessions.map(session => session.name).join('|');
    return `"${s.card_no||''}","${s.name}","${s.Grade?.name||''}","${s.Class?.name||''}","${curNames}","${curNames}"`;
  });
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="ride-change-template.csv"');
  res.send('﻿' + comment + sesHint + rule + [header, ...lines].join('\n'));
});

// ── 学生批量调班级（弹窗直接操作）────────────────────────
app.post('/api/students/batch-class', auth, async (req, res) => {
  const { student_ids, grade_id, class_id } = req.body;
  if (!student_ids?.length) return res.status(400).json({ message: 'student_ids 不能为空' });
  let updated = 0;

  for (const studentId of student_ids) {
    const student = await prisma.student.findUnique({ where: { id: studentId } });
    if (!student) continue;
    await prisma.student.update({
      where: { id: studentId },
      data: {
        ...(grade_id != null ? { gradeId: grade_id || null } : {}),
        ...(class_id !== undefined ? { classId: class_id || null } : {})
      }
    });
    updated++;
  }

  res.json({ success: true, updated });
});

// ── 学生调班级模板 ────────────────────────────────────────
app.get('/api/students/class-change-template', auth, async (req, res) => {
  const { school_id } = req.query;
  const students = await prisma.student.findMany({
    where: school_id ? { schoolId: +school_id } : {},
    include: { grade: true, class: true },
    orderBy: { id: 'asc' }
  });
  const gradeList = await prisma.grade.findMany({
    where: school_id ? { schoolId: +school_id } : {},
    orderBy: { id: 'asc' }
  });
  const classList = await prisma.class.findMany({
    where: school_id ? { schoolId: +school_id } : {},
    include: { grade: true },
    orderBy: { id: 'asc' }
  });
  const comment    = '# 用途：批量调整学生年级和班级\n';
  const gradeHint  = '# 可用年级：' + gradeList.map(g => g.name).join('、') + '\n';
  const classHint  = '# 可用班级：' + classList.map(c => `${c.grade?.name||''}-${c.name}`).join('、') + '\n';
  const rule   = '# 规则：修改"新年级名称"或"新班级名称"列，留空=不修改，填0=清空\n';
  const header = 'ID,姓名,当前年级,当前班级,新年级名称,新班级名称';
  const lines  = students.map(s => {
    return `"${s.id}","${s.name}","${s.grade?.name||''}","${s.class?.name||''}","${s.grade?.name||''}","${s.class?.name||''}"`;
  });
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="students-class-change-template.csv"');
  res.send('﻿' + comment + gradeHint + classHint + rule + [header, ...lines].join('\n'));
});

// ── 学生调班级导入 ────────────────────────────────────────
app.post('/api/students/class-change-import', auth, express.text({ type: '*/*' }), async (req, res) => {
  const lines = req.body.split('\n').filter(l => l && !l.startsWith('#'));
  if (!lines.length) return res.status(400).json({ message: '文件为空' });
  const header      = lines[0].split(',').map(h => h.replace(/"/g, '').trim());
  const idIdx       = header.indexOf('ID');
  const newGradeIdx = header.indexOf('新年级名称');
  const newClassIdx = header.indexOf('新班级名称');
  if (idIdx === -1 || newGradeIdx === -1 || newClassIdx === -1)
    return res.status(400).json({ message: '格式错误，请使用下载的调班级模板' });

  let updated = 0;
  const errors = [];

  for (const [i, line] of lines.slice(1).entries()) {
    const cols       = line.split(',').map(c => c.replace(/"/g, '').trim());
    const studentId  = +cols[idIdx];
    const rawGrade   = cols[newGradeIdx];
    const rawClass   = cols[newClassIdx];
    const student    = await prisma.student.findUnique({ where: { id: studentId } });
    if (!student) {
      errors.push(`第${i+2}行：找不到学生ID ${studentId}`);
      continue;
    }

    const data = {};
    let nextGradeId = student.gradeId;

    if (rawGrade !== '') {
      if (rawGrade === '0') {
        nextGradeId = null;
        data.gradeId = null;
      } else {
        const grade = await prisma.grade.findFirst({
          where: {
            name: rawGrade,
            ...(student.schoolId ? { schoolId: student.schoolId } : {})
          }
        });
        if (!grade) {
          errors.push(`第${i+2}行：找不到年级名称 ${rawGrade}`);
          continue;
        }
        nextGradeId = grade.id;
        data.gradeId = grade.id;
      }
    }

    if (rawClass !== '') {
      if (rawClass === '0') {
        data.classId = null;
      } else {
        const cls = await prisma.class.findFirst({
          where: {
            name: rawClass,
            ...(student.schoolId ? { schoolId: student.schoolId } : {}),
            ...(nextGradeId ? { gradeId: nextGradeId } : {})
          }
        });
        if (!cls) {
          errors.push(`第${i+2}行：找不到班级名称 ${rawClass}`);
          continue;
        }
        data.classId = cls.id;
      }
    }

    await prisma.student.update({ where: { id: studentId }, data });
    updated++;
  }

  res.json({ success: true, updated, errors });
});

// ── 搭乘管理 ──────────────────────────────────────────────

async function buildRideAssignStudents(filters = {}) {
  const schoolId = filters.schoolId ? Number(filters.schoolId) : null;
  const gradeId = filters.gradeId ? Number(filters.gradeId) : null;
  const classId = filters.classId ? Number(filters.classId) : null;
  const name = filters.name ? String(filters.name).trim() : '';
  const escapedName = name ? name.replace(/'/g, "''") : '';

  const conditions = [];
  if (schoolId) conditions.push(`s.school_id = ${schoolId}`);
  if (gradeId) conditions.push(`s.grade_id = ${gradeId}`);
  if (classId) conditions.push(`s.class_id = ${classId}`);
  if (name) conditions.push(`s.name LIKE '%${escapedName}%'`);

  const whereSql = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const rows = await prisma.$queryRawUnsafe(`
    SELECT
      s.id,
      s.name,
      s.grade_id,
      s.class_id,
      s.school_id,
      s.parent_phone,
      s.parent_name,
      s.face_id,
      s.card_no,
      g.id AS grade_ref_id,
      g.name AS grade_name,
      c.id AS class_ref_id,
      c.name AS class_name,
      ss.session_id,
      se.name AS session_name,
      se.type AS session_type,
      se.depart_time AS session_depart_time
    FROM students s
    LEFT JOIN grades g ON s.grade_id = g.id
    LEFT JOIN classes c ON s.class_id = c.id
    LEFT JOIN student_sessions ss ON s.id = ss.student_id
    LEFT JOIN sessions se ON ss.session_id = se.id
    ${whereSql}
    ORDER BY s.id ASC, se.id ASC
  `);

  const studentMap = new Map();
  for (const row of rows) {
    if (!studentMap.has(row.id)) {
      studentMap.set(row.id, {
        id: row.id,
        name: row.name,
        grade_id: row.grade_id,
        class_id: row.class_id,
        school_id: row.school_id,
        parent_phone: row.parent_phone,
        parent_name: row.parent_name,
        face_id: row.face_id,
        card_no: row.card_no || null,
        session_ids: [],
        Grade: row.grade_ref_id ? { id: row.grade_ref_id, name: row.grade_name } : null,
        Class: row.class_ref_id ? { id: row.class_ref_id, name: row.class_name } : null,
        Sessions: []
      });
    }

    const student = studentMap.get(row.id);
    if (row.session_id && !student.session_ids.includes(row.session_id)) {
      student.session_ids.push(row.session_id);
      student.Sessions.push({
        id: row.session_id,
        name: row.session_name,
        type: row.session_type,
        depart_time: row.session_depart_time
      });
    }
  }

  let mapped = Array.from(studentMap.values());

  if (filters.sessionId === 'none') {
    mapped = mapped.filter(student => student.Sessions.length === 0);
  } else if (filters.sessionId) {
    const sid = +filters.sessionId;
    mapped = mapped.filter(student => student.Sessions.some(session => session.id === sid));
  }

  return mapped;
}

// 查询（支持按年级/班级/班次/姓名筛选）
app.get('/api/ride-assign', auth, async (req, res) => {
  const { school_id, grade_id, class_id, session_id, name } = req.query;
  const list = await buildRideAssignStudents({
    schoolId: school_id ? +school_id : null,
    gradeId: grade_id ? +grade_id : null,
    classId: class_id ? +class_id : null,
    sessionId: session_id,
    name: name || ''
  });
  res.json(list);
});

// 单个学生更新班次列表（覆盖）
app.put('/api/ride-assign/:studentId', auth, async (req, res) => {
  const studentId = +req.params.studentId;
  const student = await prisma.student.findUnique({ where: { id: studentId } });
  if (!student) return res.status(404).json({ message: 'Not found' });

  const sessionIds = Array.isArray(req.body.session_ids)
    ? [...new Set(req.body.session_ids.map(Number).filter(Boolean))]
    : [];

  await prisma.studentSession.deleteMany({ where: { studentId } });
  if (sessionIds.length) {
    await prisma.studentSession.createMany({
      data: sessionIds.map(sessionId => ({ studentId, sessionId })),
      skipDuplicates: true
    });
  }

  res.json({ success: true });
});

// 批量追加班次
app.post('/api/ride-assign/batch-add', auth, async (req, res) => {
  const studentIds = Array.isArray(req.body.student_ids)
    ? [...new Set(req.body.student_ids.map(Number).filter(Boolean))]
    : [];
  const sessionId = Number(req.body.session_id);

  if (!studentIds.length || !sessionId) return res.json({ success: true, updated: 0 });

  const existingStudents = await prisma.student.findMany({
    where: { id: { in: studentIds } },
    select: { id: true }
  });
  const validStudentIds = existingStudents.map(item => item.id);

  if (validStudentIds.length) {
    await prisma.studentSession.createMany({
      data: validStudentIds.map(studentId => ({ studentId, sessionId })),
      skipDuplicates: true
    });
  }

  res.json({ success: true, updated: validStudentIds.length });
});

// 批量移除班次
app.post('/api/ride-assign/batch-remove', auth, async (req, res) => {
  const studentIds = Array.isArray(req.body.student_ids)
    ? [...new Set(req.body.student_ids.map(Number).filter(Boolean))]
    : [];
  const sessionId = Number(req.body.session_id);

  if (!studentIds.length || !sessionId) return res.json({ success: true, updated: 0 });

  const result = await prisma.studentSession.deleteMany({
    where: {
      studentId: { in: studentIds },
      sessionId
    }
  });

  res.json({ success: true, updated: result.count });
});

// 批量覆盖班次
app.post('/api/ride-assign/batch-set', auth, async (req, res) => {
  const studentIds = Array.isArray(req.body.student_ids)
    ? [...new Set(req.body.student_ids.map(Number).filter(Boolean))]
    : [];
  const sessionIds = Array.isArray(req.body.session_ids)
    ? [...new Set(req.body.session_ids.map(Number).filter(Boolean))]
    : [];

  if (!studentIds.length) return res.json({ success: true, updated: 0 });

  await prisma.studentSession.deleteMany({
    where: { studentId: { in: studentIds } }
  });

  if (sessionIds.length) {
    await prisma.studentSession.createMany({
      data: studentIds.flatMap(studentId =>
        sessionIds.map(sessionId => ({ studentId, sessionId }))
      ),
      skipDuplicates: true
    });
  }

  res.json({ success: true, updated: studentIds.length });
});

// 导出 CSV
app.get('/api/ride-assign/export', auth, async (req, res) => {
  const { school_id } = req.query;
  const list = await buildRideAssignStudents({
    schoolId: school_id ? +school_id : null
  });
  const header = '学生卡号,姓名,年级,班级,班次ID列表,班次名称列表';
  const lines = list.map(student => {
    const sessionIds = student.Sessions.map(session => session.id);
    return `"${student.card_no||''}","${student.name}","${student.Grade?.name||''}","${student.Class?.name||''}","${sessionIds.join('|')}","${student.Sessions.map(session => session.name).join('|')}"`;
  });
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="ride-assign.csv"');
  res.send('﻿' + [header, ...lines].join('\n'));
});

// 下载导入模板
app.get('/api/ride-assign/template', auth, async (req, res) => {
  const { school_id } = req.query;
  const students = await buildRideAssignStudents({
    schoolId: school_id ? +school_id : null
  });
  const sessionList = await prisma.session.findMany({
    where: school_id ? { schoolId: +school_id } : {},
    orderBy: { id: 'asc' }
  });
  const comment = '# 说明：学生卡号用于匹配学生；班次名称用"|"分隔多个班次，留空表示不搭乘任何班次；上车站点、下车站点会同步写回学生管理中的默认站点\n';
  const sessionHint = '# 可用班次：' + sessionList.map(x => x.name).join('  ') + '\n';
  const header = '学生卡号,姓名,班级,年级,班次名称,上车站点,下车站点';
  const lines = students.map(student => {
    const sessionNames = student.Sessions.map(session => session.name);
    return `"${student.card_no||''}","${student.name}","${student.Class?.name||''}","${student.Grade?.name||''}","${sessionNames.join('|')}","",""`;
  });
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="ride-assign-template.csv"');
  res.send('﻿' + comment + sessionHint + [header, ...lines].join('\n'));
});

// CSV 导入
function parseCsvLine(line = '', delimiter = ',') {
  const result = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const next = line[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === delimiter && !inQuotes) {
      result.push(current);
      current = '';
      continue;
    }

    current += char;
  }

  result.push(current);
  return result;
}

function detectCsvDelimiter(line = '') {
  const commaCount = parseCsvLine(line, ',').length;
  const tabCount = parseCsvLine(line, '\t').length;
  const semicolonCount = parseCsvLine(line, ';').length;

  if (tabCount > commaCount && tabCount >= semicolonCount) return '\t';
  if (semicolonCount > commaCount && semicolonCount > tabCount) return ';';
  return ',';
}

function normalizeCsvHeaderName(value = '') {
  return String(value)
    .replace(/^\uFEFF/, '')
    .replace(/[：:]/g, '')
    .replace(/\s+/g, '')
    .trim();
}

function findHeaderIndex(header = [], aliases = []) {
  const normalizedAliases = aliases.map(normalizeCsvHeaderName);
  return header.findIndex(item => normalizedAliases.includes(normalizeCsvHeaderName(item)));
}

function normalizeStudentCardNo(value = '') {
  return String(value || '')
    .replace(/^\uFEFF/, '')
    .trim()
    .replace(/\.0+$/, '');
}

function expandStudentCardNoCandidates(value = '') {
  const normalized = normalizeStudentCardNo(value);
  if (!normalized) return [];

  const candidates = new Set([normalized]);
  const scientificMatch = normalized.match(/^(\d+(?:\.\d+)?)e\+(\d+)$/i);
  if (scientificMatch) {
    const base = scientificMatch[1];
    const exponent = Number(scientificMatch[2]);
    const digits = base.replace('.', '');
    const decimalPlaces = (base.split('.')[1] || '').length;
    const zerosToAdd = exponent - decimalPlaces;
    if (zerosToAdd >= 0) candidates.add(digits + '0'.repeat(zerosToAdd));
  }

  return Array.from(candidates);
}

function isCommentCsvLine(line = '') {
  const normalized = String(line || '').replace(/^\uFEFF/, '').trimStart();
  return !normalized || normalized.startsWith('#');
}

function locateRideAssignHeader(lines = [], options = {}) {
  const { allowChangeTemplate = false } = options;

  for (let i = 0; i < lines.length; i++) {
    const rawLine = String(lines[i] || '').replace(/^\uFEFF/, '').trim();
    if (isCommentCsvLine(rawLine)) continue;

    const delimiter = detectCsvDelimiter(rawLine);
    const header = parseCsvLine(rawLine, delimiter).map(h => h.replace(/"/g, '').trim());
    const cardNoIdx = findHeaderIndex(header, ['学生卡号', '卡号']);
    const idIdx = findHeaderIndex(header, ['ID', '学生ID']);
    const sessionNameIdx = findHeaderIndex(header, ['班次名称', '班次名称列表']);
    const changeSessionNameIdx = findHeaderIndex(header, ['新班次名称']);
    const boardStopIdx = findHeaderIndex(header, ['上车站点', '默认上车站点']);
    const alightStopIdx = findHeaderIndex(header, ['下车站点', '默认下车站点']);

    const hasTargetSessionColumn = sessionNameIdx !== -1 || (allowChangeTemplate && changeSessionNameIdx !== -1);
    if ((cardNoIdx !== -1 || idIdx !== -1) && hasTargetSessionColumn) {
      return {
        headerIndex: i,
        delimiter,
        header,
        cardNoIdx,
        idIdx,
        sessionNameIdx,
        changeSessionNameIdx,
        boardStopIdx,
        alightStopIdx
      };
    }
  }

  return null;
}

function buildStopLookupName(value = '') {
  return String(value || '').trim();
}

async function findStudentStopByName(stopName, schoolId) {
  const normalizedName = buildStopLookupName(stopName);
  if (!normalizedName) return null;

  const rows = await prisma.$queryRawUnsafe(`
    SELECT st.id, st.name
    FROM stops st
    INNER JOIN sessions se ON st.session_id = se.id
    ${schoolId ? `WHERE se.school_id = ${Number(schoolId)} AND st.name = '${normalizedName.replace(/'/g, "''")}'` : `WHERE st.name = '${normalizedName.replace(/'/g, "''")}'`}
    ORDER BY st.id ASC
    LIMIT 1
  `);

  return rows[0] || null;
}

app.post('/api/ride-assign/import', auth, express.text({ type: '*/*' }), async (req, res) => {
  const schoolId = req.query.school_id ? +req.query.school_id : null;
  const rawLines = String(req.body || '')
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map(line => String(line || '').replace(/^\uFEFF/, '').trim())
    .filter(Boolean);

  if (!rawLines.length) return res.status(400).json({ message: '文件为空' });

  const headerInfo = locateRideAssignHeader(rawLines);
  if (!headerInfo) {
    return res.status(400).json({ message: '格式错误，请使用下载的模板；请保留“学生卡号/班次名称”表头，建议直接编辑下载的原模板' });
  }

  const { headerIndex, delimiter, header, cardNoIdx, idIdx, sessionNameIdx, boardStopIdx, alightStopIdx } = headerInfo;
  console.log('ride-assign import header:', JSON.stringify(header));

  const schoolSessions = await prisma.session.findMany({
    where: schoolId ? { schoolId } : {},
    select: { id: true, name: true }
  });
  const studentsInScope = await loadStudentRows(schoolId ? { school_id: schoolId } : {});

  let updated = 0;
  const errors = [];
  const dataLines = rawLines.slice(headerIndex + 1).filter(line => !isCommentCsvLine(line));

  for (const [index, line] of dataLines.entries()) {
    const cols = parseCsvLine(line, delimiter).map(c => c.replace(/"/g, '').trim());
    const rawCardNo = cardNoIdx !== -1 ? (cols[cardNoIdx] || '').trim() : '';
    const cardNo = normalizeStudentCardNo(rawCardNo);
    const cardNoCandidates = expandStudentCardNoCandidates(rawCardNo);
    const studentId = idIdx !== -1 ? Number(cols[idIdx]) : null;
    const rawNames = cols[sessionNameIdx]
      ? [...new Set(String(cols[sessionNameIdx]).split('|').map(item => item.trim()).filter(Boolean))]
      : [];
    const boardStopName = boardStopIdx !== -1 ? buildStopLookupName(cols[boardStopIdx] || '') : '';
    const alightStopName = alightStopIdx !== -1 ? buildStopLookupName(cols[alightStopIdx] || '') : '';

    if (!cardNo && !studentId) {
      errors.push(`第${headerIndex + index + 2}行：学生卡号为空`);
      continue;
    }

    const student = cardNoCandidates.length
      ? studentsInScope.find(item => cardNoCandidates.includes(normalizeStudentCardNo(item.card_no)))
      : await prisma.student.findFirst({
          where: {
            ...(studentId ? { id: studentId } : {}),
            ...(schoolId ? { schoolId } : {})
          }
        });

    if (!student) {
      errors.push(cardNo
        ? `第${headerIndex + index + 2}行：找不到当前学校的学生卡号 ${cardNo}`
        : `第${headerIndex + index + 2}行：找不到当前学校的学生ID ${studentId}`);
      continue;
    }

    const matchedSessions = rawNames.map(name => schoolSessions.find(session => session.name === name)).filter(Boolean);
    const matchedIds = matchedSessions.map(session => session.id);
    const badNames = rawNames.filter(name => !matchedSessions.find(session => session.name === name));
    const boardStop = boardStopName ? await findStudentStopByName(boardStopName, schoolId) : null;
    const alightStop = alightStopName ? await findStudentStopByName(alightStopName, schoolId) : null;

    if (badNames.length) {
      errors.push(`第${headerIndex + index + 2}行：找不到当前学校的班次名称 ${badNames.join('|')}`);
      continue;
    }
    if (boardStopName && !boardStop) {
      errors.push(`第${headerIndex + index + 2}行：找不到当前学校的上车站点 ${boardStopName}`);
      continue;
    }
    if (alightStopName && !alightStop) {
      errors.push(`第${headerIndex + index + 2}行：找不到当前学校的下车站点 ${alightStopName}`);
      continue;
    }

    await prisma.studentSession.deleteMany({ where: { studentId: student.id } });

    if (matchedIds.length) {
      await prisma.studentSession.createMany({
        data: matchedIds.map(sessionId => ({ studentId: student.id, sessionId })),
        skipDuplicates: true
      });
    }

    await prisma.$executeRaw`
      UPDATE students
      SET
        board_stop_id = ${boardStop ? Number(boardStop.id) : null},
        alight_stop_id = ${alightStop ? Number(alightStop.id) : null}
      WHERE id = ${student.id}
    `;

    updated++;
  }

  res.json({ success: true, updated, errors });
});
app.post('/api/ride-assign/change-import', auth, express.text({ type: '*/*' }), async (req, res) => {
  const schoolId = req.query.school_id ? +req.query.school_id : null;
  const rawLines = String(req.body || '')
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map(line => String(line || '').replace(/^\uFEFF/, '').trim())
    .filter(Boolean);

  if (!rawLines.length) return res.status(400).json({ message: '文件为空' });

  const headerInfo = locateRideAssignHeader(rawLines, { allowChangeTemplate: true });
  if (!headerInfo) {
    return res.status(400).json({ message: '格式错误，请使用下载的调班模板' });
  }

  const { headerIndex, delimiter, header, cardNoIdx, idIdx, changeSessionNameIdx } = headerInfo;
  const newSessionNameIdx = changeSessionNameIdx !== -1
    ? changeSessionNameIdx
    : findHeaderIndex(header, ['新班次名称', '班次名称', '班次名称列表']);
  if (newSessionNameIdx === -1) {
    return res.status(400).json({ message: '格式错误，请使用下载的调班模板' });
  }

  const schoolSessions = await prisma.session.findMany({
    where: schoolId ? { schoolId } : {},
    select: { id: true, name: true }
  });
  const studentsInScope = await loadStudentRows(schoolId ? { school_id: schoolId } : {});

  let updated = 0;
  const errors = [];
  const dataLines = rawLines.slice(headerIndex + 1).filter(line => !isCommentCsvLine(line));

  for (const [index, line] of dataLines.entries()) {
    const cols = parseCsvLine(line, delimiter).map(c => c.replace(/"/g, '').trim());
    const rawCardNo = cardNoIdx !== -1 ? (cols[cardNoIdx] || '').trim() : '';
    const cardNo = normalizeStudentCardNo(rawCardNo);
    const cardNoCandidates = expandStudentCardNoCandidates(rawCardNo);
    const studentId = idIdx !== -1 ? Number(cols[idIdx]) : null;
    const rawNames = cols[newSessionNameIdx]
      ? [...new Set(String(cols[newSessionNameIdx]).split('|').map(item => item.trim()).filter(Boolean))]
      : [];

    if (!cardNo && !studentId) {
      errors.push(`第${headerIndex + index + 2}行：学生卡号为空`);
      continue;
    }

    const student = cardNoCandidates.length
      ? studentsInScope.find(item => cardNoCandidates.includes(normalizeStudentCardNo(item.card_no)))
      : await prisma.student.findFirst({
          where: {
            ...(studentId ? { id: studentId } : {}),
            ...(schoolId ? { schoolId } : {})
          }
        });

    if (!student) {
      errors.push(cardNo
        ? `第${headerIndex + index + 2}行：找不到当前学校的学生卡号 ${cardNo}`
        : `第${headerIndex + index + 2}行：找不到当前学校的学生ID ${studentId}`);
      continue;
    }

    const matchedSessions = rawNames.map(name => schoolSessions.find(session => session.name === name)).filter(Boolean);
    const matchedIds = matchedSessions.map(session => session.id);
    const badNames = rawNames.filter(name => !matchedSessions.find(session => session.name === name));

    if (badNames.length) {
      errors.push(`第${headerIndex + index + 2}行：找不到当前学校的班次名称 ${badNames.join('|')}`);
      continue;
    }

    await prisma.studentSession.deleteMany({ where: { studentId: student.id } });

    if (matchedIds.length) {
      await prisma.studentSession.createMany({
        data: matchedIds.map(sessionId => ({ studentId: student.id, sessionId })),
        skipDuplicates: true
      });
    }

    updated++;
  }

  res.json({ success: true, updated, errors });
});


// ── 实时地图 ──────────────────────────────────────────────
function buildBusLocationPayload(location) {
  if (!location) return null;

  return {
    busId: location.busId,
    lat: location.lat,
    lng: location.lng,
    speed: location.speed,
    timestamp: location.timestamp
  };
}

async function saveBusLocation(payload) {
  const location = await prisma.busLocation.upsert({
    where: { busId: payload.busId },
    update: {
      sessionId: payload.sessionId,
      lat: payload.lat,
      lng: payload.lng,
      speed: payload.speed,
      timestamp: payload.timestamp
    },
    create: {
      busId: payload.busId,
      sessionId: payload.sessionId,
      lat: payload.lat,
      lng: payload.lng,
      speed: payload.speed,
      timestamp: payload.timestamp
    }
  });

  const livePayload = buildBusLocationPayload(location);
  io.emit('bus:location', livePayload);
  return livePayload;
}

app.get('/api/realtime-map/sessions', auth, async (req, res) => {
  const { school_id, session_id, name } = req.query;
  const sessions = await prisma.session.findMany({
    where: {
      ...(school_id ? { schoolId: +school_id } : {}),
      ...(session_id ? { id: +session_id } : {}),
      ...(name ? { name: { contains: String(name) } } : {}),
      NOT: { busId: null }
    },
    include: {
      bus: true,
      route: true,
      school: true,
      busLocations: {
        orderBy: { timestamp: 'desc' },
        take: 1
      }
    },
    orderBy: { id: 'asc' }
  });

  res.json(sessions.map(session => {
    const location = buildBusLocationPayload(session.busLocations?.[0] || null);

    return {
      sessionId: session.id,
      sessionName: session.name,
      type: session.type,
      departTime: session.departTime,
      schoolId: session.schoolId,
      schoolName: session.school?.name || '',
      routeId: session.routeId,
      routeName: session.route?.name || '',
      busId: session.busId,
      busPlate: session.bus?.plate || '',
      hasLocation: !!location,
      lat: location?.lat ?? null,
      lng: location?.lng ?? null,
      speed: location?.speed ?? null,
      timestamp: location?.timestamp ?? null
    };
  }));
});

// ── 乘车记录 ──────────────────────────────────────────────
app.get('/api/ride-records', auth, async (req, res) => {
  const { page = 1, pageSize = 20, date, school_id } = req.query;
  const currentPage = +page || 1;
  const size = +pageSize || 20;

  const where = {};
  if (date) {
    const start = new Date(`${date}T00:00:00`);
    const end = new Date(`${date}T23:59:59.999`);
    where.boardTime = { gte: start, lte: end };
  }
  if (school_id) {
    where.student = { schoolId: +school_id };
  }

  const total = await prisma.rideRecord.count({ where });
  const list = await prisma.rideRecord.findMany({
    where,
    include: {
      student: true,
      bus: true
    },
    orderBy: { id: 'desc' },
    skip: (currentPage - 1) * size,
    take: size
  });

  const data = list.map(item => ({
    id: item.id,
    student_id: item.studentId,
    bus_id: item.busId,
    board_time: item.boardTime,
    alight_time: item.alightTime,
    board_stop: item.boardStop,
    alight_stop: item.alightStop,
    Student: item.student || null,
    Bus: item.bus || null
  }));

  res.json({ total, data });
});

// ── 通知 ──────────────────────────────────────────────────
app.get('/api/notifications', auth, async (req, res) => {
  const { school_id } = req.query;
  const list = await prisma.notification.findMany({
    where: school_id ? { student: { schoolId: +school_id } } : {},
    include: { student: true },
    orderBy: { id: 'desc' }
  });
  res.json(list.map(item => ({
    id: item.id,
    student_id: item.studentId,
    type: item.type,
    content: item.content,
    sent_at: item.sentAt,
    is_read: item.isRead,
    Student: item.student || null
  })));
});
app.put('/api/notifications/:id/read', auth, async (req, res) => {
  const id = +req.params.id;
  const notification = await prisma.notification.findUnique({ where: { id } });
  if (!notification) return res.status(404).json({ message: 'Not found' });

  await prisma.notification.update({
    where: { id },
    data: { isRead: 1 }
  });
  res.json({ success: true });
});

// ── Dashboard 统计 ────────────────────────────────────────
app.get('/api/dashboard', auth, async (req, res) => {
  const { school_id } = req.query;
  const sid = school_id ? +school_id : null;
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const end = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);

  const [activeBuses, totalStudents, todayRides, unreadNotifs] = await Promise.all([
    prisma.bus.count({ where: { ...(sid ? { schoolId: sid } : {}), status: 'active' } }),
    prisma.student.count({ where: sid ? { schoolId: sid } : {} }),
    prisma.rideRecord.count({
      where: {
        ...(sid ? { student: { schoolId: sid } } : {}),
        boardTime: { gte: start, lt: end }
      }
    }),
    prisma.notification.count({
      where: {
        ...(sid ? { student: { schoolId: sid } } : {}),
        isRead: 0
      }
    })
  ]);

  res.json({
    activeBuses,
    totalStudents,
    todayRides,
    unreadNotifs
  });
});

// ── App 端接口 ────────────────────────────────────────────

// 获取指定班次的学生列表（App 登录后拉取）
app.get('/api/app/students', auth, async (req, res) => {
  const { session_id } = req.query;
  if (!session_id) return res.status(400).json({ message: 'session_id required' });
  const sid = +session_id;

  const list = await prisma.student.findMany({
    where: {
      sessionLinks: {
        some: { sessionId: sid }
      }
    },
    include: {
      sessionLinks: {
        where: { sessionId: sid }
      }
    },
    orderBy: { id: 'asc' }
  });

  const stops = await prisma.stop.findMany({
    where: { sessionId: sid },
    orderBy: [{ order: 'asc' }, { id: 'asc' }]
  });
  const defaultStop = stops.find(s => s.name !== '学校')?.name || stops[0]?.name || '';

  res.json(list.map(s => ({
    id: s.id,
    name: s.name,
    card_no: s.cardNo,
    stop: defaultStop,
    face_id: s.faceId,
    face_import_status: detectPhotoImportStatus(s.faceId).status,
    face_import_source: detectPhotoImportStatus(s.faceId).source
  })));
});

app.post('/api/app/location', auth, async (req, res) => {
  const busId = Number(req.body.bus_id);
  const sessionId = Number(req.body.session_id);
  const lat = Number(req.body.lat);
  const lng = Number(req.body.lng);
  const speed = req.body.speed == null ? null : Number(req.body.speed);
  const timestamp = req.body.timestamp ? new Date(req.body.timestamp) : new Date();

  if (!busId || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return res.status(400).json({ message: 'bus_id, lat, lng required' });
  }

  if (!sessionId) {
    return res.status(400).json({ message: 'session_id required' });
  }

  if (req.user.role === 'escort' && !(req.user.session_ids || []).includes(sessionId)) {
    return res.status(403).json({ message: '无权上报该班次位置' });
  }

  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    select: { id: true, busId: true, schoolId: true }
  });
  if (!session) return res.status(404).json({ message: 'Session not found' });
  if (req.user.role === 'escort' && req.user.school_id && session.schoolId !== req.user.school_id) {
    return res.status(403).json({ message: '无权上报该学校班次位置' });
  }
  if (session.busId && session.busId !== busId) {
    return res.status(400).json({ message: 'session and bus do not match' });
  }

  const payload = {
    busId,
    sessionId,
    lat,
    lng,
    speed: Number.isFinite(speed) ? speed : null,
    timestamp
  };

  await saveBusLocation(payload);
  res.json({ success: true });
});

// App 上报考勤（人脸识别成功后调用）
app.post('/api/app/attendance', auth, async (req, res) => {
  const { student_id, bus_id, stop_name, session_id } = req.body;
  const studentId = +student_id;
  const busId = +bus_id;
  const sessionId = Number(session_id);

  const student = await prisma.student.findUnique({
    where: { id: studentId },
    include: { sessionLinks: true }
  });
  if (!student) return res.status(404).json({ message: 'Student not found' });

  if (req.user.role === 'escort') {
    if (!sessionId) return res.status(400).json({ message: 'session_id required' });
    if (!(req.user.session_ids || []).includes(sessionId)) {
      return res.status(403).json({ message: '无权提交该班次考勤' });
    }
    if (!(student.sessionLinks || []).some(link => link.sessionId === sessionId)) {
      return res.status(400).json({ message: 'student does not belong to session' });
    }
  }

  const now = new Date();
  await prisma.rideRecord.create({
    data: {
      studentId,
      busId,
      boardTime: now,
      alightTime: null,
      boardStop: stop_name || '',
      alightStop: ''
    }
  });

  await prisma.notification.create({
    data: {
      studentId,
      type: 'board',
      content: `${student.name}已于${now.toTimeString().slice(0,5)}在${stop_name || ''}上车`,
      sentAt: now,
      isRead: 0
    }
  });

  io.emit('attendance:update', { student_id: studentId, student_name: student.name, stop_name, time: now });
  res.json({ success: true });
});

// App 更新人脸 ID（采集成功后同步）
app.post('/api/app/face', auth, async (req, res) => {
  const { student_id, student_name, card_no, face_id, session_id, school_id } = req.body;
  const nextFaceId = String(face_id || '').trim();
  if (!nextFaceId) return res.status(400).json({ message: 'face_id required' });

  const sessionId = session_id ? Number(session_id) : null;
  const schoolId = school_id ? Number(school_id) : (req.user.school_id ? Number(req.user.school_id) : null);

  if (req.user.role === 'escort') {
    if (!sessionId) return res.status(400).json({ message: 'session_id required' });
    if (!(req.user.session_ids || []).includes(sessionId)) {
      return res.status(403).json({ message: '无权更新该班次学生人脸' });
    }
  }

  const matched = await findStudentForFaceBinding({
    studentId: student_id,
    cardNo: card_no,
    studentName: student_name,
    schoolId,
    sessionId
  });

  if (!matched) return res.status(404).json({ message: 'Student not found' });
  if (matched.ambiguous) {
    return res.status(400).json({ message: `匹配到多个同名学生，请改用 student_id 或 card_no 回传，共 ${matched.count} 条` });
  }

  const currentStatus = detectPhotoImportStatus(matched.faceId);
  const updatedFaceId = currentStatus.status === 'pending' ? nextFaceId : nextFaceId;

  await prisma.student.update({
    where: { id: matched.id },
    data: { faceId: updatedFaceId }
  });

  res.json({
    success: true,
    student_id: matched.id,
    student_name: matched.name,
    card_no: matched.cardNo,
    previous_face_id: matched.faceId || '',
    face_id: updatedFaceId,
    upgraded_from_pending: currentStatus.status === 'pending'
  });
});

// ── Socket.io 实时位置 ────────────────────────────────────
io.on('connection', socket => console.log('connected:', socket.id));

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
