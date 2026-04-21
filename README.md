# BuyPal

Experience stress-free online shopping with AI-powered browser automation. BuyPal uses LLM agents to handle the entire checkout process, from product selection to payment confirmation.

<img width="849" height="952" alt="image" src="https://github.com/user-attachments/assets/c49dc6ea-87a7-43bf-a56f-2212208e0f4f" />

## Overview

BuyPal automates online purchases using browser-use agents to reduce anxiety and decision fatigue. It connects to your browser via Chrome DevTools Protocol (CDP) and uses AI to navigate and complete purchases on your behalf.

### Why BuyPal?

- **AI-Powered Navigation**: Uses LLM agents to intelligently navigate e-commerce sites
- **Browser Independence**: Works with any Chrome/Chromium browser via CDP
- **Queue Management**: Handles multiple purchase requests with automatic retry logic
- **Flexible Models**: Supports multiple LLM providers through OpenRouter
- **Web Interface**: Easy-to-use UI for managing purchase tasks

### Architecture

- **Backend**: FastAPI server with browser-use agents
- **Browser Control**: Chrome DevTools Protocol (CDP)
- **AI Models**: Configurable LLM via OpenRouter (default: google/gemini-2.5-flash-lite)
- **Task Queue**: Async task processing with retry logic and status tracking

### Supported Platforms

Any e-commerce website accessible via browser (agent navigates intelligently)

## Quick Start (Local Development)

**Prerequisites:** 
- Python 3.11+
- Chrome/Chromium browser with remote debugging enabled
- OpenRouter API key

### 1. Setup Browser with CDP

Start Chrome with remote debugging enabled:

```bash
# Linux
google-chrome --remote-debugging-port=9222 --user-data-dir=/tmp/chrome-debug

# macOS
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --remote-debugging-port=9222 --user-data-dir=/tmp/chrome-debug

# Windows
chrome.exe --remote-debugging-port=9222 --user-data-dir=C:\temp\chrome-debug
```

### 2. Install and Configure

```bash
# Clone repository
git clone https://github.com/thiagosanches/buypal.git
cd buypal

# Setup environment
cp .env.example .env
# Edit .env and add your OPENROUTER_API_KEY

# Install dependencies (using uv, pip, or your preferred tool)
pip install -e .

# Start the server
uvicorn main:app --host 0.0.0.0 --port 8000
```

### 3. Access Web Interface

Navigate to http://localhost:8000 and:

1. Add product URLs to your list
2. Configure task prompts (e.g., "Add this product to cart and proceed to checkout")
3. Select your preferred LLM model
4. Click "Buy" to queue the task

### 4. API Usage

```bash
# Queue a purchase task
curl -X POST http://localhost:8000/order \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://example.com/product",
    "task": "Add to cart and complete purchase",
    "model": "google/gemini-2.5-flash-lite",
    "browser_address": "http://127.0.0.1:9222"
  }'

# Check task status
curl http://localhost:8000/status/{task_id}

# List all tasks
curl http://localhost:8000/tasks

# Health check
curl http://localhost:8000/health
```

## Docker Setup

```bash
# Build docker image
docker build -t buypal .

# Run the container
docker run -d \
  --env-file .env \
  -p 8000:8000 \
  --restart unless-stopped \
  --name buypal \
  buypal

# Access the web interface at http://localhost:8000
```

> [!NOTE]
> The Docker container connects to your browser via CDP. Ensure Chrome is running with `--remote-debugging-port=9222` on your host machine, or use `--network host` mode to allow container access to localhost.

## Configuration

### Environment Variables

- `OPENROUTER_API_KEY` (required): Your OpenRouter API key for LLM access
- `CDP_URL` (optional): Browser CDP endpoint (default: `http://127.0.0.1:9222`)
- `LLM_MODEL` (optional): Default LLM model (default: `google/gemini-2.5-flash-lite`)
- `LLM_BASE_URL` (optional): LLM API base URL (default: `https://openrouter.ai/api/v1`)

### Supported LLM Models

Any model available through OpenRouter, including:
- `google/gemini-2.5-flash-lite` (default, cost-effective)
- `google/gemini-2.5-flash`
- `openai/gpt-4o`
- `anthropic/claude-3.5-sonnet`
- And many more...

### Browser Requirements

- Chrome or Chromium-based browser
- Started with remote debugging enabled on port 9222
- User must be logged into e-commerce sites where purchases will be made

## How It Works

1. **Task Queue**: Purchase requests are queued and processed sequentially
2. **Browser Connection**: Fresh browser connection created for each task via CDP
3. **AI Navigation**: LLM agent navigates the website based on your task prompt
4. **Retry Logic**: Automatic retry on failures (up to 2 retries) with exponential backoff
5. **Status Tracking**: Monitor task progress through API or web interface

## Troubleshooting

### "Browser unavailable" error
- Ensure Chrome is running with `--remote-debugging-port=9222`
- Check that the CDP URL is correct (default: `http://127.0.0.1:9222`)
- Verify no firewall is blocking port 9222

### "CDP client not initialized" error
- The system automatically creates fresh browser connections per task
- This error typically resolves with automatic retry logic

### Task keeps failing
- Verify you're logged into the e-commerce site in your CDP-enabled browser
- Check that the task prompt is clear and specific
- Review task status details via `/status/{task_id}` endpoint

## Security & Privacy

- All sensitive information is stored locally in your `.env` file
- API keys are never shared externally
- Browser sessions use your existing logged-in accounts
- No data is sent anywhere except to your configured LLM provider

## Contributing

Contributions welcome! Areas for improvement:
- Additional e-commerce platform optimizations
- Enhanced error handling and recovery
- Better task scheduling and management
- UI/UX improvements

Please submit PRs or open issues with suggestions.

## License

[MIT License](LICENSE)
