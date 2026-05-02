const { DataTypes } = require('sequelize');
module.exports = (sequelize) => sequelize.define('Route', {
  name: DataTypes.STRING,
  stops: DataTypes.JSON,
  bus_id: DataTypes.INTEGER
}, { tableName: 'routes', timestamps: true, createdAt: 'created_at', updatedAt: false });
