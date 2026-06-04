import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env file from project root
dotenv.config();

const config = {
  // Server
  port: process.env.PORT || 3001,
  nodeEnv: process.env.NODE_ENV || 'development',
  
  // Paths
  hermesDbPath: process.env.HERMES_DB_PATH || path.join(process.env.HOME || '~', '.hermes/state.db'),
  uiDbPath: process.env.UI_DB_PATH || path.join(__dirname, 'data', '1230-ui.db'),
  hermesAgentPath: process.env.HERMES_AGENT_PATH || '/usr/local/lib/hermes-agent',
  
  // Hermes API
  hermesApiUrl: process.env.HERMES_API_URL || 'http://127.0.0.1:8642',
  hermesApiKey: process.env.HERMES_API_KEY || 'changeme',
  
  // Python
  hermesPythonPath: process.env.HERMES_PYTHON_PATH || 'python3',
  
  // Scripts (relative to project root)
  scripts: {
    saveMessages: path.join(__dirname, 'scripts', 'save_messages.py'),
    syncProviders: path.join(__dirname, 'scripts', 'sync_providers.py'),
  }
};

export default config;
