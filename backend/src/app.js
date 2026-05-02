require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });
const SECRET = process.env.JWT_SECRET || 'smart_bus_secret';

app.use(cors());
app.use(express.json());

// ── 模拟数据库 ────────────────────────────────────────────
const db = {
  users: [
    { id: 1, username: 'admin', password: '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', role: 'admin' }
  ],
  schools: [
    { id: 1, name: '阳光小学', address: '北京市朝阳区阳光路1号', contact: '010-12345678' },
    { id: 2, name: '育才中学', address: '北京市海淀区育才路88号', contact: '010-87654321' },
    { id: 3, name: '实验幼儿园', address: '北京市西城区实验路5号', contact: '010-11223344' }
  ],
  fleets: [
    { id: 1, name: '第一车队', school_id: 1 },
    { id: 2, name: '第二车队', school_id: 1 },
    { id: 3, name: '育才车队', school_id: 2 }
  ],
  buses: [
    { id: 1, plate: '京A12345', model: '宇通ZK6119', capacity: 55, status: 'active', school_id: 1, fleet_id: 1 },
    { id: 2, plate: '京B67890', model: '金龙XMQ6127', capacity: 50, status: 'active', school_id: 1, fleet_id: 2 },
    { id: 3, plate: '京C11111', model: '申龙SLK6129', capacity: 48, status: 'maintenance', school_id: 2, fleet_id: 3 }
  ],
  drivers: [
    { id: 1, name: '张伟', phone: '13800138001', license: 'A12345678', bus_id: 1, school_id: 1, fleet_id: 1 },
    { id: 2, name: '李明', phone: '13800138002', license: 'A87654321', bus_id: 2, school_id: 1, fleet_id: 2 }
  ],
  routes: [
    { id: 1, name: '北区路线', school_id: 1 },
    { id: 2, name: '南区路线', school_id: 1 },
    { id: 3, name: '育才路线', school_id: 2 }
  ],
  sessions: [
    { id: 1, name: '早班-上学', type: 'morning', route_id: 1, bus_id: 1, depart_time: '07:00', school_id: 1 },
    { id: 2, name: '午班-放学', type: 'afternoon', route_id: 1, bus_id: 1, depart_time: '12:00', school_id: 1 },
    { id: 3, name: '早班-上学', type: 'morning', route_id: 2, bus_id: 2, depart_time: '07:10', school_id: 1 }
  ],
  stops: [
    { id: 1, name: '天通苑站', session_id: 1, lat: 39.95, lng: 116.42, order: 1, arrive_time: '07:05' },
    { id: 2, name: '北苑站',   session_id: 1, lat: 39.92, lng: 116.41, order: 2, arrive_time: '07:15' },
    { id: 3, name: '学校',     session_id: 1, lat: 39.9042, lng: 116.4074, order: 3, arrive_time: '07:30' },
    { id: 4, name: '宣武门站', session_id: 3, lat: 39.89, lng: 116.39, order: 1, arrive_time: '07:15' },
    { id: 5, name: '学校',     session_id: 3, lat: 39.9042, lng: 116.4074, order: 2, arrive_time: '07:35' }
  ],
  grades: [
    { id: 1, name: '一年级', school_id: 1 },
    { id: 2, name: '二年级', school_id: 1 },
    { id: 3, name: '三年级', school_id: 1 },
    { id: 4, name: '四年级', school_id: 1 },
    { id: 5, name: '五年级', school_id: 1 },
    { id: 6, name: '六年级', school_id: 1 }
  ],
  classes: [
    { id: 1, name: '1班', grade_id: 3, school_id: 1 },
    { id: 2, name: '2班', grade_id: 3, school_id: 1 },
    { id: 3, name: '1班', grade_id: 4, school_id: 1 }
  ],
  students: [
    { id: 1, name: '王小明', grade_id: 3, class_id: 1, school_id: 1, parent_phone: '13900139001', parent_name: '王大明', face_id: 'face_001', session_ids: [1, 2] },
    { id: 2, name: '李小红', grade_id: 4, class_id: 3, school_id: 1, parent_phone: '13900139002', parent_name: '李大红', face_id: 'face_002', session_ids: [1] },
    { id: 3, name: '张小华', grade_id: 2, class_id: null, school_id: 1, parent_phone: '13900139003', parent_name: '张大华', face_id: 'face_003', session_ids: [3] },
    { id: 4, name: '刘小强', grade_id: 5, class_id: null, school_id: 1, parent_phone: '13900139004', parent_name: '刘大强', face_id: 'face_004', session_ids: [] }
  ],
  escortTeachers: [],
  classTeachers: [],
  rideRecords: [
    { id: 1, student_id: 1, bus_id: 1, board_time: new Date('2026-05-01 07:30:00'), alight_time: new Date('2026-05-01 08:00:00'), board_stop: '天通苑', alight_stop: '学校' },
    { id: 2, student_id: 2, bus_id: 1, board_time: new Date('2026-05-01 07:32:00'), alight_time: new Date('2026-05-01 08:00:00'), board_stop: '北苑站', alight_stop: '学校' },
    { id: 3, student_id: 3, bus_id: 2, board_time: new Date('2026-05-01 07:25:00'), alight_time: new Date('2026-05-01 08:05:00'), board_stop: '大兴站', alight_stop: '学校' }
  ],
  notifications: [
    { id: 1, student_id: 1, type: 'board', content: '王小明已于07:30在天通苑上车', sent_at: new Date('2026-05-01 07:30:00'), is_read: 0 },
    { id: 2, student_id: 2, type: 'board', content: '李小红已于07:32在北苑站上车', sent_at: new Date('2026-05-01 07:32:00'), is_read: 0 },
    { id: 3, student_id: 1, type: 'alight', content: '王小明已于08:00在学校下车', sent_at: new Date('2026-05-01 08:00:00'), is_read: 1 }
  ]
};

