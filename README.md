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
# Build and run with Docker Compose
docker-compose up --build

# Or build and run manually
docker build -t spotokn .
docker run -p 3012:3012 --env-file=.env spotokn
```

### Environment Variables
```bash
NODE_ENV=production
PORT=3012
HEADLESS=true
PROACTIVE_REFRESH_BUFFER=300000  # 5 minutes
CHECK_INTERVAL=60000             # 1 minute
MAX_RETRIES=3
RETRY_DELAY=2000
CACHE_TIMEOUT=3600000           # 1 hour
BROWSER_TIMEOUT=15000
BROWSER_RETRY_ATTEMPTS=3
BROWSER_RETRY_DELAY=2000
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
| `/api/lavasrc/token` | GET | Get Spotify token (anonymous or authenticated) |
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
curl http://localhost:3012/api/lavasrc/token
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
```
GET /api/lavasrc/token
```
### Successful Token Response
```json
{
  "access_token": "BQC...",
  "token_type": "Bearer",
  "expires_in": 3600,
  "scope": "user-read-private user-read-email",
  "client_id": "spotify_client_id",
  "is_anonymous": false,
  "cached": false,
  "source": "fresh",
  "timestamp": 1703123456789,
  "request_id": "req_1234567890_abc123"
}
```

### Statistics Endpoint
```
GET /api/token-tracker
```
Returns detailed token tracker statistics:
```json
{
  "totalTokens": 2,
  "validTokens": 2,
  "invalidTokens": 0,
  "activeTimers": 1,
  "cacheSize": 2,
  "maxCacheSize": 100,
  "tokens": [...]
}
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
