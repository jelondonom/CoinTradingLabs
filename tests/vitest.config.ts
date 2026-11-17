import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['properties/**/*.test.ts', 'security/**/*.test.ts', 'audit/**/*.test.ts'],
    passWithNoTests: false,
  },
});
