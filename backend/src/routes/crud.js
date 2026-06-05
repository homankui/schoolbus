const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

module.exports = function createCrudRouter(prisma, {
  auth,
  isClassTeacherUser,
  buildClassTeacherStudentScope,
  isSchoolLeaderUser,
  buildSchoolScope,
  loadStudentRows,
  sanitizeStudentPayload,
  createStudentRecord,
  updateStudentRecord,
  attachStudentStops
}) {
  const studentFaceUploadDir = path.join(__dirname, '..', '..', 'uploads', 'student-faces');

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

    if (key === 'stops') {
      if (Object.prototype.hasOwnProperty.call(data, 'lat')) data.lat = data.lat === '' || data.lat == null ? null : Number(data.lat);
      if (Object.prototype.hasOwnProperty.call(data, 'lng')) data.lng = data.lng === '' || data.lng == null ? null : Number(data.lng);
      if (Object.prototype.hasOwnProperty.call(data, 'order')) data.order = data.order === '' || data.order == null ? null : Number(data.order);
      if (Object.prototype.hasOwnProperty.call(data, 'arrival_radius_m')) data.arrival_radius_m = data.arrival_radius_m === '' || data.arrival_radius_m == null ? null : Number(data.arrival_radius_m);
      if (Object.prototype.hasOwnProperty.call(data, 'arrive_time')) delete data.arrive_time;
      if (Object.prototype.hasOwnProperty.call(data, 'arriveTime')) delete data.arriveTime;
    }

    return data;
  }

  function buildModelData(key, body = {}) {
    const data = sanitizeModelData(key, { ...body });

    if (key === 'stops') {
      if (Object.prototype.hasOwnProperty.call(data, 'session_id')) {
        data.sessionId = Number(data.session_id) || null;
        delete data.session_id;
      }
      return data;
    }

    const renameMap = {
      fleets: { school_id: 'schoolId' },
      buses: { school_id: 'schoolId', fleet_id: 'fleetId' },
      drivers: { bus_id: 'busId', school_id: 'schoolId', fleet_id: 'fleetId' },
      routes: { school_id: 'schoolId' },
      sessions: { route_id: 'routeId', bus_id: 'busId', depart_time: 'departTime', school_id: 'schoolId' },
      grades: { school_id: 'schoolId' },
      classes: { grade_id: 'gradeId', school_id: 'schoolId' },
      students: { grade_id: 'gradeId', class_id: 'classId', school_id: 'schoolId', parent_phone: 'parentPhone', parent_name: 'parentName', parent_openid: 'parentOpenid', face_id: 'faceId', card_no: 'cardNo', board_stop_id: 'boardStopId', alight_stop_id: 'alightStopId' }
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

  function buildStudentUpdateData(body = {}) {
    const data = {};

    if (Object.prototype.hasOwnProperty.call(body, 'name')) data.name = body.name;
    if (Object.prototype.hasOwnProperty.call(body, 'grade_id')) data.grade = body.grade_id ? { connect: { id: +body.grade_id } } : { disconnect: true };
    if (Object.prototype.hasOwnProperty.call(body, 'class_id')) data.class = body.class_id ? { connect: { id: +body.class_id } } : { disconnect: true };
    if (Object.prototype.hasOwnProperty.call(body, 'school_id')) data.school = body.school_id ? { connect: { id: +body.school_id } } : { disconnect: true };
    if (Object.prototype.hasOwnProperty.call(body, 'parent_phone')) data.parentPhone = body.parent_phone || null;
    if (Object.prototype.hasOwnProperty.call(body, 'parent_name')) data.parentName = body.parent_name || null;
    if (Object.prototype.hasOwnProperty.call(body, 'parent_openid')) data.parentOpenid = body.parent_openid || null;
    if (Object.prototype.hasOwnProperty.call(body, 'face_id')) data.faceId = body.face_id || null;
    if (Object.prototype.hasOwnProperty.call(body, 'card_no')) data.cardNo = body.card_no || null;
    if (Object.prototype.hasOwnProperty.call(body, 'board_stop_id')) data.boardStopId = body.board_stop_id || null;
    if (Object.prototype.hasOwnProperty.call(body, 'alight_stop_id')) data.alightStopId = body.alight_stop_id || null;

    return data;
  }

  async function ensureStudentSessionStopColumns() {
    const columns = await prisma.$queryRawUnsafe(`
      SHOW COLUMNS FROM student_sessions LIKE 'board_stop_id'
    `);
    if (!Array.isArray(columns) || !columns.length) {
      await prisma.$executeRawUnsafe(`
        ALTER TABLE student_sessions
        ADD COLUMN board_stop_id INT NULL,
        ADD COLUMN alight_stop_id INT NULL
      `);
    }
  }

  async function getSessionMap(sessionIds = []) {
    const uniqueIds = [...new Set(sessionIds.map(Number).filter(Boolean))];
    if (!uniqueIds.length) return new Map();

    const sessions = await prisma.session.findMany({
      where: { id: { in: uniqueIds } },
      select: { id: true, name: true, type: true, schoolId: true }
    });
    return new Map(sessions.map(session => [Number(session.id), session]));
  }

  async function getStopMap(stopIds = []) {
    const uniqueIds = [...new Set(stopIds.map(Number).filter(Boolean))];
    if (!uniqueIds.length) return new Map();

    const stops = await prisma.stop.findMany({
      where: { id: { in: uniqueIds } },
      select: { id: true, name: true, sessionId: true }
    });
    return new Map(stops.map(stop => [Number(stop.id), stop]));
  }

  // ── 学生辅助工具 ─────────────────────────────────────────

  function normalizeStudentCardNo(value = '') {
    return String(value || '')
      .replace(/^\uFEFF/, '')
      .trim()
      .replace(/\.0+$/, '');
  }

  function detectPhotoImportStatus(faceId = '') {
    const value = String(faceId || '').trim();
    if (!value) return { source: '', status: '' };
    if (value.startsWith('photo:pending:')) return { source: 'photo-import', status: 'pending' };
    if (value.startsWith('photo:')) return { source: 'photo-import', status: 'bound' };
    return { source: 'manual', status: 'bound' };
  }

  function getStudentFacePhotoUrl(cardNo = '') {
    const normalizedCardNo = normalizeStudentCardNo(cardNo);
    if (!normalizedCardNo) return '';
    try {
      const files = fs.readdirSync(studentFaceUploadDir);
      const matched = files.find(file => path.parse(file).name === normalizedCardNo);
      return matched ? `/student-faces/${matched}` : '';
    } catch {
      return '';
    }
  }

  function buildStudentFaceStatusLabel(student = {}) {
    if (student.face_import_status === 'pending') return '待绑定';
    if (student.face_id) return '已绑定';
    return '未录入';
  }

  async function ensureClassTeacherStudentAccess(user, studentId) {
    if (!isClassTeacherUser(user)) return true;
    const scope = buildClassTeacherStudentScope(user);
    if (!scope || !Number(studentId)) return false;

    const student = await prisma.student.findFirst({
      where: {
        id: Number(studentId),
        classId: Number(scope.class_id),
        ...(scope.school_id ? { schoolId: Number(scope.school_id) } : {}),
        ...(scope.grade_id ? { gradeId: Number(scope.grade_id) } : {})
      },
      select: { id: true }
    });
    return !!student;
  }

  // ── CSV 导出工具 ─────────────────────────────────────────

  function toCSV(rows, fields) {
    const header = fields.map(f => f.label).join(',');
    const lines = rows.map(r => fields.map(f => `"${r[f.key] ?? ''}"`).join(','));
    return [header, ...lines].join('\n');
  }

  // ── 数据映射 ─────────────────────────────────────────────

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
        arrival_radius_m: item.arrivalRadiusM ?? 120,
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
        parent_openid: item.parentOpenid,
        face_id: item.faceId,
        face_import_source: detectPhotoImportStatus(item.faceId).source,
        face_import_status: detectPhotoImportStatus(item.faceId).status,
        face_photo_url: getStudentFacePhotoUrl(item.card_no ?? null),
        card_no: item.card_no ?? null,
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

  // ── CRUD 配置 ────────────────────────────────────────────

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

  // ── CRUD 路由工厂 ────────────────────────────────────────

  function crudRouter(key) {
    const router = express.Router();
    const config = buildCrudConfig(key);

    router.get('/', auth, async (req, res) => {
      if (key === 'students') {
        let scope = null;
        if (isClassTeacherUser(req.user)) scope = buildClassTeacherStudentScope(req.user);
        else if (isSchoolLeaderUser(req.user)) scope = buildSchoolScope(req.user);
        const query = scope ? { ...scope } : req.query;
        const result = await loadStudentRows({
          ...query,
          search: req.query?.search || '',
          face_status: req.query?.face_status || '',
          page: req.query?.page || 1,
          pageSize: req.query?.pageSize || 20
        });
        return res.json({ data: result.rows, total: result.total, stats: result.stats });
      }

      if (isClassTeacherUser(req.user) && ['grades', 'classes'].includes(key)) {
        const scope = buildClassTeacherStudentScope(req.user);
        if (!scope) return res.json([]);
        const list = await config.model.findMany({
          where: buildModelWhere(key, scope),
          include: config.include,
          orderBy: config.orderBy
        });
        return res.json(list.map(item => mapModelRecord(key, item)));
      }

      if (isClassTeacherUser(req.user) && key === 'stops') {
        const scope = buildClassTeacherStudentScope(req.user);
        if (!scope?.school_id) return res.json([]);
        const list = await config.model.findMany({
          where: {
            session: { schoolId: Number(scope.school_id) }
          },
          include: config.include,
          orderBy: config.orderBy
        });
        return res.json(list.map(item => mapModelRecord(key, item)));
      }

      // school_leader 自动限定本校数据
      const query = isSchoolLeaderUser(req.user)
        ? { ...req.query, school_id: req.user.school_id }
        : req.query;

      const page = req.query?.page ? Number(req.query.page) : null;
      const pageSize = req.query?.pageSize ? Number(req.query.pageSize) : null;

      const [list, total] = await Promise.all([
        config.model.findMany({
          where: buildModelWhere(key, query),
          include: config.include,
          orderBy: config.orderBy,
          ...(page && pageSize ? { skip: (page - 1) * pageSize, take: pageSize } : {})
        }),
        (page && pageSize) ? config.model.count({ where: buildModelWhere(key, query) }) : Promise.resolve(null)
      ]);

      const mapped = await Promise.all(
        list.map(async item => mapModelRecord(key, key === 'students' ? await attachStudentStops(item) : item))
      );

      if (page && pageSize) {
        res.json({ data: mapped, total });
      } else {
        res.json(mapped);
      }
    });

    router.post('/', auth, async (req, res) => {
      if (isSchoolLeaderUser(req.user)) {
        return res.status(403).json({ message: '学校领导仅有查看权限' });
      }
      if (key === 'students' && isClassTeacherUser(req.user)) {
        return res.status(403).json({ message: '班级老师无权新增学生' });
      }
      const payload = key === 'students' ? sanitizeStudentPayload(req.body) : req.body;
      const createData = buildModelData(key, payload);
      const created = key === 'students'
        ? await createStudentRecord(payload)
        : await config.model.create({
            data: createData,
            include: config.include
          });
      const mapped = mapModelRecord(key, key === 'students' ? await attachStudentStops(created) : created);
      res.json(mapped);
    });

    router.put('/:id', auth, async (req, res) => {
      if (isSchoolLeaderUser(req.user)) {
        return res.status(403).json({ message: '学校领导仅有查看权限' });
      }
      const id = +req.params.id;
      const existing = await config.model.findUnique({ where: { id } });
      if (!existing) return res.status(404).json({ message: 'Not found' });
      if (key === 'students' && !await ensureClassTeacherStudentAccess(req.user, id)) {
        return res.status(403).json({ message: '无权操作该学生' });
      }

      if (key === 'stops') {
        const payload = { ...req.body };
        const data = {
          name: Object.prototype.hasOwnProperty.call(payload, 'name') ? String(payload.name || '').trim() : existing.name,
          lat: Object.prototype.hasOwnProperty.call(payload, 'lat') ? (payload.lat === '' || payload.lat == null ? null : Number(payload.lat)) : existing.lat,
          lng: Object.prototype.hasOwnProperty.call(payload, 'lng') ? (payload.lng === '' || payload.lng == null ? null : Number(payload.lng)) : existing.lng,
          order: Object.prototype.hasOwnProperty.call(payload, 'order') ? (payload.order === '' || payload.order == null ? null : Number(payload.order)) : existing.order,
          arrival_radius_m: Object.prototype.hasOwnProperty.call(payload, 'arrival_radius_m') ? (payload.arrival_radius_m === '' || payload.arrival_radius_m == null ? null : Number(payload.arrival_radius_m)) : (existing.arrival_radius_m ?? existing.arrivalRadiusM ?? 120)
        };
        const updated = await prisma.$queryRawUnsafe(
          `SELECT id, session_id, name, \`order\`, lat, lng, arrival_radius_m FROM stops WHERE id = ? LIMIT 1`,
          id
        );
        if (!Array.isArray(updated) || !updated.length) {
          await prisma.$executeRawUnsafe(
            `UPDATE stops SET name = ?, lat = ?, lng = ?, \`order\` = ?, arrival_radius_m = ? WHERE id = ?`,
            data.name,
            data.lat,
            data.lng,
            data.order,
            data.arrival_radius_m,
            id
          );
        } else {
          await prisma.$executeRawUnsafe(
            `UPDATE stops SET name = ?, lat = ?, lng = ?, \`order\` = ?, arrival_radius_m = ? WHERE id = ?`,
            data.name,
            data.lat,
            data.lng,
            data.order,
            data.arrival_radius_m,
            id
          );
        }
        const rows = await prisma.$queryRawUnsafe(
          `SELECT id, session_id, name, \`order\`, lat, lng, arrival_radius_m FROM stops WHERE id = ? LIMIT 1`,
          id
        );
        return res.json({ success: true, item: mapModelRecord(key, Array.isArray(rows) ? rows[0] : null) });
      }

      const payload = key === 'students' ? sanitizeStudentPayload(req.body) : req.body;
      const updateData = buildModelData(key, payload);
      const updated = key === 'students'
        ? await updateStudentRecord(id, payload)
        : await config.model.update({
            where: { id },
            data: updateData
          });
      res.json(key === 'students' ? mapModelRecord(key, await attachStudentStops(updated)) : { success: true });
    });

    router.delete('/:id', auth, async (req, res) => {
      if (isSchoolLeaderUser(req.user)) {
        return res.status(403).json({ message: '学校领导仅有查看权限' });
      }
      const id = +req.params.id;
      const existing = await config.model.findUnique({ where: { id } });
      if (!existing) return res.status(404).json({ message: 'Not found' });
      if (key === 'students' && isClassTeacherUser(req.user)) {
        return res.status(403).json({ message: '班级老师无权删除学生' });
      }

      if (key === 'students') {
        // 释放学生关联的卡片
        await prisma.$executeRawUnsafe(`
          UPDATE cards SET student_id = NULL, status = 'unassigned' WHERE student_id = ?
        `, id);
      }
      await config.model.delete({ where: { id } });
      res.json({ success: true });
    });

    router.get('/export', auth, async (req, res) => {
      if (isSchoolLeaderUser(req.user)) {
        return res.status(403).json({ message: '学校领导仅有查看权限，不可导出数据' });
      }
      if (key === 'students' && isClassTeacherUser(req.user)) {
        return res.status(403).json({ message: '班级老师无权导出学生' });
      }
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
      res.send('\uFEFF' + toCSV(enriched, fields));
    });

    return router;
  }

  return crudRouter;
};
