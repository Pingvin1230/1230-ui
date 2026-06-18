#!/bin/bash

# 1230-UI Installation Script
# This script installs and configures 1230-UI on a new server

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Check Node.js version
check_node_version() {
    if ! command_exists node; then
        log_error "Node.js is not installed"
        log_info "Please install Node.js 18+ from https://nodejs.org/"
        exit 1
    fi

    NODE_VERSION=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
    if [ "$NODE_VERSION" -lt 18 ]; then
        log_error "Node.js version $NODE_VERSION is too old. Required: 18+"
        exit 1
    fi
    
    log_success "Node.js $(node --version) detected"
}

# Check Python version
check_python_version() {
    PYTHON_CMD=""
    
    if command_exists python3; then
        PYTHON_CMD="python3"
    elif command_exists python; then
        PYTHON_CMD="python"
    else
        log_error "Python is not installed"
        log_info "Please install Python 3.8+ from https://www.python.org/"
        exit 1
    fi

    PYTHON_VERSION=$($PYTHON_CMD --version 2>&1 | awk '{print $2}' | cut -d'.' -f1,2)
    PYTHON_MAJOR=$(echo $PYTHON_VERSION | cut -d'.' -f1)
    PYTHON_MINOR=$(echo $PYTHON_VERSION | cut -d'.' -f2)
    
    if [ "$PYTHON_MAJOR" -lt 3 ] || ([ "$PYTHON_MAJOR" -eq 3 ] && [ "$PYTHON_MINOR" -lt 8 ]); then
        log_error "Python version $PYTHON_VERSION is too old. Required: 3.8+"
        exit 1
    fi
    
    log_success "Python $PYTHON_VERSION detected"
}

# Check Hermes installation
check_hermes() {
    HERMES_PATH="$HOME/.hermes"
    
    if [ ! -d "$HERMES_PATH" ]; then
        log_error "Hermes is not installed at $HERMES_PATH"
        log_info "Please install Hermes from https://github.com/anthropics/hermes"
        exit 1
    fi
    
    if [ ! -f "$HERMES_PATH/state.db" ]; then
        log_error "Hermes database not found at $HERMES_PATH/state.db"
        log_info "Please run Hermes at least once to create the database"
        exit 1
    fi
    
    if [ ! -f "$HERMES_PATH/hermes-agent/venv/bin/python" ]; then
        log_warning "Hermes Python venv not found at $HERMES_PATH/hermes-agent/venv/bin/python"
        log_warning "Will use system Python instead"
    fi
    
    log_success "Hermes installation detected at $HERMES_PATH"
}

# Check for hermes command
check_hermes_command() {
    if ! command_exists hermes; then
        log_warning "hermes command not found in PATH"
        log_warning "System commands (update, doctor) may not work"
        log_info "Add Hermes to PATH or install it globally"
    else
        log_success "hermes command available"
    fi
}

# Install dependencies
install_dependencies() {
    log_info "Installing Node.js dependencies..."
    npm install
    log_success "Dependencies installed"
}

# Build frontend
build_frontend() {
    log_info "Building frontend..."
    npm run build
    log_success "Frontend built successfully"
}

# Configure environment
configure_environment() {
    if [ -f ".env" ]; then
        log_warning ".env file already exists"
        read -p "Do you want to overwrite it? (y/N): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            log_info "Keeping existing .env file"
            return
        fi
    fi
    
    log_info "Creating .env file from template..."
    
    # Read configuration from user
    echo ""
    echo "=== Configuration ==="
    echo ""
    
    # Hermes DB Path
    DEFAULT_HERMES_DB="$HOME/.hermes/state.db"
    read -p "Hermes database path [$DEFAULT_HERMES_DB]: " HERMES_DB_PATH
    HERMES_DB_PATH=${HERMES_DB_PATH:-$DEFAULT_HERMES_DB}
    
    # UI DB Path
    DEFAULT_UI_DB="./data/1230-ui.db"
    read -p "UI database path [$DEFAULT_UI_DB]: " UI_DB_PATH
    UI_DB_PATH=${UI_DB_PATH:-$DEFAULT_UI_DB}
    
    # Hermes API URL
    DEFAULT_API_URL="http://127.0.0.1:8642"
    read -p "Hermes API URL [$DEFAULT_API_URL]: " HERMES_API_URL
    HERMES_API_URL=${HERMES_API_URL:-$DEFAULT_API_URL}
    
    # Hermes API Key
    DEFAULT_API_KEY="1230-ui-secret-key-$(date +%s)"
    read -p "Hermes API key [$DEFAULT_API_KEY]: " HERMES_API_KEY
    HERMES_API_KEY=${HERMES_API_KEY:-$DEFAULT_API_KEY}
    
    # Hermes Python Path
    DEFAULT_PYTHON_PATH="$HOME/.hermes/hermes-agent/venv/bin/python"
    if [ -f "$DEFAULT_PYTHON_PATH" ]; then
        read -p "Hermes Python path [$DEFAULT_PYTHON_PATH]: " HERMES_PYTHON_PATH
        HERMES_PYTHON_PATH=${HERMES_PYTHON_PATH:-$DEFAULT_PYTHON_PATH}
    else
        read -p "Hermes Python path [python3]: " HERMES_PYTHON_PATH
        HERMES_PYTHON_PATH=${HERMES_PYTHON_PATH:-python3}
    fi
    
    # Hermes Agent Path
    DEFAULT_HERMES_PATH="/usr/local/lib/hermes-agent"
    read -p "Hermes agent path [$DEFAULT_HERMES_PATH]: " HERMES_AGENT_PATH
    HERMES_AGENT_PATH=${HERMES_AGENT_PATH:-$DEFAULT_HERMES_PATH}
    
    # Port
    DEFAULT_PORT="3001"
    read -p "Server port [$DEFAULT_PORT]: " PORT
    PORT=${PORT:-$DEFAULT_PORT}
    
    # Write .env file
    cat > .env <<EOF
# 1230-UI Configuration

# Server
PORT=$PORT

# Hermes Database
HERMES_DB_PATH=$HERMES_DB_PATH

# 1230-UI Database
UI_DB_PATH=$UI_DB_PATH

# Hermes API
HERMES_API_URL=$HERMES_API_URL
HERMES_API_KEY=$HERMES_API_KEY

# Python Environment
HERMES_PYTHON_PATH=$HERMES_PYTHON_PATH

# Hermes Agent Installation
HERMES_AGENT_PATH=$HERMES_AGENT_PATH
EOF
    
    log_success ".env file created"
}

