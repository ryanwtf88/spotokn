# Spotokn

[![Bun](https://img.shields.io/badge/Bun-1.1.0-000000?style=flat&logo=bun)](https://bun.sh)
[![Elysia](https://img.shields.io/badge/Elysia-1.3.5-00D4AA?style=flat)](https://elysiajs.com)
[![Playwright](https://img.shields.io/badge/Playwright-1.54.1-2EAD33?style=flat&logo=playwright)](https://playwright.dev)
[![Docker](https://img.shields.io/badge/Docker-Ready-2496ED?style=flat&logo=docker)](https://docker.com)

A high-performance, real-time Spotify token service with advanced monitoring, error handling, and automatic token management. Built with Bun, Elysia, and Playwright for maximum performance and reliability.

## Features

- 🚀 **High Performance**: Built with Bun runtime and Elysia framework
- 🔄 **Real-time Monitoring**: Live status updates and metrics dashboard
- 🛡️ **Advanced Error Handling**: Comprehensive error recovery and retry logic
- 🎯 **Smart Token Management**: Proactive refresh and intelligent caching
- 🌐 **Beautiful Web Interface**: Real-time dashboard with live metrics
- 🐳 **Docker Ready**: Multi-stage builds with security best practices
- 📊 **Comprehensive Metrics**: Detailed performance and usage statistics
- 🔧 **Developer Friendly**: Extensive API endpoints and debugging tools

## 🚀 Quick Start

### Prerequisites
- [Bun](https://bun.sh) >= 1.0.0
- [Playwright](https://playwright.dev) (auto-installed)

### Installation
```bash
# Clone the repository
git clone https://github.com/ryanwtf88/spotokn.git
cd spotokn

# Install dependencies and setup
bun run setup

# Start the service
bun run start
```

### Docker (Recommended)
```bash
# Build and run with Docker
bun run docker:build
bun run docker:run

# Or use Docker Compose
bun run docker:dev
```

## Web Interface

Visit `http://localhost:3012` for the beautiful real-time dashboard featuring:
- Live service status and metrics
- Quick action buttons
- API endpoint documentation
- Real-time monitoring data

## API Endpoints

### Core Endpoints
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/token` | GET | Get Spotify token (anonymous or authenticated) |
| `/api/token?debug=true` | GET | Get detailed service status |
| `/api/token?metrics=true` | GET | Get comprehensive metrics |
| `/api/token?force=true` | GET | Force refresh token |
| `/api/status` | GET | Service health and status |
| `/api/metrics` | GET | Performance metrics |
| `/api/refresh` | GET | Force refresh anonymous token |
| `/health` | GET | Basic health check |
| `/` | GET | Web interface |

### Usage Examples

#### Get Anonymous Token
```bash
curl http://localhost:3012/api/token
```

#### Get Authenticated Token
```bash
curl -H "Cookie: sp_dc=your_spotify_cookie" http://localhost:3012/api/token
```

#### Force Refresh
```bash
curl http://localhost:3012/api/token?force=true
```

#### Get Debug Information
```bash
curl http://localhost:3012/api/token?debug=true
```

#### Get Metrics
```bash
curl http://localhost:3012/api/metrics
```

## Response Format

### Successful Token Response
```json
{
  "success": true,
  "data": {
    "accessToken": "BQC7...",
    "accessTokenExpirationTimestampMs": 1678886400000,
    "clientId": "3a0ed...",
    "isAnonymous": false,
    "cached": false,
    "source": "authenticated",
    "timestamp": 1678886300000
  },
  "timestamp": 1678886300000,
  "requestId": "req_1234567890_abc123"
}
```

### Error Response
```json
{
  "success": false,
  "error": "Token service temporarily unavailable",
  "code": "TOKEN_FETCH_FAILED",
  "timestamp": 1678886300000,
  "requestId": "req_1234567890_abc123",
  "details": {
    "message": "Unable to fetch Spotify token",
    "suggestion": "Check your internet connection and try again"
  }
}
```

## Configuration

### Environment Variables
```bash
# Server Configuration
PORT=3012
NODE_ENV=production

# Browser Configuration
HEADLESS=true
BROWSER_PATH=/usr/bin/chromium-browser
BROWSER_TIMEOUT=15000
BROWSER_RETRY_ATTEMPTS=3
BROWSER_RETRY_DELAY=2000

# Token Configuration
PROACTIVE_REFRESH_BUFFER=300000  # 5 minutes
CHECK_INTERVAL=60000             # 1 minute
MAX_RETRIES=3
RETRY_DELAY=2000
CACHE_TIMEOUT=3600000            # 1 hour
```

### LavaSrc Integration
```yaml
spotify:
  preferAnonymousToken: true
  customTokenEndpoint: "http://yourserver:3012/api/token"
  # Optional: Use authenticated tokens
  # customTokenEndpoint: "http://yourserver:3012/api/token"
  # And pass sp_dc cookie in requests
```

## Development

### Available Scripts
```bash
# Development
bun run dev          # Start with hot reload
bun run start        # Start production server
bun run build        # Build for production

# Testing
bun run test         # Run tests
bun run test:watch   # Run tests in watch mode

# Code Quality
bun run lint         # Type checking
bun run format       # Format code

# Docker
bun run docker:build # Build Docker image
bun run docker:run   # Run Docker container
bun run docker:dev   # Docker Compose development

# Utilities
bun run health       # Health check
bun run token:test   # Test token endpoint
bun run status       # Get service status
bun run metrics      # Get metrics
bun run refresh      # Force refresh
bun run clean        # Clean build artifacts
```

## Docker

### Multi-stage Build
The Dockerfile uses a multi-stage build for optimal production images:
- **Base stage**: Installs dependencies and builds the application
- **Production stage**: Creates minimal runtime image with security hardening

### Security Features
- Non-root user execution
- Minimal Alpine Linux base
- Security-hardened Chromium installation
- Health checks and proper signal handling

### Docker Commands
```bash
# Build image
docker build -t spotify-tokener .

# Run container
docker run -p 3012:3012 --env-file=.env spotify-tokener

# Run with Docker Compose
docker-compose up --build
```

## Monitoring & Metrics

### Real-time Metrics
- Service uptime and status
- Memory usage and performance
- Token refresh statistics
- Error rates and recovery
- Browser connection status
- Request/response times

### Health Checks
- Service availability
- Browser automation health
- Token generation capability
- Memory and resource usage

## Troubleshooting

### Common Issues

#### Playwright Installation
```bash
# Force reinstall Playwright
bunx playwright install --with-deps chromium --force
```

#### Browser Launch Issues
```bash
# Check browser path
export BROWSER_PATH=/usr/bin/chromium-browser

# Run in headless mode
export HEADLESS=true
```

#### Memory Issues
```bash
# Increase memory limit
export NODE_OPTIONS="--max-old-space-size=4096"
```

#### Token Generation Slow
- Check internet connectivity
- Verify browser automation setup
- Monitor system resources
- Check for rate limiting

### Performance Tips
- Use `force=true` sparingly to avoid rate limits
- Monitor metrics endpoint for performance insights
- Scale horizontally for high-traffic scenarios
- Use Docker for consistent deployment

### Debug Mode
```bash
# Enable debug logging
curl http://localhost:3012/api/token?debug=true

# Get detailed metrics
curl http://localhost:3012/api/metrics
```

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- [Bun](https://bun.sh) - Incredible JavaScript runtime
- [Elysia](https://elysiajs.com) - Fast and elegant web framework
- [Playwright](https://playwright.dev) - Reliable browser automation
- [Spotify](https://spotify.com) - Music streaming platform

## Support

- **Issues**: [GitHub Issues](https://github.com/ryanwtf88/spotokn/issues)
- **Documentation**: [Wiki](https://github.com/ryanwtf88/spotokn/wiki)
- **Discussions**: [GitHub Discussions](https://github.com/ryanwtf88/spotokn/discussions)

---

**Made with ❤️ by [RY4N](https://github.com/ryanwtf88)**

*High-performance Spotify token service for the modern web*
