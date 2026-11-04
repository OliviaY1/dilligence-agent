import { defineConfig } from "vitest/config";

// frontend/ has its own vitest config.
export default defineConfig({
  test: { exclude: ["frontend/**", "node_modules/**"] },
});
