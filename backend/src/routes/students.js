const router = require('express').Router();
const auth = require('../middleware/auth');
const { Student } = require('../models');

router.get('/', auth, async (req, res) => {
  res.json(await Student.findAll());
});

router.post('/', auth, async (req, res) => {
  res.json(await Student.create(req.body));
});

router.put('/:id', auth, async (req, res) => {
  await Student.update(req.body, { where: { id: req.params.id } });
  res.json({ success: true });
});

router.delete('/:id', auth, async (req, res) => {
  await Student.destroy({ where: { id: req.params.id } });
  res.json({ success: true });
});

module.exports = router;
