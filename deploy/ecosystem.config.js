module.exports = {
  apps: [{
    name: 'smart-bus-backend',
    script: 'src/app.js',
    cwd: '/var/www/smart-bus/backend',
    instances: 1,
    autorestart: true,
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    }
  }]
};
