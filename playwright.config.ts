import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: 'tests',
  timeout: 90_000,
  expect: { timeout: 10_000 },
  workers: 2,
  reporter: [['list']],
  projects: [
    { name: 'e2e', testMatch: /e2e\/.*\.spec\.ts$/ },
    { name: 'visual', testMatch: /visual\/.*\.spec\.ts$/ },
    { name: 'packaged', testMatch: /packaged\/.*\.spec\.ts$/ }
  ]
})
