const router = require('express').Router();
const auth = require('../middleware/auth');
const { Driver, Bus } = require('../models');

router.get('/', auth, async (req, res) => {
  res.json(await Driver.findAll({ include: Bus }));
});

router.post('/', auth, async (req, res) => {
  res.json(await Driver.create(req.body));
});

router.put('/:id', auth, async (req, res) => {
  await Driver.update(req.body, { where: { id: req.params.id } });
  res.json({ success: true });
});

router.delete('/:id', auth, async (req, res) => {
  await Driver.destroy({ where: { id: req.params.id } });
  res.json({ success: true });
});

module.exports = router;
