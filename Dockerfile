# Use an official Bun runtime as a parent image
FROM oven/bun:latest

# Set the working directory in the container
WORKDIR /app

# Create a non-root user for security
RUN groupadd -r spotokn && useradd -r -g spotokn spotokn

# Set Playwright environment variables
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
ENV NODE_ENV=production
ENV PORT=3012
ENV HEADLESS=true

# Copy package.json first for better caching
COPY package.json ./

# Install dependencies
RUN bun install --frozen-lockfile

# Install Playwright browsers with system dependencies
RUN bunx playwright install --with-deps chromium

# Copy the rest of the application code
COPY . .

# Change ownership to non-root user
RUN chown -R spotokn:spotokn /app

# Switch to non-root user
USER spotokn

# Expose the port the app runs on
EXPOSE 3012

# Add health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3012/health || exit 1

# Command to run the application
CMD ["bun", "run", "start"]
