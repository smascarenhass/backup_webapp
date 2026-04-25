import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.mjs"],
    fileParallelism: false,
    maxWorkers: 1,
    minWorkers: 1,
    env: {
      BACKEND_ENABLE_LISTEN: "0",
      BACKEND_ENABLE_AUTO_BACKUP_TIMER: "0",
    },
  },
});
