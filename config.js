import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { z } from 'zod';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env file from project root
dotenv.config();

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3001),
  HERMES_DB_PATH: z.string().min(1),
  UI_DB_PATH: z.string().min(1).default(path.join(__dirname, 'data', '1230-ui.db')),
  HERMES_AGENT_PATH: z.string().min(1).default('/usr/local/lib/hermes-agent'),
  HERMES_API_URL: z.string().url(),
  HERMES_API_KEY: z.string().min(1),
  HERMES_PYTHON_PATH: z.string().min(1).default('python3'),
  CORS_ORIGINS: z.string().optional(),
  LIKES_WEBHOOK_URL: z.string().url().optional(),
  LIKES_COOLDOWN_SEC: z.coerce.number().int().positive().default(3600),
  FILE_RETENTION_DAYS: z.coerce.number().int().min(0).default(30),
  CLOUD_CONNECT_KEY: z.string().min(1).optional(),
  OPENCODE_URL: z.string().url().default('http://127.0.0.1:4097'),
  OPENCODE_SERVER_USERNAME: z.string().optional(),
  OPENCODE_SERVER_PASSWORD: z.string().optional(),
  OPENCODE_AUTO_APPROVE_TOOLS: z.string().optional().default('1'),
  TUDUDI_API_URL: z.string().url().default('https://todo.thinkout.ru'),
  TUDUDI_API_TOKEN: z.string().optional(),
  TUDUDI_TIMEOUT_MS: z.coerce.number().int().positive().default(15000),
});

