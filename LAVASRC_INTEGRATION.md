# LavaSrc Integration Guide

This document describes the complete LavaSrc integration for the Spotify Token Service, designed to work seamlessly with LavaSrc's SpotifyTokenTracker requirements.

## 🎯 LavaSrc-Compatible Endpoints

### Primary Token Endpoint
```
GET /api/token
```
**Description**: Main token endpoint with LavaSrc-compatible response format
**Parameters**:
- `refresh=true` - Force token refresh
- `debug=true` - Get debug information
- `metrics=true` - Get detailed metrics

**Response Format** (LavaSrc Compatible):
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

### Dedicated LavaSrc Endpoint
```
GET /api/lavasrc/token
```
**Description**: Dedicated endpoint optimized for LavaSrc integration
**Parameters**:
- `refresh=true` - Force token refresh

**Response Format**: Same as above, optimized for LavaSrc

## 🔄 Token Refresh Logic

### Automatic Refresh
- Tokens are automatically refreshed 5 minutes before expiration
- Proactive refresh system runs every minute
- Fallback to cached tokens on errors

### Manual Refresh
- Use `?refresh=true` parameter to force refresh
- Clears cache and fetches fresh token
- Returns immediately with new token

### Token Caching
- Anonymous tokens: Cached and proactively refreshed
- Authenticated tokens: Fetched fresh on each request
- Cache duration: Token expiry - 1 minute buffer

## 🏗️ Architecture Components

### 1. LavaSrcTracker (`src/services/lavasrc-tracker.ts`)
- **Purpose**: LavaSrc-compatible token lifecycle management
- **Features**:
  - Token storage and validation
  - Automatic refresh scheduling
  - Memory-efficient caching
  - Statistics and monitoring

### 2. Enhanced Token Controller (`src/controllers/token.ts`)
- **Purpose**: Handle LavaSrc-specific token requests
- **Features**:
  - LavaSrc response format
  - Token caching layer
  - Refresh handling
  - Error management

### 3. Spotify Service Integration
- **Purpose**: Provide LavaSrc-compatible token methods
- **Features**:
  - `getLavaSrcToken()` method
  - Token format conversion
  - Fallback mechanisms

## 📊 Token Response Fields

| Field | Type | Description |
|-------|------|-------------|
| `access_token` | string | Spotify access token |
| `token_type` | string | Always "Bearer" |
| `expires_in` | number | Seconds until expiration |
| `scope` | string | Token permissions |
| `client_id` | string | Spotify client ID |
| `is_anonymous` | boolean | Whether token is anonymous |
| `cached` | boolean | Whether token was cached |
| `source` | string | Token source (fresh/cached) |
| `timestamp` | number | Response timestamp |
| `request_id` | string | Unique request identifier |

## 🔧 LavaSrc Integration Examples

### Basic Token Request
```bash
# Anonymous token
curl http://localhost:3012/api/lavasrc/token

# Authenticated token
curl -H "Cookie: sp_dc=your_cookie_value" http://localhost:3012/api/lavasrc/token
```

### Token Refresh
```bash
# Refresh current token
curl http://localhost:3012/api/lavasrc/token?refresh=true

# Refresh with cookies
curl -H "Cookie: sp_dc=your_cookie_value" http://localhost:3012/api/lavasrc/token?refresh=true
```

### Error Handling
```json
{
  "error": "Token service temporarily unavailable",
  "error_description": "Unable to fetch Spotify token",
  "request_id": "req_1234567890_abc123"
}
```

## 🚀 Performance Optimizations

### Token Caching
- **Anonymous tokens**: Cached with proactive refresh
- **Authenticated tokens**: Fresh fetch with cookie validation
- **Cache size limit**: 100 tokens maximum
- **Cleanup**: Automatic removal of expired tokens

### Request Optimization
- **Request interception**: Blocks unnecessary resources
- **Connection reuse**: Browser context reuse
- **Timeout handling**: 15-second timeout with retry logic
- **Memory management**: Automatic cleanup of resources

## 📈 Monitoring & Debugging

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

### Metrics Endpoint
```
GET /api/metrics
```
Returns comprehensive service metrics including LavaSrc tracker stats.

### Debug Endpoint
```
GET /api/token?debug=true
```
Returns detailed service status and token information.

## 🔒 Security Features

### Token Security
- **Non-root execution**: Docker container runs as non-root user
- **Token validation**: Comprehensive token validation
- **Error sanitization**: Safe error responses
- **Request validation**: Input validation and sanitization

### Rate Limiting
- **Built-in protection**: Request rate limiting
- **Error handling**: Graceful degradation
- **Fallback mechanisms**: Cached token fallback

## 🐳 Docker Deployment

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
```

### Docker Compose
```yaml
version: '3.8'
services:
  spotokn:
    build: .
    ports:
      - "3012:3012"
    environment:
      - NODE_ENV=production
      - PORT=3012
      - HEADLESS=true
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3012/health"]
      interval: 30s
      timeout: 10s
      retries: 3
```

## 🧪 Testing LavaSrc Integration

### Test Token Fetch
```bash
# Test anonymous token
curl -v http://localhost:3012/api/lavasrc/token

# Test authenticated token
curl -v -H "Cookie: sp_dc=test_cookie" http://localhost:3012/api/lavasrc/token

# Test token refresh
curl -v http://localhost:3012/api/lavasrc/token?refresh=true
```

### Test Error Handling
```bash
# Test with invalid cookies
curl -v -H "Cookie: sp_dc=invalid" http://localhost:3012/api/lavasrc/token

# Test service unavailable
curl -v http://localhost:3012/api/lavasrc/token
```

## 📋 LavaSrc Configuration

### Required LavaSrc Settings
```yaml
spotify:
  token-service-url: "http://localhost:3012/api/lavasrc/token"
  refresh-url: "http://localhost:3012/api/lavasrc/token?refresh=true"
  timeout: 15000
  retry-attempts: 3
  retry-delay: 2000
```

### Optional Headers
```yaml
headers:
  User-Agent: "LavaSrc/1.0"
  Accept: "application/json"
```

## 🎉 Benefits for LavaSrc

1. **Seamless Integration**: Drop-in replacement for Spotify token management
2. **High Performance**: Optimized caching and refresh logic
3. **Reliability**: Automatic error recovery and fallback mechanisms
4. **Monitoring**: Comprehensive metrics and debugging tools
5. **Security**: Production-ready security features
6. **Scalability**: Efficient memory usage and resource management

## 🔄 Migration from Standard Token Service

1. **Update URLs**: Change from `/api/token` to `/api/lavasrc/token`
2. **Update Response Parsing**: Use new response format
3. **Add Refresh Logic**: Implement `?refresh=true` parameter
4. **Update Error Handling**: Handle new error response format
5. **Test Integration**: Verify all functionality works correctly

---

**Version**: 2.0.0  
**LavaSrc Compatibility**: Full  
**Last Updated**: 2024