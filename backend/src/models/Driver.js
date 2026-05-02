const { DataTypes } = require('sequelize');
module.exports = (sequelize) => sequelize.define('Driver', {
  name: DataTypes.STRING,
  phone: DataTypes.STRING,
  license: DataTypes.STRING,
  bus_id: DataTypes.INTEGER
}, { tableName: 'drivers', timestamps: true, createdAt: 'created_at', updatedAt: false });
