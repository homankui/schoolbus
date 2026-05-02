const { Sequelize } = require('sequelize');

const sequelize = new Sequelize(
  process.env.DB_NAME || 'smart_bus',
  process.env.DB_USER || 'root',
  process.env.DB_PASS || 'password',
  { host: process.env.DB_HOST || 'localhost', dialect: 'mysql', logging: false }
);

const Bus = require('./Bus')(sequelize);
const Driver = require('./Driver')(sequelize);
const Route = require('./Route')(sequelize);
const Student = require('./Student')(sequelize);
const RideRecord = require('./RideRecord')(sequelize);
const BusLocation = require('./BusLocation')(sequelize);
const Notification = require('./Notification')(sequelize);
const User = require('./User')(sequelize);

Bus.hasMany(Driver, { foreignKey: 'bus_id' });
Driver.belongsTo(Bus, { foreignKey: 'bus_id' });
Bus.hasMany(Route, { foreignKey: 'bus_id' });
Route.belongsTo(Bus, { foreignKey: 'bus_id' });
RideRecord.belongsTo(Student, { foreignKey: 'student_id' });
RideRecord.belongsTo(Bus, { foreignKey: 'bus_id' });
Notification.belongsTo(Student, { foreignKey: 'student_id' });

module.exports = { sequelize, Bus, Driver, Route, Student, RideRecord, BusLocation, Notification, User };