const nextId = {};
Object.keys(db).forEach(k => {
  const arr = db[k];
  nextId[k] = arr.length ? Math.max(...arr.map(i => i.id || 0)) + 1 : 1;
});

// ── 中间件 ────────────────────────────────────────────────
function auth(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ message: 'Unauthorized' });
  try { req.user = jwt.verify(token, SECRET); next(); }
  catch { res.status(401).json({ message: 'Invalid token' }); }
}

function withRel(item, type) {
  const r = { ...item };
  const find = (col, id) => db[col]?.find(x => x.id === id) || null;
  if (type === 'buses')    { r.School = find('schools', r.school_id); r.Fleet = find('fleets', r.fleet_id); }
  if (type === 'drivers')  { r.School = find('schools', r.school_id); r.Fleet = find('fleets', r.fleet_id); r.Bus = find('buses', r.bus_id); }
  if (type === 'sessions') { r.Route = find('routes', r.route_id); r.Bus = find('buses', r.bus_id); }
  if (type === 'stops')    { r.Session = find('sessions', r.session_id); }
  if (type === 'students') {
    r.Grade     = find('grades', r.grade_id);
    r.Class     = find('classes', r.class_id);
    r.gradeName = r.Grade?.name || '';
    r.className = r.Class?.name || '';
    r.Sessions  = (r.session_ids || []).map(id => db.sessions.find(x => x.id === id)).filter(Boolean);
  }
  if (type === 'rideRecords') { r.Student = find('students', r.student_id); r.Bus = find('buses', r.bus_id); }
  if (type === 'notifications') { r.Student = find('students', r.student_id); }
  if (type === 'escortTeachers') {
    r.School = find('schools', r.school_id);
    r.Sessions = (r.session_ids || []).map(id => db.sessions.find(x => x.id === id)).filter(Boolean);
    delete r.password;
  }
  if (type === 'classTeachers') {
    r.School = find('schools', r.school_id);
    r.Grade  = find('grades', r.grade_id);
    r.Class  = find('classes', r.class_id);
    delete r.password;
  }
  if (type === 'fleets')   { r.School = find('schools', r.school_id); }
  if (type === 'routes')   { r.School = find('schools', r.school_id); }
  if (type === 'grades')   { r.School = find('schools', r.school_id); }
  if (type === 'classes')  { r.Grade = find('grades', r.grade_id); }
  return r;
}

