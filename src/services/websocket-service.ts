type MessageHandler = (data: any) => void;
type ConnectionHandler = () => void;

interface Client {
  id: string;
  ip: string;
  lastSeen: Date;
  status: 'active' | 'inactive';
}

class WebSocketService {
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private messageHandlers: Set<MessageHandler> = new Set();
  private connectionHandlers: Set<ConnectionHandler> = new Set();
  private disconnectionHandlers: Set<ConnectionHandler> = new Set();
  private clients: Map<string, Client> = new Map();
  private clientUpdateInterval: NodeJS.Timeout | null = null;
  private currentVersion: number = 0;
  private syncInterval: NodeJS.Timeout | null = null;

  constructor(private url: string = `ws://${window.location.hostname}:3000`) {
    this.connect();
    this.startSyncVerification();
  }

  private startSyncVerification() {
    // Verify sync status every 30 seconds
    this.syncInterval = setInterval(() => {
      if (this.isConnected()) {
        this.send({
          type: 'VERIFY_SYNC',
          version: this.currentVersion
        });
      }
    }, 30000);
  }

  private connect() {
    try {
      this.ws = new WebSocket(this.url);
      
      this.ws.onopen = () => {
        console.log('WebSocket connected');
        this.reconnectAttempts = 0;
        this.reconnectDelay = 1000;
        this.connectionHandlers.forEach(handler => handler());
      };

      this.ws.onclose = () => {
        console.log('WebSocket disconnected');
        this.disconnectionHandlers.forEach(handler => handler());
        this.stopClientTracking();
        this.attemptReconnect();
      };

      this.ws.onerror = (error) => {
        console.error('WebSocket error:', error);
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          
          // Handle sync-related messages
          if (data.type === 'INIT_DATA') {
            this.currentVersion = data.version;
          } else if (data.type === 'SYNC_SUCCESS') {
            this.currentVersion = data.payload.version;
          } else if (data.type === 'FULL_SYNC') {
            this.currentVersion = data.version;
          } else if (data.type === 'PENDING_CHANGES') {
            this.applyPendingChanges(data.changes);
          }

          // Handle client updates
          if (data.type === 'CLIENT_CONNECTED') {
            this.updateClient(data.client);
          } else if (data.type === 'CLIENT_DISCONNECTED') {
            this.removeClient(data.clientId);
          } else if (data.type === 'CLIENTS_LIST') {
            this.updateClientsList(data.clients);
          }
          
          this.messageHandlers.forEach(handler => handler(data));
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
        }
      };
    } catch (error) {
      console.error('Error creating WebSocket connection:', error);
      this.attemptReconnect();
    }
  }

  private applyPendingChanges(changes: any[]) {
    changes.forEach(change => {
      // Notify handlers of each change
      this.messageHandlers.forEach(handler => handler({
        type: change.type === 'CASHIER_UPDATE' ? 'CASHIERS_UPDATE' : 'REPORTS_UPDATE',
        payload: change.data
      }));
    });
  }

  private attemptReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('Max reconnection attempts reached');
      return;
    }

    console.log(`Attempting to reconnect in ${this.reconnectDelay / 1000} seconds...`);
    
    setTimeout(() => {
      this.reconnectAttempts++;
      this.reconnectDelay *= 2; // Exponential backoff
      this.connect();
    }, this.reconnectDelay);
  }

  public send(data: any) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket is not connected');
    }

    try {
      // Add version to sync-related messages
      if (data.type === 'SYNC_REQUEST') {
        data.clientVersion = this.currentVersion;
      }
      
      this.ws.send(JSON.stringify(data));
    } catch (error) {
      console.error('Error sending WebSocket message:', error);
      throw error;
    }
  }

  public onMessage(handler: MessageHandler) {
    this.messageHandlers.add(handler);
    return () => this.messageHandlers.delete(handler);
  }

  public onConnect(handler: ConnectionHandler) {
    this.connectionHandlers.add(handler);
    return () => this.connectionHandlers.delete(handler);
  }

  public onDisconnect(handler: ConnectionHandler) {
    this.disconnectionHandlers.add(handler);
    return () => this.disconnectionHandlers.delete(handler);
  }

  public isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  public getConnectionStatus(): 'connected' | 'connecting' | 'disconnected' {
    if (!this.ws) return 'disconnected';
    
    switch (this.ws.readyState) {
      case WebSocket.CONNECTING:
        return 'connecting';
      case WebSocket.OPEN:
        return 'connected';
      default:
        return 'disconnected';
    }
  }

  public getCurrentVersion(): number {
    return this.currentVersion;
  }

  public getClients(): Client[] {
    return Array.from(this.clients.values());
  }

  private updateClient(client: Client) {
    this.clients.set(client.id, {
      ...client,
      lastSeen: new Date()
    });
  }

  private removeClient(clientId: string) {
    this.clients.delete(clientId);
  }

  private updateClientsList(clients: Client[]) {
    this.clients.clear();
    clients.forEach(client => {
      this.clients.set(client.id, {
        ...client,
        lastSeen: new Date(client.lastSeen)
      });
    });
  }

  private stopClientTracking() {
    if (this.clientUpdateInterval) {
      clearInterval(this.clientUpdateInterval);
      this.clientUpdateInterval = null;
    }
  }

  public disconnect() {
    this.stopClientTracking();
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}

// Create a singleton instance
const wsService = new WebSocketService();
export default wsService;
