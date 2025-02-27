const WebSocket = require('ws');
const { loadData, saveData } = require('./data');

function setupWebSocket(server) {
  const wss = new WebSocket.Server({ server });
  const clients = new Set();

  // Load initial data
  let { cashiers, reports } = loadData();

  // Broadcast to all clients
  function broadcast(data, excludeClient = null) {
    clients.forEach(client => {
      if (client !== excludeClient && client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify(data));
      }
    });
  }

  wss.on('connection', (ws) => {
    clients.add(ws);
    console.log('Client connected');

    // Send initial data to new client
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

        // Broadcast to all other clients
        broadcast(data, ws);
      } catch (error) {
        console.error('Error processing message:', error);
      }
    });

    ws.on('close', () => {
      clients.delete(ws);
      console.log('Client disconnected');
    });
  });

  return wss;
}

module.exports = setupWebSocket;
