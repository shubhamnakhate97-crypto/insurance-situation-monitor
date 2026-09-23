import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from 'node:path';
import { feedServer } from './feed-server';
export default defineConfig(({mode})=>{
  const env={...loadEnv(mode,resolve(process.cwd(),'../..'),''),...process.env};
  return {envPrefix:'PUBLIC_',plugins:[react(),{
    name:'live-feed-service',
    configureServer(server){server.middlewares.use(feedServer(env));},
    configurePreviewServer(server){server.middlewares.use(feedServer(env));},
  }]};
});
