const { DataTypes } = require('sequelize');
module.exports = (sequelize) => sequelize.define('Student', {
  name: DataTypes.STRING,
  grade: DataTypes.STRING,
  parent_phone: DataTypes.STRING,
  face_id: DataTypes.STRING,
  route_id: DataTypes.INTEGER
}, { tableName: 'students', timestamps: true, createdAt: 'created_at', updatedAt: false });
