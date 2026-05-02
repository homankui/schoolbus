const { DataTypes } = require('sequelize');
module.exports = (sequelize) => sequelize.define('Bus', {
  plate: DataTypes.STRING,
  model: DataTypes.STRING,
  capacity: { type: DataTypes.INTEGER, defaultValue: 50 },
  status: { type: DataTypes.ENUM('active','inactive','maintenance'), defaultValue: 'active' }
}, { tableName: 'buses', timestamps: true, createdAt: 'created_at', updatedAt: false });