// ── CSV 导出工具 ──────────────────────────────────────────
function toCSV(rows, fields) {
  const header = fields.map(f => f.label).join(',');
  const lines = rows.map(r => fields.map(f => `"${r[f.key] ?? ''}"`).join(','));
  return [header, ...lines].join('\n');
}

// ── Auth ──────────────────────────────────────────────────
app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  const user = db.users.find(u => u.username === username);
  if (!user || !await bcrypt.compare(password, user.password))
    return res.status(401).json({ message: '用户名或密码错误' });
  const token = jwt.sign({ id: user.id, role: user.role }, SECRET, { expiresIn: '8h' });
  res.json({ token, role: user.role, username: user.username });
});

// ── 学校 ──────────────────────────────────────────────────
app.get('/api/schools', auth, (req, res) => res.json(db.schools));
app.post('/api/schools', auth, (req, res) => {
  const item = { id: nextId.schools++, ...req.body };
  db.schools.push(item); res.json(item);
});
app.put('/api/schools/:id', auth, (req, res) => {
  const idx = db.schools.findIndex(i => i.id === +req.params.id);
  if (idx === -1) return res.status(404).json({ message: 'Not found' });
  db.schools[idx] = { ...db.schools[idx], ...req.body }; res.json({ success: true });
});
app.delete('/api/schools/:id', auth, (req, res) => {
  db.schools = db.schools.filter(i => i.id !== +req.params.id); res.json({ success: true });
});

