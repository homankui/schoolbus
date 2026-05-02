const { DataTypes } = require('sequelize');
module.exports = (sequelize) => sequelize.define('User', {
  username: { type: DataTypes.STRING, unique: true },
  password: DataTypes.STRING,
  role: { type: DataTypes.ENUM('admin','operator'), defaultValue: 'operator' }
}, { tableName: 'users', timestamps: false });
