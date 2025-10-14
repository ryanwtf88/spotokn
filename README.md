# Spotokn

A high-performance Spotify token service with real-time monitoring, enhanced error handling, and LavaSrc-inspired token tracking logic.

## 🚀 Features

- **Dual Token Support**: Anonymous and authenticated token handling
- **Proactive Refresh**: Automatic token refresh before expiration
- **Token Tracking**: LavaSrc-inspired token lifecycle management
- **Real-time Monitoring**: Comprehensive metrics and status endpoints
- **Docker Ready**: Production-ready containerization
- **Error Recovery**: Automatic service recovery and fallback mechanisms
- **Browser Automation**: Playwright-based token fetching
- **Web Interface**: Beautiful real-time dashboard


## 📋 API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /api/token` | Get Spotify token (anonymous or authenticated) |
| `GET /api/token?debug=true` | Get debug information |
| `GET /api/token?metrics=true` | Get detailed metrics |
| `GET /api/token?force=true` | Force token refresh |
| `GET /api/status` | Get service status |
| `GET /api/metrics` | Get comprehensive metrics |
| `GET /api/token-tracker` | Get token tracker statistics |
| `GET /api/refresh` | Force refresh anonymous token |
| `GET /health` | Health check endpoint |
| `GET /` | Web interface dashboard |

## 🐳 Docker Deployment

### Quick Start
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

## 🚀 Usage Examples

### Anonymous Token
```bash
curl http://localhost:3012/api/token
```

### Authenticated Token
```bash
curl -H "Cookie: sp_dc=your_cookie_value" http://localhost:3012/api/token
```

### Force Refresh
```bash
curl http://localhost:3012/api/token?force=true
```

### Debug Information
```bash
curl http://localhost:3012/api/token?debug=true
```

### Metrics
```bash
curl http://localhost:3012/api/metrics
```

### Token Tracker Stats
```bash
curl http://localhost:3012/api/token-tracker
```

### Token Flow

```mermaid
graph TD
    A[Request] --> B{Has sp_dc Cookie?}
    B -->|Yes| C[Get Authenticated Token]
    B -->|No| D[Get Anonymous Token]
    C --> E[Fresh Token from Browser]
    D --> F{Token Cached & Valid?}
    F -->|Yes| G[Return Cached Token]
    F -->|No| H[Refresh Token]
    H --> I[Store in Token Tracker]
    I --> J[Return Token]
    E --> K[Store in Token Tracker]
    K --> J
    G --> J
```

## Monitoring & Debugging

### Web Dashboard
Access the real-time dashboard at `http://localhost:3012` for:
- Service status and health
- Memory usage and performance
- Token statistics
- Browser connection status
- Real-time metrics

### Logs
The service provides comprehensive logging:
- Request/response tracking
- Error details and stack traces
- Performance metrics
- Token lifecycle events

### Health Checks
- Docker health check: `curl -f http://localhost:3012/health`
- Service status: `curl http://localhost:3012/api/status`
- Detailed metrics: `curl http://localhost:3012/api/metrics`

## 🛠️ Development

### Prerequisites
- Bun >= 1.0.0
- Docker (for containerized deployment)
- Node.js 18+ (for development)

### Local Development
```bash
# Install dependencies
bun install

# Start development server
bun run dev

# Run tests
bun test

# Lint code
bun run lint

# Format code
bun run format
```

### Scripts
- `start`: Production server
- `dev`: Development server with watch mode
- `build`: Build for production
- `test`: Run tests
- `lint`: TypeScript linting
- `format`: Code formatting
- `docker:build`: Build Docker image
- `docker:run`: Run Docker container
- `docker:dev`: Docker Compose development
- `docker:prod`: Docker Compose production


## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

MIT License - see LICENSE file for details

## Acknowledgments

- Inspired by [LavaSrc](https://github.com/topi314/LavaSrc) token tracking logic
- Built with [Bun](https://bun.sh), [Elysia](https://elysiajs.com), and [Playwright](https://playwright.dev)
- Enhanced with comprehensive monitoring and error handling

---
