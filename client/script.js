async function updateStatus() {
    try {
        const response = await fetch('/api/status');
        const data = await response.json();
        
        // Handle uptime safely
        const uptime = data.uptime || 0;
        document.getElementById('uptime').textContent = Math.round(uptime / 1000) + 's';
        
        // Handle memory usage safely
        const memoryUsage = data.memoryUsage || {};
        const rss = memoryUsage.rss || 0;
        const heapUsed = memoryUsage.heapUsed || 0;
        
        document.getElementById('memory').textContent = Math.round(rss / 1024 / 1024) + 'MB';
        document.getElementById('heap').textContent = Math.round(heapUsed / 1024 / 1024) + 'MB';
        document.getElementById('browser').textContent = data.browserConnected ? 'Connected' : 'Disconnected';
        
        // Update Bun version if available
        if (data.version) {
            document.getElementById('bun-version').textContent = data.version;
        }
    } catch (error) {
        console.error('Failed to update status:', error);
        // Set fallback values
        document.getElementById('uptime').textContent = 'Error';
        document.getElementById('memory').textContent = 'Error';
        document.getElementById('heap').textContent = 'Error';
        document.getElementById('browser').textContent = 'Error';
    }
}

// Update status every 5 seconds
updateStatus();
setInterval(updateStatus, 5000);