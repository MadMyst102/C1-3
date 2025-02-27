const WebSocket = require('ws');
const clientManager = require('./client-manager');
const syncManager = require('./sync-manager');
const db = require('./db/database');

function setupWebSocket(server) {
  const wss = new WebSocket.Server({ server });

  // Start cleanup processes
  clientManager.startCleanup();
  syncManager.startCleanup();

  wss.on('connection', (ws, req) => {
    const ip = req.socket.remoteAddress;
    const client = clientManager.addClient(ws, ip);
    console.log(`Client connected from ${ip} with ID ${client.id}`);

    // Send initial data to the new client
    ws.send(JSON.stringify({
      type: 'INIT_DATA',
      ...syncManager.getFullSnapshot()
    }));

    // Send any pending changes since last sync
    const pendingChanges = syncManager.getChangesSinceLastSync(client.id);
    if (pendingChanges.length > 0) {
      ws.send(JSON.stringify({
        type: 'PENDING_CHANGES',
        changes: pendingChanges
      }));
    }

    // Broadcast client list to all connected clients
    clientManager.broadcast({
      type: 'CLIENTS_UPDATE',
      clients: clientManager.getClients()
    });

    ws.on('message', (message) => {
      try {
        const data = JSON.parse(message);

        switch (data.type) {
          case 'HEARTBEAT':
            clientManager.updateClientLastSeen(client.id);
            break;

          case 'GET_CLIENTS':
            ws.send(JSON.stringify({
              type: 'CLIENTS_UPDATE',
              clients: clientManager.getClients()
            }));
            break;

          case 'GET_LOCAL_IP':
            ws.send(JSON.stringify({
              type: 'LOCAL_IP',
              ip: ip
            }));
            break;

          case 'SYNC_REQUEST':
            const syncResponse = syncManager.handleDataSync(client.id, data);
            if (syncResponse) {
              if (syncResponse.type === 'SYNC_SUCCESS') {
                // Broadcast changes to all clients except sender
                clientManager.broadcast(syncResponse.payload, client.id);
              }
              // Send response to the requesting client
              ws.send(JSON.stringify(syncResponse));
            }
            break;

          case 'VERIFY_SYNC':
            const clientVersion = data.version;
            const currentVersion = syncManager.getCurrentVersion();
            
            if (clientVersion < currentVersion) {
              // Client is out of sync, send full data
              ws.send(JSON.stringify({
                type: 'FULL_SYNC',
                ...syncManager.getFullSnapshot()
              }));
            }
            break;

          default:
            console.warn('Unknown message type:', data.type);
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
      console.log(`Client ${client.id} disconnected`);
      clientManager.removeClient(client.id);
      
      // Broadcast updated client list
      clientManager.broadcast({
        type: 'CLIENTS_UPDATE',
        clients: clientManager.getClients()
      });
    });

    ws.on('error', (error) => {
      console.error(`WebSocket error for client ${client.id}:`, error);
      clientManager.removeClient(client.id);
    });
  });

  // Periodic status broadcast
  setInterval(() => {
    if (wss.clients.size > 0) {
      clientManager.broadcast({
        type: 'CLIENTS_UPDATE',
        clients: clientManager.getClients()
      });
    }
  }, 10000); // Every 10 seconds

  return {
    broadcast: (message) => clientManager.broadcast(message),
    getClients: () => clientManager.getClients(),
    getActiveClients: () => clientManager.getActiveClients()
  };
}

module.exports = setupWebSocket;
