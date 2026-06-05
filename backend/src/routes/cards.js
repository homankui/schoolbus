/**
 * 卡片管理路由
 *
 * 提供卡号池管理：批量生成、列表查询、分配/释放、删除
 * 表在模块首次使用时自适应创建。
 */
const express = require('express');

function createCardRoutes(prisma, { auth, isSchoolLeaderUser }) {
  const router = express.Router();

  // ── 自适应建表 ───────────────────────────────────────────────
  let tableReady = false;
  async function ensureTable() {
    if (tableReady) return;
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS cards (
        id INT PRIMARY KEY AUTO_INCREMENT,
        card_no VARCHAR(100) NOT NULL,
        school_id INT NOT NULL,
        student_id INT NULL,
        status ENUM('unassigned', 'assigned') NOT NULL DEFAULT 'unassigned',
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uk_card_no (card_no),
        UNIQUE KEY uk_student_id (student_id),
        INDEX idx_school_status (school_id, status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    tableReady = true;
  }

  // ── 权限中间件 ───────────────────────────────────────────────
  router.use(auth, async (req, res, next) => {
    await ensureTable();
    if (req.user.role === 'class_teacher') {
      return res.status(403).json({ message: '班级老师无权限访问卡片管理' });
    }
    next();
  });

  // ── 写权限检查（非学校领导） ──────────────────────────────────
  function checkWrite(req, res, next) {
    if (isSchoolLeaderUser(req.user)) {
      return res.status(403).json({ message: '学校领导仅有查看权限' });
    }
    next();
  }

  // ═══════════════════════════════════════════════════════════
  // GET /api/cards - 分页列表
  // ═══════════════════════════════════════════════════════════
  router.get('/', async (req, res) => {
    const schoolId = req.query.school_id ? Number(req.query.school_id) : null;
    const status = req.query.status || null;
    const search = String(req.query.search || '').trim();
    const page = Math.max(Number(req.query.page) || 1, 1);
    const pageSize = Math.min(Math.max(Number(req.query.pageSize) || 20, 1), 200);

    const conditions = [];
    if (schoolId) conditions.push(`c.school_id = ${schoolId}`);
    if (status && ['unassigned', 'assigned'].includes(status)) {
      conditions.push(`c.status = '${status}'`);
    }
    if (search) {
      const safe = search.replace(/'/g, "''").replace(/\\/g, '\\\\');
      conditions.push(`c.card_no LIKE '%${safe}%'`);
    }
    const whereSql = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    // Count
    const countResult = await prisma.$queryRawUnsafe(
      `SELECT COUNT(*) AS cnt FROM cards c ${whereSql}`
    );
    const total = Number(countResult[0]?.cnt || 0);

    // List
    const offset = (page - 1) * pageSize;
    const rows = await prisma.$queryRawUnsafe(`
      SELECT c.id, c.card_no, c.school_id, c.student_id, c.status, c.created_at,
             s.id AS s_id, s.name AS s_name
      FROM cards c
      LEFT JOIN students s ON c.student_id = s.id
      ${whereSql}
      ORDER BY c.id DESC
      LIMIT ${pageSize} OFFSET ${offset}
    `);

    const list = rows.map(row => ({
      id: row.id,
      card_no: row.card_no,
      school_id: row.school_id,
      student_id: row.student_id,
      status: row.status,
      created_at: row.created_at,
      student: row.s_id ? { id: row.s_id, name: row.s_name } : null
    }));

    res.json({ list, total, page, pageSize });
  });

  // ═══════════════════════════════════════════════════════════
  // GET /api/cards/unassigned - 未分配卡号（供下拉选择）
  // ═══════════════════════════════════════════════════════════
  router.get('/unassigned', async (req, res) => {
    const schoolId = Number(req.query.school_id || 0);
    if (!schoolId) return res.json([]);
    const rows = await prisma.$queryRawUnsafe(`
      SELECT id, card_no FROM cards
      WHERE school_id = ${schoolId} AND status = 'unassigned'
      ORDER BY card_no ASC
    `);
    res.json(rows.map(r => ({ id: r.id, card_no: r.card_no })));
  });

  // ═══════════════════════════════════════════════════════════
  // POST /api/cards/generate - 批量生成
  // ═══════════════════════════════════════════════════════════
  router.post('/generate', checkWrite, async (req, res) => {
    const { prefix = '', start, count, school_id } = req.body;
    if (count == null || school_id == null) {
      return res.status(400).json({ message: '请填写生成数量、起始编号和学校' });
    }
    const startNum = Number(start);
    const countNum = Number(count);
    const schoolIdNum = Number(school_id);
    if (isNaN(startNum) || isNaN(countNum) || countNum <= 0 || countNum > 1000) {
      return res.status(400).json({ message: '数量需在1-1000之间' });
    }

    const maxNum = startNum + countNum - 1;
    const width = String(maxNum).length;
    let generated = 0;

    for (let i = startNum; i <= maxNum; i++) {
      const cardNo = prefix + String(i).padStart(width, '0');
      try {
        await prisma.$executeRaw`
          INSERT INTO cards (card_no, school_id) VALUES (${cardNo}, ${schoolIdNum})
        `;
        generated++;
      } catch (e) {
        // skip duplicate (MySQL error 1062 / Prisma P2002)
        if (e.code !== 'P2002' && !String(e.message || '').includes('Duplicate')) {
          console.error('[cards] generate error:', e.message);
        }
      }
    }

    res.json({
      generated,
      total: countNum,
      duplicates_skipped: countNum - generated
    });
  });

  // ═══════════════════════════════════════════════════════════
  // POST /api/cards/:id/free - 释放已分配卡片
  // ═══════════════════════════════════════════════════════════
  router.post('/:id/free', checkWrite, async (req, res) => {
    const id = Number(req.params.id);
    const rows = await prisma.$queryRawUnsafe(
      `SELECT * FROM cards WHERE id = ? LIMIT 1`, id
    );
    if (!Array.isArray(rows) || !rows.length) {
      return res.status(404).json({ message: '卡片不存在' });
    }
    const card = rows[0];
    if (card.status !== 'assigned') {
      return res.status(400).json({ message: '该卡片未被分配，无需释放' });
    }

    // 清除关联学生的 card_no
    if (card.student_id) {
      await prisma.$executeRaw`
        UPDATE students SET card_no = NULL WHERE id = ${card.student_id}
      `;
    }

    await prisma.$executeRawUnsafe(
      `UPDATE cards SET student_id = NULL, status = 'unassigned' WHERE id = ?`, id
    );

    res.json({ success: true, message: '卡片已释放' });
  });

  // ═══════════════════════════════════════════════════════════
  // DELETE /api/cards/:id - 删除未分配卡片
  // ═══════════════════════════════════════════════════════════
  router.delete('/:id', checkWrite, async (req, res) => {
    const id = Number(req.params.id);
    const rows = await prisma.$queryRawUnsafe(
      `SELECT * FROM cards WHERE id = ? LIMIT 1`, id
    );
    if (!Array.isArray(rows) || !rows.length) {
      return res.status(404).json({ message: '卡片不存在' });
    }
    if (rows[0].status === 'assigned') {
      return res.status(400).json({ message: '请先释放已分配的卡片后再删除' });
    }

    await prisma.$executeRawUnsafe(`DELETE FROM cards WHERE id = ?`, id);
    res.json({ success: true, message: '卡片已删除' });
  });

  return router;
}

module.exports = createCardRoutes;
