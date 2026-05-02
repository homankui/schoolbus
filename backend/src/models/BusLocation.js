const { DataTypes } = require('sequelize');
module.exports = (sequelize) => sequelize.define('BusLocation', {
  bus_id: DataTypes.INTEGER,
  lat: DataTypes.DECIMAL(10,7),
  lng: DataTypes.DECIMAL(10,7),
  speed: DataTypes.DECIMAL(5,2),
  timestamp: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
}, { tableName: 'bus_locations', timestamps: false });
