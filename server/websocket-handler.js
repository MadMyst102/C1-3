const WebSocket = require('ws');
const syncManager = require('./sync-manager');
const clientManager = require('./client-manager');

function setupWebSocket(server) {
  const wss = new WebSocket.Server({ server });
  
  wss.on('connection', (ws, req) => {
    const clientId = Date.now().toString();
    const clientIp = req.socket.remoteAddress;

    // Register new client
    clientManager.addClient(clientId, clientIp);
    
    console.log(`Client connected: ${clientId} from ${clientIp}`);

    // Send initial data
    ws.send(JSON.stringify({
      type: 'INIT_DATA',
      ...syncManager.getFullSnapshot()
    }));

    // Broadcast client connection to others
    broadcastClientUpdate(wss, clientId, 'connected');

    ws.on('message', async (message) => {
      try {
        const data = JSON.parse(message);
        
        // Handle sync requests
        if (data.type === 'SYNC_REQUEST') {
          const response = await syncManager.handleDataSync(clientId, data);
          if (response) {
            ws.send(JSON.stringify(response));
            
            // If the sync was successful and resulted in changes, broadcast to other clients
            if (response.type === 'SYNC_SUCCESS') {
              broadcastToOthers(wss, ws, response);
            }
          }
        }
        
        // Handle version verification
        else if (data.type === 'VERIFY_SYNC') {
          const changes = syncManager.getChangesSinceLastSync(clientId);
          if (changes.length > 0) {
            ws.send(JSON.stringify({
              type: 'PENDING_CHANGES',
              changes,
              currentVersion: syncManager.getCurrentVersion()
            }));
          }
        }

      } catch (error) {
        console.error('Error processing message:', error);
        ws.send(JSON.stringify({
          type: 'ERROR',
          error: 'Failed to process message',
          details: error.message
        }));
      }
    });

    ws.on('close', () => {
      console.log(`Client disconnected: ${clientId}`);
      clientManager.removeClient(clientId);
      broadcastClientUpdate(wss, clientId, 'disconnected');
      
      // Release any locks held by this client
      syncManager.cleanup();
    });

    // Handle errors
    ws.on('error', (error) => {
      console.error(`WebSocket error for client ${clientId}:`, error);
      clientManager.removeClient(clientId);
    });
  });

  return {
    broadcast: (data) => {
      wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify(data));
        }
      });
    }
  };
}

function broadcastToOthers(wss, excludeWs, data) {
  wss.clients.forEach(client => {
    if (client !== excludeWs && client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(data));
    }
  });
}

function broadcastClientUpdate(wss, clientId, status) {
  const clients = clientManager.getClients();
  const message = {
    type: status === 'connected' ? 'CLIENT_CONNECTED' : 'CLIENT_DISCONNECTED',
    clientId,
    clients
  };

  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(message));
    }
  });
}

module.exports = setupWebSocket;
