const router = require('express').Router();
const auth = require('../middleware/auth');
const { Bus } = require('../models');

router.get('/', auth, async (req, res) => {
  res.json(await Bus.findAll());
});

router.post('/', auth, async (req, res) => {
  res.json(await Bus.create(req.body));
});

router.put('/:id', auth, async (req, res) => {
  await Bus.update(req.body, { where: { id: req.params.id } });
  res.json({ success: true });
});

router.delete('/:id', auth, async (req, res) => {
  await Bus.destroy({ where: { id: req.params.id } });
  res.json({ success: true });
});

module.exports = router;
