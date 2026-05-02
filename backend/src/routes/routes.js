const router = require('express').Router();
const auth = require('../middleware/auth');
const { Route, Bus } = require('../models');

router.get('/', auth, async (req, res) => {
  res.json(await Route.findAll({ include: Bus }));
});

router.post('/', auth, async (req, res) => {
  res.json(await Route.create(req.body));
});

router.put('/:id', auth, async (req, res) => {
  await Route.update(req.body, { where: { id: req.params.id } });
  res.json({ success: true });
});

router.delete('/:id', auth, async (req, res) => {
  await Route.destroy({ where: { id: req.params.id } });
  res.json({ success: true });
});

module.exports = router;
