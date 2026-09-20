module.exports = {
  apps: [
    {
      name: "phraseweave_api",
      script: "pnpm",
      args: "start:prod",
      cwd: ".",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "1G",
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
