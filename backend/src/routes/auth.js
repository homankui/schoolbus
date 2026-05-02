const router = require('express').Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { User } = require('../models');
const SECRET = process.env.JWT_SECRET || 'smart_bus_secret';

router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  const user = await User.findOne({ where: { username } });
  if (!user || !await bcrypt.compare(password, user.password))
    return res.status(401).json({ message: '用户名或密码错误' });
  const token = jwt.sign({ id: user.id, role: user.role }, SECRET, { expiresIn: '8h' });
  res.json({ token, role: user.role, username: user.username });
});

module.exports = router;
