const router = require('express').Router();
const auth = require('../middleware/auth');
const { RideRecord, Student, Bus } = require('../models');
const { Op } = require('sequelize');

router.get('/', auth, async (req, res) => {
  const { page = 1, pageSize = 20, date } = req.query;
  const where = {};
  if (date) where.board_time = { [Op.between]: [`${date} 00:00:00`, `${date} 23:59:59`] };
  const { count, rows } = await RideRecord.findAndCountAll({
    where, include: [Student, Bus],
    limit: parseInt(pageSize),
    offset: (page - 1) * pageSize,
    order: [['board_time', 'DESC']]
  });
  res.json({ total: count, data: rows });
});

module.exports = router;
