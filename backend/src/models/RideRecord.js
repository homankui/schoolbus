const { DataTypes } = require('sequelize');
module.exports = (sequelize) => sequelize.define('RideRecord', {
  student_id: DataTypes.INTEGER,
  bus_id: DataTypes.INTEGER,
  board_time: DataTypes.DATE,
  alight_time: DataTypes.DATE,
  board_stop: DataTypes.STRING,
  alight_stop: DataTypes.STRING
}, { tableName: 'ride_records', timestamps: false });
