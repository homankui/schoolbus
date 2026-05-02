const { DataTypes } = require('sequelize');
module.exports = (sequelize) => sequelize.define('Notification', {
  student_id: DataTypes.INTEGER,
  type: DataTypes.ENUM('board','alight','alert'),
  content: DataTypes.TEXT,
  sent_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  is_read: { type: DataTypes.TINYINT, defaultValue: 0 }
}, { tableName: 'notifications', timestamps: false });
