# Installation Guide

## Requirements

- Node.js 18+
- Python 3.x
- Hermes Agent (installed and configured)
- PM2 or systemd (for production, optional)

## Quick Start

```bash
# Clone repository
git clone https://github.com/Pingvin1230/1230-ui.git
cd 1230-ui

# Run installation script
./install.sh
```

The script automatically:
- Checks for Node.js 18+, Python 3.x, and Hermes
- Installs dependencies and builds frontend
- Creates `.env` file with interactive parameter input
- Optionally configures systemd service

## Manual Installation

```bash
# 1. Clone repository
git clone https://github.com/Pingvin1230/1230-ui.git
cd 1230-ui

# 2. Install dependencies
npm install

# 3. Create configuration
cp .env.example .env
# Edit .env for your configuration (see docs/CONFIGURATION.md)

# 4. Build frontend
npm run build

# 5. Run
node server.js
```

Application will be available on port 3001.

## Production Deployment

### Option 1: PM2

```bash
# Build frontend
npm run build

# Install PM2 globally
npm install -g pm2

# Start application
pm2 start server.js --name 1230-ui

# Save PM2 configuration
pm2 save

# Setup PM2 to start on boot
pm2 startup
```

### Option 2: systemd (Recommended)

More reliable option for production: auto-start on boot, automatic restart on crash.

```bash
# Create systemd service file
sudo tee /etc/systemd/system/1230-ui.service > /dev/null <<EOF
[Unit]
Description=1230-UI Hermes Web Interface
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/1230-ui
ExecStart=/usr/bin/node --experimental-modules server.js
Restart=always
RestartSec=5

EnvironmentFile=/opt/1230-ui/.env

[Install]
WantedBy=multi-user.target
EOF

# Reload systemd and start service
sudo systemctl daemon-reload
sudo systemctl enable 1230-ui
sudo systemctl start 1230-ui

# Check status
sudo systemctl status 1230-ui
```

**Useful commands:**
```bash
systemctl status 1230-ui    # Service status
systemctl restart 1230-ui   # Restart
systemctl stop 1230-ui      # Stop
journalctl -u 1230-ui -f    # Real-time logs
```

## Nginx Reverse Proxy (Optional)

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

## Next Steps

- [Configuration](CONFIGURATION.md) — configure environment variables
- [Architecture](ARCHITECTURE.md) — understand the system design
- [API Documentation](API.md) — REST API reference
