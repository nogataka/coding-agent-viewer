#!/bin/bash

# Coding Agent Backend Development Setup Script

set -e

echo "🚀 Starting Coding Agent Backend Setup..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    print_error "Node.js is not installed. Please install Node.js 18+ first."
    exit 1
fi

NODE_VERSION=$(node --version)
print_status "Node.js version: $NODE_VERSION"

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    print_error "npm is not installed. Please install npm first."
    exit 1
fi

NPM_VERSION=$(npm --version)
print_status "npm version: $NPM_VERSION"

# Check if git is installed
if ! command -v git &> /dev/null; then
    print_error "git is not installed. Please install git first."
    exit 1
fi

GIT_VERSION=$(git --version)
print_status "git version: $GIT_VERSION"

# Create data directory if it doesn't exist
if [ ! -d "data" ]; then
    print_status "Creating data directory..."
    mkdir -p data
    print_success "Data directory created"
fi

# Install dependencies if node_modules doesn't exist
if [ ! -d "node_modules" ]; then
    print_status "Installing dependencies..."
    npm install
    print_success "Dependencies installed"
else
    print_status "Dependencies already installed (use 'npm install' to update)"
fi

# Check if .env exists, if not copy from .env.example
if [ ! -f ".env" ]; then
    if [ -f ".env.example" ]; then
        print_status "Creating .env file from .env.example..."
        cp .env.example .env
        print_success ".env file created"
        print_warning "Please edit .env file to configure your environment variables"
    else
        print_warning "No .env.example file found. Creating minimal .env..."
        cat > .env << EOF
NODE_ENV=development
PORT=3000
EOF
        print_success "Minimal .env file created"
    fi
else
    print_status ".env file already exists"
fi

# Check environment variables
print_status "Checking environment configuration..."

if grep -q "ANTHROPIC_API_KEY=" .env && ! grep -q "ANTHROPIC_API_KEY=$" .env && ! grep -q "# ANTHROPIC_API_KEY=" .env; then
    print_success "Anthropic API key configured"
else
    print_warning "Anthropic API key not configured. Claude executors will not work."
    print_warning "To enable: Set ANTHROPIC_API_KEY in .env file"
fi

# Run type checking
print_status "Running type checking..."
if npm run typecheck; then
    print_success "Type checking passed"
else
    print_warning "Type checking failed. Check for TypeScript errors."
fi

# Display startup information
echo ""
echo "🎉 Setup completed!"
echo ""
echo "Next steps:"
echo "1. Edit .env file to configure API keys and tokens"
echo "2. Run 'npm run dev' to start the development server"
echo "3. Open http://localhost:3000 in your browser"
echo ""
echo "Available commands:"
echo "  npm run dev          - Start development server"
echo "  npm run build        - Build for production"  
echo "  npm run start        - Start production server"
echo "  npm run check        - Run all checks (type, lint, format)"
echo "  npm run clean         - Remove build artifacts"
echo "  npm run clean:logs    - Remove temporary log files"
echo ""
echo "API endpoints will be available at:"
echo "  http://localhost:3001/api/health    - Health check"
echo "  http://localhost:3001/api/projects  - Projects API"
echo "  http://localhost:3001/api/tasks     - Tasks API"
echo ""

# Ask if user wants to start the server
read -p "Do you want to start the development server now? (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    print_status "Starting development server..."
    npm run dev
else
    print_status "Setup complete. Run 'npm run dev' when ready to start."
fi