# Create data directory
create_data_directory() {
    if [ ! -d "data" ]; then
        log_info "Creating data directory..."
        mkdir -p data
        log_success "Data directory created"
    fi
}

# Setup systemd service (optional)
setup_systemd() {
    echo ""
    read -p "Do you want to install as a systemd service? (y/N): " -n 1 -r
    echo
    
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        log_info "Skipping systemd service installation"
        return
    fi
    
    log_info "Installing systemd service..."
    
    CURRENT_DIR=$(pwd)
    
    sudo tee /etc/systemd/system/1230-ui.service > /dev/null <<EOF
[Unit]
Description=1230-UI Hermes Web Interface
After=network.target hermes-api.service
Wants=hermes-api.service

[Service]
Type=simple
User=$(whoami)
WorkingDirectory=$CURRENT_DIR
EnvironmentFile=$CURRENT_DIR/.env
ExecStart=/usr/bin/node --experimental-modules server.js
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF
    
    sudo systemctl daemon-reload
    sudo systemctl enable 1230-ui
    sudo systemctl start 1230-ui
    
    log_success "Systemd service installed and started"
    log_info "Check status with: sudo systemctl status 1230-ui"
    log_info "View logs with: sudo journalctl -u 1230-ui -f"
}

# Setup OpenCode executor service (optional)
setup_opencode() {
    if command -v opencode &>/dev/null; then
        echo ""
        log_info "OpenCode binary detected: $(command -v opencode)"
        read -p "Do you want to install the OpenCode systemd service (opencode-1230ui)? (y/N): " -n 1 -r
        echo

        if [[ $REPLY =~ ^[Yy]$ ]]; then
            if ! command_exists systemctl; then
                log_warning "systemd not available — skipping service installation"
                log_info "To run OpenCode manually: opencode web --hostname 127.0.0.1 --port 4097"
                return
            fi

            log_info "Installing opencode-1230ui.service..."

            sudo tee /etc/systemd/system/opencode-1230ui.service > /dev/null <<'EOF'
[Unit]
Description=OpenCode AI Coding Assistant (1230-UI)
After=network.target

[Service]
Type=simple
User=root
ExecStart=/usr/local/bin/opencode web --hostname 127.0.0.1 --port 4097
Restart=always
RestartSec=5
Environment=HOME=/root
Environment=PATH=/usr/local/bin:/usr/bin:/bin

[Install]
WantedBy=multi-user.target
EOF

            sudo systemctl daemon-reload
            log_success "opencode-1230ui.service installed"
            log_info "Enable and start with: sudo systemctl enable --now opencode-1230ui.service"
            log_info "Make sure OPENCODE_URL=http://127.0.0.1:4097 is set in .env"
        else
            log_info "Skipping OpenCode service installation"
        fi
    else
        log_warning "OpenCode not found — to enable OpenCode executor, install opencode binary and set OPENCODE_URL in .env. See docs/INSTALLATION.md for details."
    fi
}

# Main installation
main() {
    echo ""
    echo "=================================="
    echo "  1230-UI Installation Script"
    echo "=================================="
    echo ""
    
    log_info "Checking prerequisites..."
    check_node_version
    check_python_version
    check_hermes
    check_hermes_command
    
    echo ""
    log_info "Installing 1230-UI..."
    install_dependencies
    build_frontend
    create_data_directory
    configure_environment
    
    echo ""
    setup_systemd

    echo ""
    setup_opencode

    echo ""
    echo "=================================="
    log_success "Installation complete!"
    echo "=================================="
    echo ""
    
    if systemctl is-active --quiet 1230-ui 2>/dev/null; then
        log_info "1230-UI is running as a systemd service"
        log_info "Access the web interface at: http://localhost:$(grep '^PORT=' .env | cut -d'=' -f2)"
    else
        log_info "To start 1230-UI manually, run:"
        echo "  node server.js"
        echo ""
        log_info "Or with PM2:"
        echo "  pm2 start server.js --name 1230-ui"
    fi
    
    echo ""
    log_info "For more information, see README.md"
    echo ""
}

# Run main function
main
