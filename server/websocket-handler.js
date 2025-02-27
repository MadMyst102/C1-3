const WebSocket = require('ws');
const db = require('./db/database');

function setupWebSocket(server) {
  const wss = new WebSocket.Server({ server });
  const clients = new Set();

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
    const cashiers = db.getCashiers();
    const reports = db.getAllReports();
    
    ws.send(JSON.stringify({
      type: 'INIT_DATA',
      cashiers,
      reports
    }));

    ws.on('message', (message) => {
      try {
        const data = JSON.parse(message);
        
        // Update database based on message type
        if (data.type === 'CASHIERS_UPDATE' && data.cashiers) {
          // Update each cashier in the database
          data.cashiers.forEach(cashier => {
            db.updateCashier(cashier);
          });

          // Broadcast the update to all other clients
          broadcast(data, ws);
        } 
        else if (data.type === 'REPORTS_UPDATE' && data.reports) {
          // Save new reports to database
          data.reports.forEach(report => {
            db.saveReport(report.reports);
          });

          // Broadcast the update to all other clients
          broadcast(data, ws);
        }
      } catch (error) {
        console.error('Error processing message:', error);
      }
    });

    ws.on('close', () => {
      clients.delete(ws);
      console.log('Client disconnected');
    });

    ws.on('error', (error) => {
      console.error('WebSocket error:', error);
      clients.delete(ws);
    });
  });

  return {
    wss,
    broadcast: (data) => broadcast(data),
    getClients: () => clients
  };
}

module.exports = setupWebSocket;
