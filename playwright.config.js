import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir:'./test/browser',fullyParallel:false,timeout:45000,
  use:{baseURL:'http://127.0.0.1:4173',headless:true},
  webServer:{command:'npm run dev',url:'http://127.0.0.1:4173',reuseExistingServer:!process.env.CI,timeout:30000},
  projects:[
    {name:'chromium',use:{browserName:'chromium',launchOptions:{args:['--autoplay-policy=no-user-gesture-required']}}},
    {name:'webkit',use:{browserName:'webkit'}}
  ]
});
