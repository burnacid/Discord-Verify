module.exports = {
  apps: [
    {
      name: "discord-verify",
      script: "dist/index.js",
      cwd: __dirname,
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      max_restarts: 10,
      restart_delay: 5000,
      watch: false,
      env: {
        NODE_ENV: "production",
      },
      kill_timeout: 10000,
    },
  ],
};
