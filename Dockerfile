# Use an official Bun runtime as a parent image
FROM oven/bun:latest

# Set the working directory in the container
WORKDIR /app

# Set Playwright environment variables
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

# Copy package.json first for better caching
COPY package.json ./

# Install dependencies
RUN bun install

# Install Playwright browsers
RUN bunx playwright install --with-deps chromium

# Copy the rest of the application code
COPY . .

# Expose the port the app runs on
EXPOSE 3012

# Command to run the application
CMD ["bun", "run", "src/app.ts"]
