const WebSocket = require('ws');
const syncManager = require('./sync-manager');
const clientManager = require('./client-manager');

class WebSocketHandler {
  constructor(server) {
    this.wss = new WebSocket.Server({ server });
    this.setupWebSocket();
  }

  setupWebSocket() {
    this.wss.on('connection', (ws, req) => {
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
      this.broadcastClientUpdate(clientId, 'connected');

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
                this.broadcastToOthers(ws, response);
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
        this.broadcastClientUpdate(clientId, 'disconnected');
        
        // Release any locks held by this client
        syncManager.cleanup();
      });

      // Handle errors
      ws.on('error', (error) => {
        console.error(`WebSocket error for client ${clientId}:`, error);
        clientManager.removeClient(clientId);
      });
    });
  }

  broadcastToOthers(excludeWs, data) {
    this.wss.clients.forEach(client => {
      if (client !== excludeWs && client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify(data));
      }
    });
  }

  broadcastClientUpdate(clientId, status) {
    const clients = clientManager.getClients();
    const message = {
      type: status === 'connected' ? 'CLIENT_CONNECTED' : 'CLIENT_DISCONNECTED',
      clientId,
      clients
    };

    this.wss.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify(message));
      }
    });
  }

  broadcastToAll(data) {
    this.wss.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify(data));
      }
    });
  }
}

module.exports = WebSocketHandler;
