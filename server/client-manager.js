class ClientManager {
  constructor() {
    this.clients = new Map();
  }

  addClient(ws, ip) {
    const clientId = this.generateClientId();
    const client = {
      id: clientId,
      ws,
      ip,
      lastSeen: new Date(),
      status: 'active'
    };
    this.clients.set(clientId, client);
    return client;
  }

  removeClient(clientId) {
    const client = this.clients.get(clientId);
    if (client) {
      client.status = 'inactive';
      client.lastSeen = new Date();
      // Keep the client in the list but marked as inactive
      this.clients.set(clientId, client);
    }
  }

  updateClientLastSeen(clientId) {
    const client = this.clients.get(clientId);
    if (client) {
      client.lastSeen = new Date();
      client.status = 'active';
      this.clients.set(clientId, client);
    }
  }

  getClients() {
    return Array.from(this.clients.values()).map(client => ({
      id: client.id,
      ip: client.ip,
      lastSeen: client.lastSeen,
      status: client.status
    }));
  }

  getActiveClients() {
    return this.getClients().filter(client => client.status === 'active');
  }

  broadcast(message, excludeClientId = null) {
    this.clients.forEach((client, clientId) => {
      if (clientId !== excludeClientId && client.status === 'active' && client.ws.readyState === 1) {
        try {
          client.ws.send(JSON.stringify(message));
        } catch (error) {
          console.error(`Error broadcasting to client ${clientId}:`, error);
          this.removeClient(clientId);
        }
      }
    });
  }

  generateClientId() {
    return `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // Clean up inactive clients older than 5 minutes
  cleanup() {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    this.clients.forEach((client, clientId) => {
      if (client.status === 'inactive' && client.lastSeen < fiveMinutesAgo) {
        this.clients.delete(clientId);
      }
    });
  }

  // Start periodic cleanup
  startCleanup() {
    setInterval(() => this.cleanup(), 60 * 1000); // Run cleanup every minute
  }
}

module.exports = new ClientManager();
