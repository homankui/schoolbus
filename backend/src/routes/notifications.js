const router = require('express').Router();
const auth = require('../middleware/auth');
const { Notification, Student } = require('../models');

router.get('/', auth, async (req, res) => {
  res.json(await Notification.findAll({ include: Student, order: [['sent_at', 'DESC']], limit: 100 }));
});

router.put('/:id/read', auth, async (req, res) => {
  await Notification.update({ is_read: 1 }, { where: { id: req.params.id } });
  res.json({ success: true });
});

module.exports = router;