// ── 通用 CRUD 工厂（支持 school_id 过滤）────────────────────
function crudRouter(key, relType) {
  const router = express.Router();

  router.get('/', auth, (req, res) => {
    const { school_id, route_id, session_id, grade_id } = req.query;
    let list = db[key];
    if (school_id) list = list.filter(i => i.school_id === +school_id);
    if (route_id)  list = list.filter(i => i.route_id  === +route_id);
    if (session_id)list = list.filter(i => i.session_id=== +session_id);
    if (grade_id)  list = list.filter(i => i.grade_id  === +grade_id);
    res.json(list.map(i => withRel(i, relType || key)));
  });

  router.post('/', auth, (req, res) => {
    const item = { id: nextId[key]++, ...req.body };
    db[key].push(item); res.json(withRel(item, relType || key));
  });

  router.put('/:id', auth, (req, res) => {
    const idx = db[key].findIndex(i => i.id === +req.params.id);
    if (idx === -1) return res.status(404).json({ message: 'Not found' });
    db[key][idx] = { ...db[key][idx], ...req.body };
    res.json({ success: true });
  });

  router.delete('/:id', auth, (req, res) => {
    db[key] = db[key].filter(i => i.id !== +req.params.id);
    res.json({ success: true });
  });

  // 导出 CSV
  router.get('/export', auth, (req, res) => {
    const { school_id } = req.query;
    let list = db[key];
    if (school_id) list = list.filter(i => i.school_id === +school_id);
    const enriched = list.map(i => withRel(i, relType || key));
    const fieldMap = {
      buses:    [{ key: 'plate', label: '车牌' }, { key: 'model', label: '型号' }, { key: 'capacity', label: '载客量' }, { key: 'status', label: '状态' }],
      drivers:  [{ key: 'name', label: '姓名' }, { key: 'phone', label: '电话' }, { key: 'license', label: '驾照号' }],
      students: [{ key: 'name', label: '姓名' }, { key: 'gradeName', label: '年级' }, { key: 'className', label: '班级' }, { key: 'parent_phone', label: '家长电话' }, { key: 'parent_name', label: '家长姓名' }, { key: 'face_id', label: '人脸ID' }],
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
function teacherRouter(key, relType) {
  const router = crudRouter(key, relType);

  router.post('/', auth, async (req, res) => {
    const body = { ...req.body };
    if (body.password) body.password = await bcrypt.hash(body.password, 10);
    const item = { id: nextId[key]++, session_ids: [], ...body };
    db[key].push(item);
    res.json(withRel(item, relType));
  });

  router.put('/:id', auth, async (req, res) => {
    const idx = db[key].findIndex(i => i.id === +req.params.id);
    if (idx === -1) return res.status(404).json({ message: 'Not found' });
    const body = { ...req.body };
    if (body.password) body.password = await bcrypt.hash(body.password, 10);
    else delete body.password;
    db[key][idx] = { ...db[key][idx], ...body };
    res.json({ success: true });
  });

  return router;
}

app.use('/api/escort-teachers', teacherRouter('escortTeachers', 'escortTeachers'));
app.use('/api/class-teachers',  teacherRouter('classTeachers',  'classTeachers'));

// ── 学生 face_id 更新 ─────────────────────────────────────
app.put('/api/students/:id/face', auth, (req, res) => {
  const s = db.students.find(s => s.id === +req.params.id);
  if (!s) return res.status(404).json({ message: 'Not found' });
  s.face_id = req.body.face_id;
  res.json({ success: true });
});

// ── 学生导入模板 ──────────────────────────────────────────
app.get('/api/students/import-template', auth, (req, res) => {
  const { school_id } = req.query;
  const gradeList = school_id ? db.grades.filter(g => g.school_id === +school_id) : db.grades;
  const classList = school_id ? db.classes.filter(c => c.school_id === +school_id) : db.classes;
  const gradeHint = '# 可用年级：' + gradeList.map(g => `${g.id}=${g.name}`).join('  ') + '\n';
  const classHint = '# 可用班级：' + classList.map(c => {
    const g = db.grades.find(x => x.id === c.grade_id);
    return `${c.id}=${g?.name||''}${c.name}`;
  }).join('  ') + '\n';
  const comment = '# 说明：年级ID和班级ID填写上方对应的数字ID；家长电话多个用"|"分隔\n';
  const header  = '姓名,年级ID,班级ID,家长姓名,家长电话,人脸ID';
  const example = '"张三","3","1","张父","13800138000","face_xxx"';
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="students-template.csv"');
  res.send('﻿' + comment + gradeHint + classHint + [header, example].join('\n'));
});

// ── 学生 CSV 导入 ─────────────────────────────────────────
app.post('/api/students/import', auth, express.text({ type: '*/*' }), (req, res) => {
  const { school_id } = req.query;
  const lines = req.body.split('\n').filter(l => l && !l.startsWith('#'));
  if (!lines.length) return res.status(400).json({ message: '文件为空' });
  const header   = lines[0].split(',').map(h => h.replace(/"/g, '').trim());
  const nameIdx  = header.indexOf('姓名');
  const gradeIdx = header.indexOf('年级ID');
  const classIdx = header.indexOf('班级ID');
  const pNameIdx = header.indexOf('家长姓名');
  const pPhoneIdx= header.indexOf('家长电话');
  const faceIdx  = header.indexOf('人脸ID');
  if (nameIdx === -1 || gradeIdx === -1)
    return res.status(400).json({ message: '格式错误，请使用下载的模板' });
  let created = 0; const errors = [];
  lines.slice(1).forEach((line, i) => {
    const cols     = line.split(',').map(c => c.replace(/"/g, '').trim());
    const name     = cols[nameIdx];
    const grade_id = cols[gradeIdx] ? +cols[gradeIdx] : null;
    const class_id = cols[classIdx] ? +cols[classIdx] : null;
    if (!name) { errors.push(`第${i+2}行：姓名不能为空`); return; }
    if (grade_id && !db.grades.find(g => g.id === grade_id)) {
      errors.push(`第${i+2}行：找不到年级ID ${grade_id}`); return;
    }
    db.students.push({
      id: nextId.students++,
      name,
      grade_id,
      class_id,
      school_id: school_id ? +school_id : null,
      parent_name:  pNameIdx  >= 0 ? cols[pNameIdx]  : '',
      parent_phone: pPhoneIdx >= 0 ? cols[pPhoneIdx] : '',
      face_id:      faceIdx   >= 0 ? cols[faceIdx]   : '',
      session_ids: []
    });
    created++;
  });
  res.json({ success: true, created, errors });
});

// ── 搭乘调班模板（含当前班次，供批量调班用）────────────────
app.get('/api/ride-assign/change-template', auth, (req, res) => {
  const { school_id } = req.query;
  let students = db.students;
  if (school_id) students = students.filter(s => s.school_id === +school_id);
  const sessionList = school_id ? db.sessions.filter(x => x.school_id === +school_id) : db.sessions;
  const comment     = '# 用途：批量调整学生搭乘班次\n';
  const sesHint     = '# 可用班次：' + sessionList.map(x => `${x.id}=${x.name}(${x.type==='morning'?'上学':'放学'})`).join('  ') + '\n';
  const rule        = '# 规则：新班次ID列表用"|"分隔多个，留空=清空所有班次，不修改=保持原值\n';
  const header      = 'ID,姓名,年级,班级,当前班次ID列表,当前班次名称,新班次ID列表';
  const lines = students.map(s => {
    const grade    = db.grades.find(g => g.id === s.grade_id);
    const cls      = db.classes.find(c => c.id === s.class_id);
    const sessions = (s.session_ids || []).map(id => db.sessions.find(x => x.id === id)).filter(Boolean);
    const curIds   = (s.session_ids || []).join('|');
    const curNames = sessions.map(x => x.name).join('|');
    return `"${s.id}","${s.name}","${grade?.name||''}","${cls?.name||''}","${curIds}","${curNames}","${curIds}"`;
  });
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="ride-change-template.csv"');
  res.send('﻿' + comment + sesHint + rule + [header, ...lines].join('\n'));
});

// ── 学生批量调班级（弹窗直接操作）────────────────────────
app.post('/api/students/batch-class', auth, (req, res) => {
  const { student_ids, grade_id, class_id } = req.body;
  if (!student_ids?.length) return res.status(400).json({ message: 'student_ids 不能为空' });
  let updated = 0;
  student_ids.forEach(id => {
    const s = db.students.find(s => s.id === id);
    if (!s) return;
    if (grade_id != null) s.grade_id = grade_id;
    if (class_id !== undefined) s.class_id = class_id;
    updated++;
  });
  res.json({ success: true, updated });
});

// ── 学生调班级模板 ────────────────────────────────────────
app.get('/api/students/class-change-template', auth, (req, res) => {
  const { school_id } = req.query;
  let students = db.students;
  if (school_id) students = students.filter(s => s.school_id === +school_id);
  const gradeList = school_id ? db.grades.filter(g => g.school_id === +school_id) : db.grades;
  const classList = school_id ? db.classes.filter(c => c.school_id === +school_id) : db.classes;
  const comment    = '# 用途：批量调整学生年级和班级\n';
  const gradeHint  = '# 可用年级：' + gradeList.map(g => `${g.id}=${g.name}`).join('  ') + '\n';
  const classHint  = '# 可用班级：' + classList.map(c => {
    const g = db.grades.find(x => x.id === c.grade_id);
    return `${c.id}=${g?.name||''}${c.name}`;
  }).join('  ') + '\n';
  const rule   = '# 规则：修改"新年级ID"或"新班级ID"列，留空=不修改，填0=清空\n';
  const header = 'ID,姓名,当前年级,当前年级ID,当前班级,当前班级ID,新年级ID,新班级ID';
  const lines  = students.map(s => {
    const grade = db.grades.find(g => g.id === s.grade_id);
    const cls   = db.classes.find(c => c.id === s.class_id);
    return `"${s.id}","${s.name}","${grade?.name||''}","${s.grade_id||''}","${cls?.name||''}","${s.class_id||''}","${s.grade_id||''}","${s.class_id||''}"`;
  });
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="students-class-change-template.csv"');
  res.send('﻿' + comment + gradeHint + classHint + rule + [header, ...lines].join('\n'));
});

// ── 学生调班级导入 ────────────────────────────────────────
app.post('/api/students/class-change-import', auth, express.text({ type: '*/*' }), (req, res) => {
  const lines = req.body.split('\n').filter(l => l && !l.startsWith('#'));
  if (!lines.length) return res.status(400).json({ message: '文件为空' });
  const header      = lines[0].split(',').map(h => h.replace(/"/g, '').trim());
  const idIdx       = header.indexOf('ID');
  const newGradeIdx = header.indexOf('新年级ID');
  const newClassIdx = header.indexOf('新班级ID');
  if (idIdx === -1 || newGradeIdx === -1 || newClassIdx === -1)
    return res.status(400).json({ message: '格式错误，请使用下载的调班级模板' });
  let updated = 0; const errors = [];
  lines.slice(1).forEach((line, i) => {
    const cols       = line.split(',').map(c => c.replace(/"/g, '').trim());
    const studentId  = +cols[idIdx];
    const rawGrade   = cols[newGradeIdx];
    const rawClass   = cols[newClassIdx];
    const student    = db.students.find(s => s.id === studentId);
    if (!student) { errors.push(`第${i+2}行：找不到学生ID ${studentId}`); return; }
    // 空=不改，"0"=清空，其他=新值
    if (rawGrade !== '') {
      const newGradeId = rawGrade === '0' ? null : +rawGrade;
      if (newGradeId && !db.grades.find(g => g.id === newGradeId)) {
        errors.push(`第${i+2}行：找不到年级ID ${newGradeId}`); return;
      }
      student.grade_id = newGradeId;
    }
    if (rawClass !== '') {
      const newClassId = rawClass === '0' ? null : +rawClass;
      if (newClassId && !db.classes.find(c => c.id === newClassId)) {
        errors.push(`第${i+2}行：找不到班级ID ${newClassId}`); return;
      }
      student.class_id = newClassId;
    }
    updated++;
  });
  res.json({ success: true, updated, errors });
});

// ── 搭乘管理 ──────────────────────────────────────────────

// 查询（支持按年级/班级/班次/姓名筛选）
app.get('/api/ride-assign', auth, (req, res) => {
  const { school_id, grade_id, class_id, session_id, name } = req.query;
  let list = db.students;
  if (school_id) list = list.filter(s => s.school_id === +school_id);
  if (grade_id)  list = list.filter(s => s.grade_id  === +grade_id);
  if (class_id)  list = list.filter(s => s.class_id  === +class_id);
  if (session_id === 'none') list = list.filter(s => !s.session_ids?.length);
  else if (session_id)       list = list.filter(s => s.session_ids?.includes(+session_id));
  if (name) list = list.filter(s => s.name?.includes(name));
  res.json(list.map(s => ({
    ...s,
    Grade:    db.grades.find(g => g.id === s.grade_id)  || null,
    Class:    db.classes.find(c => c.id === s.class_id) || null,
    Sessions: (s.session_ids || []).map(id => db.sessions.find(x => x.id === id)).filter(Boolean)
  })));
});

// 单个学生更新班次列表（覆盖）
app.put('/api/ride-assign/:studentId', auth, (req, res) => {
  const s = db.students.find(s => s.id === +req.params.studentId);
  if (!s) return res.status(404).json({ message: 'Not found' });
  s.session_ids = Array.isArray(req.body.session_ids) ? req.body.session_ids : [];
  res.json({ success: true });
});

// 批量追加班次
app.post('/api/ride-assign/batch-add', auth, (req, res) => {
  const { student_ids, session_id } = req.body;
  let count = 0;
  student_ids.forEach(id => {
    const s = db.students.find(s => s.id === id);
    if (!s) return;
    if (!s.session_ids) s.session_ids = [];
    if (session_id && !s.session_ids.includes(session_id)) s.session_ids.push(session_id);
    count++;
  });
  res.json({ success: true, updated: count });
});

// 批量移除班次
app.post('/api/ride-assign/batch-remove', auth, (req, res) => {
  const { student_ids, session_id } = req.body;
  let count = 0;
  student_ids.forEach(id => {
    const s = db.students.find(s => s.id === id);
    if (!s) return;
    s.session_ids = (s.session_ids || []).filter(x => x !== session_id);
    count++;
  });
  res.json({ success: true, updated: count });
});

// 批量覆盖班次
app.post('/api/ride-assign/batch-set', auth, (req, res) => {
  const { student_ids, session_ids } = req.body;
  let count = 0;
  student_ids.forEach(id => {
    const s = db.students.find(s => s.id === id);
    if (!s) return;
    s.session_ids = Array.isArray(session_ids) ? [...session_ids] : [];
    count++;
  });
  res.json({ success: true, updated: count });
});

// 导出 CSV
app.get('/api/ride-assign/export', auth, (req, res) => {
  const { school_id } = req.query;
  let list = db.students;
  if (school_id) list = list.filter(s => s.school_id === +school_id);
  const header = 'ID,姓名,年级,班级,班次ID列表,班次名称列表';
  const lines = list.map(s => {
    const grade    = db.grades.find(g => g.id === s.grade_id);
    const cls      = db.classes.find(c => c.id === s.class_id);
    const sessions = (s.session_ids || []).map(id => db.sessions.find(x => x.id === id)).filter(Boolean);
    return `"${s.id}","${s.name}","${grade?.name||''}","${cls?.name||''}","${(s.session_ids||[]).join('|')}","${sessions.map(x=>x.name).join('|')}"`;
  });
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="ride-assign.csv"');
  res.send('﻿' + [header, ...lines].join('\n'));
});

// 下载导入模板
app.get('/api/ride-assign/template', auth, (req, res) => {
  const { school_id } = req.query;
  let students = db.students;
  if (school_id) students = students.filter(s => s.school_id === +school_id);
  const sessionList = school_id ? db.sessions.filter(x => x.school_id === +school_id) : db.sessions;
  const comment     = '# 说明：班次ID列表用"|"分隔多个班次ID，留空表示不搭乘任何班次\n';
  const sessionHint = '# 可用班次：' + sessionList.map(x => `${x.id}=${x.name}`).join('  ') + '\n';
  const header      = 'ID,姓名,年级,班级,班次ID列表';
  const lines = students.map(s => {
    const grade = db.grades.find(g => g.id === s.grade_id);
    const cls   = db.classes.find(c => c.id === s.class_id);
    return `"${s.id}","${s.name}","${grade?.name||''}","${cls?.name||''}","${(s.session_ids||[]).join('|')}"`;
  });
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="ride-assign-template.csv"');
  res.send('﻿' + comment + sessionHint + [header, ...lines].join('\n'));
});

// CSV 导入
app.post('/api/ride-assign/import', auth, express.text({ type: '*/*' }), (req, res) => {
  const lines = req.body.split('\n').filter(l => l && !l.startsWith('#'));
  if (!lines.length) return res.status(400).json({ message: '文件为空' });
  const header  = lines[0].split(',').map(h => h.replace(/"/g, '').trim());
  const idIdx   = header.indexOf('ID');
  const sesIdx  = header.indexOf('班次ID列表');
  if (idIdx === -1 || sesIdx === -1)
    return res.status(400).json({ message: '格式错误，请使用下载的模板' });
  let updated = 0; const errors = [];
  lines.slice(1).forEach((line, i) => {
    const cols      = line.split(',').map(c => c.replace(/"/g, '').trim());
    const studentId = +cols[idIdx];
    const rawIds    = cols[sesIdx] ? cols[sesIdx].split('|').map(Number).filter(Boolean) : [];
    const student   = db.students.find(s => s.id === studentId);
    if (!student) { errors.push(`第${i+2}行：找不到学生ID ${studentId}`); return; }
    const badIds = rawIds.filter(id => !db.sessions.find(x => x.id === id));
    if (badIds.length) { errors.push(`第${i+2}行：找不到班次ID ${badIds.join(',')}`); return; }
    student.session_ids = rawIds;
    updated++;
  });
  res.json({ success: true, updated, errors });
});

// ── 乘车记录 ──────────────────────────────────────────────
app.get('/api/ride-records', auth, (req, res) => {
  const { page = 1, pageSize = 20, date, school_id } = req.query;
  let list = db.rideRecords;
  if (date) list = list.filter(r => r.board_time?.toISOString().startsWith(date));
  if (school_id) {
    const sids = db.students.filter(s => s.school_id === +school_id).map(s => s.id);
    list = list.filter(r => sids.includes(r.student_id));
  }
  const total = list.length;
  const data = list.slice((page - 1) * pageSize, page * pageSize).map(i => withRel(i, 'rideRecords'));
  res.json({ total, data });
});

// ── 通知 ──────────────────────────────────────────────────
app.get('/api/notifications', auth, (req, res) => {
  const { school_id } = req.query;
  let list = [...db.notifications].reverse();
  if (school_id) {
    const sids = db.students.filter(s => s.school_id === +school_id).map(s => s.id);
    list = list.filter(n => sids.includes(n.student_id));
  }
  res.json(list.map(i => withRel(i, 'notifications')));
});
app.put('/api/notifications/:id/read', auth, (req, res) => {
  const n = db.notifications.find(n => n.id === +req.params.id);
  if (n) n.is_read = 1;
  res.json({ success: true });
});

// ── Dashboard 统计 ────────────────────────────────────────
app.get('/api/dashboard', auth, (req, res) => {
  const { school_id } = req.query;
  const sid = school_id ? +school_id : null;
  const buses    = sid ? db.buses.filter(b => b.school_id === sid) : db.buses;
  const students = sid ? db.students.filter(s => s.school_id === sid) : db.students;
  const sids     = students.map(s => s.id);
  const today    = new Date().toISOString().slice(0, 10);
  const records  = db.rideRecords.filter(r => sids.includes(r.student_id) && r.board_time?.toISOString().startsWith(today));
  const notifs   = db.notifications.filter(n => sids.includes(n.student_id) && !n.is_read);
  res.json({
    activeBuses: buses.filter(b => b.status === 'active').length,
    totalStudents: students.length,
    todayRides: records.length,
    unreadNotifs: notifs.length
  });
});

// ── Socket.io 实时位置 ────────────────────────────────────
const busPositions = {
  1: { lat: 39.9042, lng: 116.4074, dlat: 0.0005, dlng: 0.0003 },
  2: { lat: 39.8900, lng: 116.3900, dlat: -0.0004, dlng: 0.0004 }
};
setInterval(() => {
  Object.entries(busPositions).forEach(([busId, pos]) => {
    pos.lat += pos.dlat * (Math.random() * 0.5 + 0.75);
    pos.lng += pos.dlng * (Math.random() * 0.5 + 0.75);
    io.emit('bus:location', { busId: +busId, lat: pos.lat, lng: pos.lng, speed: Math.floor(Math.random() * 40 + 20), timestamp: new Date() });
  });
}, 3000);

io.on('connection', socket => console.log('connected:', socket.id));

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
