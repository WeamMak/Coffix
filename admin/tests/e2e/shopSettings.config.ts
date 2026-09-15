import { defineConfig } from '@playwright/test';
import isolated from './images.config';
export default defineConfig({ ...isolated, testMatch: 'shopSettings.spec.ts' });
