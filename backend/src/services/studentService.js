const path = require('path');
const fs = require('fs');

function createStudentService(prisma) {
  const studentFaceUploadDir = path.join(__dirname, '..', '..', 'uploads', 'student-faces');

  // ── Internal helpers ──────────────────────────────────────────

  function normalizeStudentCardNo(value = '') {
    return String(value || '')
      .replace(/^\uFEFF/, '')
      .trim()
      .replace(/\.0+$/, '');
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

  // ── Student face status label ────────────────────────────────

  function buildStudentFaceStatusLabel(student = {}) {
    if (student.face_import_status === 'pending') return '待绑定';
    if (student.face_id) return '已绑定';
    return '未录入';
  }

  // ── SQL LIKE keyword sanitization ────────────────────────────

  function sanitizeLikeKeyword(value) {
    return String(value || '')
      .replace(/\\/g, '\\\\')
      .replace(/'/g, "''")
      .replace(/%/g, '\\%')
      .replace(/_/g, '\\_');
  }

  // ── Date formatting ──────────────────────────────────────────

  function formatDateOnly(value) {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  // ── Photo import helpers ─────────────────────────────────────

  function buildPhotoImportFaceId(cardNo = '') {
    const normalizedCardNo = normalizeStudentCardNo(cardNo);
    if (!normalizedCardNo) return '';
    return `photo:pending:${normalizedCardNo}`;
  }

  function buildStudentFacePhotoFilename(cardNo = '', originalName = '') {
    const normalizedCardNo = normalizeStudentCardNo(cardNo);
    if (!normalizedCardNo) return '';
    const ext = path.extname(String(originalName || '')).toLowerCase();
    const safeExt = ['.jpg', '.jpeg', '.png', '.webp'].includes(ext) ? ext : '.jpg';
    return `${normalizedCardNo}${safeExt}`;
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

  function clearStudentFacePhoto(cardNo = '') {
    const normalizedCardNo = normalizeStudentCardNo(cardNo);
    if (!normalizedCardNo) return;
    try {
      const files = fs.readdirSync(studentFaceUploadDir);
      for (const file of files) {
        if (path.parse(file).name === normalizedCardNo) {
          fs.unlinkSync(path.join(studentFaceUploadDir, file));
        }
      }
    } catch {}
  }

  function saveStudentFacePhoto(cardNo = '', originalName = '', buffer) {
    const filename = buildStudentFacePhotoFilename(cardNo, originalName);
    if (!filename || !buffer) return '';
    clearStudentFacePhoto(cardNo);
    fs.writeFileSync(path.join(studentFaceUploadDir, filename), buffer);
    return `/student-faces/${filename}`;
  }

  function detectPhotoImportStatus(faceId = '') {
    const value = String(faceId || '').trim();
    if (!value) return { source: '', status: '' };
    if (value.startsWith('photo:pending:')) return { source: 'photo-import', status: 'pending' };
    if (value.startsWith('photo:')) return { source: 'photo-import', status: 'bound' };
    return { source: 'manual', status: 'bound' };
  }

  // ── Student row loading ──────────────────────────────────────

  async function loadStudentRows(where = {}) {
    const schoolId = where.school_id ? Number(where.school_id) : null;
    const classId = where.class_id ? Number(where.class_id) : null;
    const gradeId = where.grade_id ? Number(where.grade_id) : null;
    const search = String(where.search || '').trim();
    const faceStatus = String(where.face_status || '').trim();
    const page = where.page ? Number(where.page) : null;
    const pageSize = where.pageSize ? Number(where.pageSize) : null;
    const conditions = [];

    if (schoolId) conditions.push(`s.school_id = ${schoolId}`);
    if (classId) conditions.push(`s.class_id = ${classId}`);
    if (gradeId) conditions.push(`s.grade_id = ${gradeId}`);
    if (search) {
      const safeSearch = search.replace(/'/g, "''").replace(/\\/g, '\\\\');
      conditions.push(`(s.name LIKE '%${safeSearch}%' OR s.card_no LIKE '%${safeSearch}%')`);
    }
    if (faceStatus === 'pending') conditions.push("s.face_id LIKE 'photo-import-%'");
    else if (faceStatus === 'bound') conditions.push("s.face_id IS NOT NULL AND s.face_id NOT LIKE 'photo-import-%'");
    else if (faceStatus === 'empty') conditions.push('s.face_id IS NULL');
    const whereSql = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    /* 人脸状态统计 */
    let stats = null;
    if (page && pageSize) {
      const statRows = await prisma.$queryRawUnsafe(`
      SELECT
        SUM(s.face_id LIKE 'photo-import-%') AS \`pending\`,
        SUM(s.face_id IS NOT NULL AND s.face_id NOT LIKE 'photo-import-%') AS \`bound\`,
        SUM(s.face_id IS NULL) AS \`empty\`
      FROM students s ${whereSql}
    `);
      stats = {
        pending: Number(statRows[0]?.pending || 0),
        bound: Number(statRows[0]?.bound || 0),
        empty: Number(statRows[0]?.empty || 0)
      };
    }

    const baseSelect = `
    SELECT
      s.id,
      s.name,
      s.grade_id,
      s.class_id,
      s.school_id,
      s.parent_phone,
      s.parent_name,
      s.parent_openid,
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
    ${whereSql}
  `;

    let total = null;
    let limitSql = '';

    if (page && pageSize) {
      const countResult = await prisma.$queryRawUnsafe(
        `SELECT COUNT(*) AS cnt FROM students s ${whereSql}`
      );
      total = Number(countResult[0]?.cnt || 0);
      const offset = (page - 1) * pageSize;
      limitSql = ` LIMIT ${pageSize} OFFSET ${offset}`;
    }

    const sql = `${baseSelect} ORDER BY s.id ASC ${limitSql}`;
    const rows = await prisma.$queryRawUnsafe(sql);

    const mapped = rows.map(row => ({
      id: row.id,
      name: row.name,
      grade_id: row.grade_id,
      class_id: row.class_id,
      school_id: row.school_id,
      parent_phone: row.parent_phone,
      parent_name: row.parent_name,
      parent_openid: row.parent_openid,
      face_id: row.face_id,
      face_import_source: detectPhotoImportStatus(row.face_id).source,
      face_import_status: detectPhotoImportStatus(row.face_id).status,
      face_photo_url: getStudentFacePhotoUrl(row.card_no),
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

    return (page && pageSize) ? { rows: mapped, total, stats } : mapped;
  }

  // ── Student lookup by openid (single, for backward compat) ──

  function mapStudentRow(row) {
    if (!row) return null;
    return {
      id: row.id,
      name: row.name,
      grade_id: row.gradeId,
      class_id: row.classId,
      school_id: row.schoolId,
      parent_phone: row.parent_phone,
      parent_name: row.parent_name,
      parent_openid: row.parent_openid,
      face_id: row.face_id,
      card_no: row.card_no,
      board_stop_id: row.boardStopId,
      alight_stop_id: row.alightStopId,
      face_import_source: detectPhotoImportStatus(row.face_id).source,
      face_import_status: detectPhotoImportStatus(row.face_id).status,
      face_photo_url: getStudentFacePhotoUrl(row.card_no),
      gradeName: row.grade?.name || '',
      className: row.class?.name || '',
      board_stop_name: row.stops_students_board_stop_idTostops?.name || '',
      alight_stop_name: row.stops_students_alight_stop_idTostops?.name || '',
      Grade: row.grade ? { id: row.grade.id, name: row.grade.name } : null,
      Class: row.class ? { id: row.class.id, name: row.class.name } : null,
      BoardStop: row.stops_students_board_stop_idTostops ? { id: row.stops_students_board_stop_idTostops.id, name: row.stops_students_board_stop_idTostops.name } : null,
      AlightStop: row.stops_students_alight_stop_idTostops ? { id: row.stops_students_alight_stop_idTostops.id, name: row.stops_students_alight_stop_idTostops.name } : null,
      Sessions: []
    };
  }

  // ── Lookup all students by openid (multi-student support) ──

  async function findStudentsByOpenid(openid) {
    const trimmed = String(openid || '').trim();
    if (!trimmed) return [];

    const rows = await prisma.student.findMany({
      where: { parent_openid: trimmed },
      include: {
        grade: true,
        class: true,
        stops_students_board_stop_idTostops: true,
        stops_students_alight_stop_idTostops: true
      },
      orderBy: { id: 'asc' }
    });

    return rows.map(mapStudentRow).filter(Boolean);
  }

  // ── Lookup single student by openid (default=first; or by student_id) ──

  async function findStudentByOpenid(openid, studentId = null) {
    const trimmed = String(openid || '').trim();
    if (!trimmed) return null;

    const where = { parent_openid: trimmed };
    if (studentId) where.id = Number(studentId);

    const row = await prisma.student.findFirst({
      where,
      include: {
        grade: true,
        class: true,
        stops_students_board_stop_idTostops: true,
        stops_students_alight_stop_idTostops: true
      }
    });

    return mapStudentRow(row);
  }

  // ── Face binding ─────────────────────────────────────────────

  async function findStudentForFaceBinding({ studentId, cardNo, studentName, schoolId = null, sessionId = null } = {}) {
    if (studentId) {
      const student = await prisma.student.findUnique({ where: { id: Number(studentId) } });
      if (student) return student;
    }

    const normalizedCardNo = normalizeStudentCardNo(cardNo);
    if (normalizedCardNo) {
      const students = await loadStudentRows(schoolId ? { school_id: schoolId } : {});
      const matched = students.find(student => normalizeStudentCardNo(student.card_no) === normalizedCardNo);
      if (matched && (!sessionId || (await prisma.studentSession.count({ where: { studentId: matched.id, sessionId: Number(sessionId) } })) > 0)) {
        return await prisma.student.findUnique({ where: { id: matched.id } });
      }
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

  // ── CRUD operations ──────────────────────────────────────────

  async function createStudentRecord(body = {}) {
    const payload = sanitizeStudentPayload(body);
    const createResult = await prisma.$executeRaw`
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
    const createdId = Number(createResult?.insertId || createResult?.[0]?.insertId || 0);
    if (!createdId) {
      const latest = await prisma.student.findFirst({ orderBy: { id: 'desc' }, include: buildCrudConfig('students').include });
      return latest;
    }

    // 同步卡片分配：标记 cards 表中对应卡号为已分配
    if (payload.card_no) {
      const schoolId = payload.school_id ? Number(payload.school_id) : null;
      if (schoolId) {
        await prisma.$executeRawUnsafe(`
          UPDATE cards SET student_id = ?, status = 'assigned'
          WHERE card_no = ? AND school_id = ? AND status = 'unassigned'
        `, createdId, payload.card_no, schoolId);
      }
    }

    return prisma.student.findUnique({ where: { id: createdId }, include: buildCrudConfig('students').include });
  }

  async function updateStudentRecord(id, body = {}) {
    const payload = sanitizeStudentPayload(body);

    // 检测 card_no 变更：获取旧值用于卡片同步
    let oldCardNo = null;
    let oldSchoolId = null;
    if (Object.prototype.hasOwnProperty.call(body, 'card_no')) {
      const old = await prisma.student.findUnique({ where: { id }, select: { cardNo: true, schoolId: true } });
      oldCardNo = old?.cardNo || null;
      oldSchoolId = old?.schoolId || null;
    }

    await prisma.$executeRaw`
    UPDATE students
    SET
      name = ${payload.name || null},
      grade_id = ${payload.grade_id || null},
      class_id = ${payload.class_id || null},
      school_id = ${payload.school_id || null},
      parent_phone = ${payload.parent_phone || null},
      parent_name = ${payload.parent_name || null},
      parent_openid = ${payload.parent_openid || null},
      face_id = ${payload.face_id || null},
      card_no = ${payload.card_no || null},
      board_stop_id = ${payload.board_stop_id || null},
      alight_stop_id = ${payload.alight_stop_id || null}
    WHERE id = ${id}
  `;

    // 同步卡片分配
    if (Object.prototype.hasOwnProperty.call(body, 'card_no')) {
      const newCardNo = (payload.card_no || '').trim() || null;

      // 释放旧卡
      if (oldCardNo && oldCardNo !== newCardNo) {
        await prisma.$executeRawUnsafe(`
          UPDATE cards SET student_id = NULL, status = 'unassigned'
          WHERE card_no = ? AND student_id = ?
        `, oldCardNo, id);
      }

      // 分配新卡
      if (newCardNo && newCardNo !== oldCardNo) {
        const schoolId = payload.school_id ? Number(payload.school_id) : Number(oldSchoolId || 0);
        if (schoolId) {
          await prisma.$executeRawUnsafe(`
            UPDATE cards SET student_id = ?, status = 'assigned'
            WHERE card_no = ? AND school_id = ? AND status = 'unassigned'
          `, id, newCardNo, schoolId);
        }
      }
    }

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

  // ── Return all functions ─────────────────────────────────────

  return {
    buildStudentFaceStatusLabel,
    sanitizeLikeKeyword,
    formatDateOnly,
    loadStudentRows,
    findStudentsByOpenid,
    findStudentByOpenid,
    buildPhotoImportFaceId,
    buildStudentFacePhotoFilename,
    getStudentFacePhotoUrl,
    clearStudentFacePhoto,
    saveStudentFacePhoto,
    detectPhotoImportStatus,
    findStudentForFaceBinding,
    sanitizeStudentPayload,
    createStudentRecord,
    updateStudentRecord,
    attachStudentStops
  };
}

module.exports = { createStudentService };
