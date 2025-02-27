const express = require('express');
const http = require('http');
const cors = require('cors');
const path = require('path');
const setupWebSocket = require('./websocket-handler');
const db = require('./db/database');

const app = express();
const server = http.createServer(app);

// Enable CORS
app.use(cors());

// Setup WebSocket with database integration
const wsHandler = setupWebSocket(server);

// Serve static files in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../dist')));
}

// Backup endpoint
app.get('/backup', (req, res) => {
  try {
    const cashiers = db.getCashiers();
    const reports = db.getAllReports();
    const backup = {
      cashiers,
      reports,
      timestamp: new Date().toISOString()
    };
    res.json(backup);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Restore endpoint
app.post('/restore', express.json(), (req, res) => {
  try {
    const { cashiers, reports } = req.body;
    
    // Update database
    cashiers.forEach(cashier => {
      db.updateCashier(cashier);
    });

    reports.forEach(report => {
      db.saveReport(report.reports);
    });

    // Broadcast update to all clients
    wsHandler.broadcast({
      type: 'INIT_DATA',
      cashiers: db.getCashiers(),
      reports: db.getAllReports()
    });

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  server.close(() => {
    console.log('HTTP server closed');
    db.close();
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT} with SQLite database`);
});
