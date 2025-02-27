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
  private currentVersion: number = 0;
  private syncInterval: NodeJS.Timeout | null = null;
  private pendingOperations: Map<string, { resolve: Function, reject: Function }> = new Map();
  private operationTimeout = 30000; // 30 seconds timeout for operations

  constructor(private url: string = `ws://${window.location.hostname}:3000`) {
    this.connect();
    this.startSyncVerification();
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
        this.attemptReconnect();
      };

      this.ws.onerror = (error) => {
        console.error('WebSocket error:', error);
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          
          switch (data.type) {
            case 'INIT_DATA':
              this.currentVersion = data.version;
              break;

            case 'SYNC_SUCCESS':
              this.currentVersion = data.payload.version;
              this.resolvePendingOperation(data.payload.type, data);
              break;

            case 'SYNC_ERROR':
              this.rejectPendingOperation(data.payload.error, data);
              break;

            case 'SYNC_CONFLICT':
              this.handleConflict(data.payload);
              break;

            case 'PENDING_CHANGES':
              this.applyPendingChanges(data.changes);
              this.currentVersion = data.currentVersion;
              break;

            case 'CLIENT_CONNECTED':
            case 'CLIENT_DISCONNECTED':
              this.updateClientsList(data.clients);
              break;
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

  private async handleConflict(payload: any) {
    const { currentData, conflictingChanges } = payload;
    console.warn('Sync conflict detected:', { currentData, conflictingChanges });
    
    // Notify handlers of conflict
    this.messageHandlers.forEach(handler => handler({
      type: 'SYNC_CONFLICT',
      payload: {
        currentData,
        conflictingChanges
      }
    }));
  }

  private applyPendingChanges(changes: any[]) {
    changes.forEach(change => {
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

  private createOperationPromise(type: string): Promise<any> {
    return new Promise((resolve, reject) => {
      const operationId = `${type}_${Date.now()}`;
      this.pendingOperations.set(operationId, { resolve, reject });

      // Set timeout
      setTimeout(() => {
        if (this.pendingOperations.has(operationId)) {
          this.pendingOperations.delete(operationId);
          reject(new Error('Operation timed out'));
        }
      }, this.operationTimeout);
    });
  }

  private resolvePendingOperation(type: string, data: any) {
    const operationId = Array.from(this.pendingOperations.keys())
      .find(key => key.startsWith(type));
    
    if (operationId) {
      const { resolve } = this.pendingOperations.get(operationId)!;
      this.pendingOperations.delete(operationId);
      resolve(data);
    }
  }

  private rejectPendingOperation(error: string, data: any) {
    this.pendingOperations.forEach(({ reject }, key) => {
      this.pendingOperations.delete(key);
      reject({ error, details: data });
    });
  }

  public async send(data: any): Promise<any> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket is not connected');
    }

    try {
      // Add version to sync-related messages
      if (data.type === 'SYNC_REQUEST') {
        data.clientVersion = this.currentVersion;
      }
      
      const promise = this.createOperationPromise(data.type);
      this.ws.send(JSON.stringify(data));
      return promise;
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

  private startSyncVerification() {
    // Verify sync status every 30 seconds
    this.syncInterval = setInterval(() => {
      if (this.isConnected()) {
        this.send({
          type: 'VERIFY_SYNC',
          version: this.currentVersion
        }).catch(error => {
          console.error('Error verifying sync status:', error);
        });
      }
    }, 30000);
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

  private updateClientsList(clients: Client[]) {
    this.clients.clear();
    clients.forEach(client => {
      this.clients.set(client.id, {
        ...client,
        lastSeen: new Date(client.lastSeen)
      });
    });
  }

  public disconnect() {
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
