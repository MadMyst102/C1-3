const WebSocket = require('ws');
const { loadData, saveData } = require('./data');

// Store connected clients
const clients = new Set();

// Broadcast to all clients
function broadcast(data) {
  clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(data));
    }
  });
}

// Load initial data
let { cashiers, reports } = loadData();

function setupWebSocket(server) {
  const wss = new WebSocket.Server({ server });

  wss.on('connection', (ws) => {
    clients.add(ws);
    console.log('Client connected');

    // Send current data to new client
    ws.send(JSON.stringify({
      type: 'INIT_DATA',
      cashiers,
      reports
    }));

    ws.on('message', (message) => {
      try {
        const data = JSON.parse(message);
        
        // Update local data
        if (data.type === 'CASHIERS_UPDATE') {
          cashiers = data.cashiers;
          saveData({ cashiers });
        } else if (data.type === 'REPORTS_UPDATE') {
          reports = data.reports;
          saveData({ reports });
        }

        // Broadcast to all clients
        broadcast(data);
      } catch (error) {
        console.error('Error processing message:', error);
      }
    });

    ws.on('close', () => {
      clients.delete(ws);
      console.log('Client disconnected');
    });
  });

  return {
    getCashiers: () => cashiers,
    getReports: () => reports,
    updateData: (newData) => {
      if (newData.cashiers) cashiers = newData.cashiers;
      if (newData.reports) reports = newData.reports;
      saveData(newData);
      broadcast({
        type: 'INIT_DATA',
        cashiers,
        reports
      });
    }
  };
}

module.exports = setupWebSocket;