function validateConfig() {
  const raw = {
    PORT: process.env.PORT,
    HERMES_DB_PATH: process.env.HERMES_DB_PATH || path.join(process.env.HOME || '/root', '.hermes/state.db'),
    UI_DB_PATH: process.env.UI_DB_PATH,
    HERMES_AGENT_PATH: process.env.HERMES_AGENT_PATH,
    HERMES_API_URL: process.env.HERMES_API_URL || 'http://127.0.0.1:8642',
    HERMES_API_KEY: process.env.HERMES_API_KEY,
    HERMES_PYTHON_PATH: process.env.HERMES_PYTHON_PATH,
    CORS_ORIGINS: process.env.CORS_ORIGINS,
    LIKES_WEBHOOK_URL: process.env.LIKES_WEBHOOK_URL,
    LIKES_COOLDOWN_SEC: process.env.LIKES_COOLDOWN_SEC,
    FILE_RETENTION_DAYS: process.env.FILE_RETENTION_DAYS,
    CLOUD_CONNECT_KEY: process.env.CLOUD_CONNECT_KEY,
    OPENCODE_URL: process.env.OPENCODE_URL,
    OPENCODE_SERVER_USERNAME: process.env.OPENCODE_SERVER_USERNAME,
    OPENCODE_SERVER_PASSWORD: process.env.OPENCODE_SERVER_PASSWORD,
    OPENCODE_AUTO_APPROVE_TOOLS: process.env.OPENCODE_AUTO_APPROVE_TOOLS,
    TUDUDI_API_URL: process.env.TUDUDI_API_URL,
    TUDUDI_API_TOKEN: process.env.TUDUDI_API_TOKEN,
    TUDUDI_TIMEOUT_MS: process.env.TUDUDI_TIMEOUT_MS,
  };

  const isTest = process.env.VITEST === 'true' || process.env.NODE_ENV === 'test';
  const parsed = envSchema.safeParse(raw);

  if (!parsed.success && !isTest) {
    const errors = parsed.error.issues.map(e => {
      const field = e.path.join('.');
      const issue = e.message;
      switch (field) {
        case 'HERMES_DB_PATH':
          return `HERMES_DB_PATH: ${issue}\n  → Set HERMES_DB_PATH in .env to the path of Hermes state.db (e.g. /home/user/.hermes/state.db)`;
        case 'HERMES_API_URL':
          return `HERMES_API_URL: ${issue}\n  → Set HERMES_API_URL in .env to a valid URL (e.g. http://127.0.0.1:8642)`;
        case 'HERMES_API_KEY':
          return `HERMES_API_KEY: ${issue}\n  → Set HERMES_API_KEY in .env to your Hermes API key`;
        case 'PORT':
          return `PORT: ${issue}\n  → Set PORT in .env to a valid port number (e.g. 3001)`;
        default:
          return `${field}: ${issue}`;
      }
    }).join('\n\n');

    console.error('\n❌ Configuration validation failed:\n');
    console.error(errors);
    console.error('\n📝 Create a .env file based on .env.example and fill in the required values.\n');
    process.exit(1);
  }

  // In test mode without a .env (e.g. CI), fall back to defaults so importing
  // this module never crashes the test runner. Production stays fail-fast above.
  const cfg = parsed.success ? parsed.data : {
    PORT: 3001,
    HERMES_DB_PATH: raw.HERMES_DB_PATH,
    UI_DB_PATH: raw.UI_DB_PATH || path.join(__dirname, 'data', '1230-ui.db'),
    HERMES_AGENT_PATH: raw.HERMES_AGENT_PATH || '/usr/local/lib/hermes-agent',
    HERMES_API_URL: raw.HERMES_API_URL || 'http://127.0.0.1:8642',
    HERMES_API_KEY: raw.HERMES_API_KEY || 'test-key',
    HERMES_PYTHON_PATH: raw.HERMES_PYTHON_PATH || 'python3',
    CORS_ORIGINS: raw.CORS_ORIGINS,
    LIKES_WEBHOOK_URL: raw.LIKES_WEBHOOK_URL,
    LIKES_COOLDOWN_SEC: 3600,
    FILE_RETENTION_DAYS: 30,
    CLOUD_CONNECT_KEY: raw.CLOUD_CONNECT_KEY,
    OPENCODE_URL: raw.OPENCODE_URL || 'http://127.0.0.1:4097',
    OPENCODE_SERVER_USERNAME: raw.OPENCODE_SERVER_USERNAME,
    OPENCODE_SERVER_PASSWORD: raw.OPENCODE_SERVER_PASSWORD,
    OPENCODE_AUTO_APPROVE_TOOLS: '1',
    TUDUDI_API_URL: raw.TUDUDI_API_URL || 'https://todo.thinkout.ru',
    TUDUDI_API_TOKEN: raw.TUDUDI_API_TOKEN,
    TUDUDI_TIMEOUT_MS: 15000,
  };

  const scripts = {
    saveMessages: path.join(__dirname, 'scripts', 'save_messages.py'),
    syncProviders: path.join(__dirname, 'scripts', 'sync_providers.py'),
  };

  // Path/script existence checks are skipped in test mode (CI has no Hermes
  // DB / agent install); production stays fail-fast.
  if (!isTest) {
    const pathChecks = [
      { name: 'HERMES_DB_PATH', value: cfg.HERMES_DB_PATH, mustExist: true, type: 'file' },
      { name: 'HERMES_AGENT_PATH', value: cfg.HERMES_AGENT_PATH, mustExist: true, type: 'dir' },
      { name: 'HERMES_PYTHON_PATH', value: cfg.HERMES_PYTHON_PATH, mustExist: false, type: 'file' },
    ];

    for (const check of pathChecks) {
      if (!check.mustExist) continue;
      if (!fs.existsSync(check.value)) {
        console.error(`\n❌ Path not found: ${check.name}="${check.value}"`);
        if (check.type === 'file') {
          console.error(`  → This file must exist. Check your HERMES_DB_PATH in .env.\n`);
        } else {
          console.error(`  → This directory must exist. Check your HERMES_AGENT_PATH in .env.\n`);
        }
        process.exit(1);
      }
    }

    // Validate Hermes DB is a file
    if (fs.existsSync(cfg.HERMES_DB_PATH) && !fs.statSync(cfg.HERMES_DB_PATH).isFile()) {
      console.error(`\n❌ HERMES_DB_PATH must be a file, got directory: "${cfg.HERMES_DB_PATH}"\n`);
      process.exit(1);
    }

    for (const [name, scriptPath] of Object.entries(scripts)) {
      if (!fs.existsSync(scriptPath)) {
        console.error(`\n⚠️  Script not found: ${name}="${scriptPath}"`);
        console.error(`  → This script is required for database operations.\n`);
        process.exit(1);
      }
    }
  }

  return {
    port: cfg.PORT,
    nodeEnv: process.env.NODE_ENV || 'development',
    hermesDbPath: cfg.HERMES_DB_PATH,
    uiDbPath: cfg.UI_DB_PATH,
    hermesAgentPath: cfg.HERMES_AGENT_PATH,
    hermesApiUrl: cfg.HERMES_API_URL,
    hermesApiKey: cfg.HERMES_API_KEY,
    hermesPythonPath: cfg.HERMES_PYTHON_PATH,
    corsOrigins: cfg.CORS_ORIGINS
      ? cfg.CORS_ORIGINS.split(',').map(o => o.trim())
      : ['http://localhost:3001'],
    likesWebhookUrl: cfg.LIKES_WEBHOOK_URL || null,
    likesCooldownSec: cfg.LIKES_COOLDOWN_SEC,
    fileRetentionDays: cfg.FILE_RETENTION_DAYS,
    cloudConnectKey: cfg.CLOUD_CONNECT_KEY || null,
    opencodeUrl: cfg.OPENCODE_URL,
    opencodeUsername: cfg.OPENCODE_SERVER_USERNAME || null,
    opencodePassword: cfg.OPENCODE_SERVER_PASSWORD || null,
    opencodeAutoApproveTools: ['1', 'true', 'yes', 'on'].includes((cfg.OPENCODE_AUTO_APPROVE_TOOLS || '').toLowerCase()),
    tududiApiUrl: cfg.TUDUDI_API_URL,
    tududiApiToken: cfg.TUDUDI_API_TOKEN || null,
    tududiTimeoutMs: cfg.TUDUDI_TIMEOUT_MS,
    scripts,
  };
}

const config = validateConfig();

export default config;
