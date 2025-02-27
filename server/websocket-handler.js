const WebSocket = require('ws');
const syncManager = require('./sync-manager');
const clientManager = require('./client-manager');

function setupWebSocket(server) {
  const wss = new WebSocket.Server({ server });
  
  wss.on('connection', (ws, req) => {
    const clientId = Date.now().toString();
    const clientIp = req.socket.remoteAddress;

    // Set up ping-pong to detect stale connections
    ws.isAlive = true;
    ws.on('pong', () => {
      ws.isAlive = true;
    });

    // Register new client
    clientManager.addClient(clientId, clientIp);
    console.log(`Client connected: ${clientId} from ${clientIp}`);

    // Send initial data immediately
    sendToClient(ws, {
      type: 'INIT_DATA',
      ...syncManager.getFullSnapshot()
    });

    // Broadcast client connection to others
    broadcastClientUpdate(wss, clientId, 'connected');

    ws.on('message', async (message) => {
      try {
        const data = JSON.parse(message);
        let response = null;
        
        // Handle sync requests
        if (data.type === 'SYNC_REQUEST') {
          response = await syncManager.handleDataSync(clientId, data);
          if (response) {
            sendToClient(ws, response);
            
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
            sendToClient(ws, {
              type: 'PENDING_CHANGES',
              changes,
              currentVersion: syncManager.getCurrentVersion()
            });
          } else {
            // Send acknowledgment even if no changes
            sendToClient(ws, {
              type: 'SYNC_VERIFIED',
              version: syncManager.getCurrentVersion()
            });
          }
        }

      } catch (error) {
        console.error('Error processing message:', error);
        sendToClient(ws, {
          type: 'ERROR',
          error: 'Failed to process message',
          details: error.message
        });
      }
    });

    ws.on('close', () => {
      console.log(`Client disconnected: ${clientId}`);
      clientManager.removeClient(clientId);
      broadcastClientUpdate(wss, clientId, 'disconnected');
      
      // Release any locks held by this client
      syncManager.cleanup();
    });

    ws.on('error', (error) => {
      console.error(`WebSocket error for client ${clientId}:`, error);
      clientManager.removeClient(clientId);
      syncManager.cleanup();
    });
  });

  // Set up interval to check for stale connections
  const interval = setInterval(() => {
    wss.clients.forEach((ws) => {
      if (ws.isAlive === false) {
        ws.terminate();
        return;
      }
      
      ws.isAlive = false;
      ws.ping(() => {});
    });
  }, 30000);

  wss.on('close', () => {
    clearInterval(interval);
  });

  return {
    broadcast: (data) => {
      broadcastToAll(wss, data);
    }
  };
}

function sendToClient(ws, data) {
  if (ws.readyState === WebSocket.OPEN) {
    try {
      ws.send(JSON.stringify(data));
    } catch (error) {
      console.error('Error sending message to client:', error);
    }
  }
}

function broadcastToOthers(wss, excludeWs, data) {
  wss.clients.forEach(client => {
    if (client !== excludeWs && client.readyState === WebSocket.OPEN) {
      sendToClient(client, data);
    }
  });
}

function broadcastToAll(wss, data) {
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      sendToClient(client, data);
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

  broadcastToAll(wss, message);
}

module.exports = setupWebSocket;
