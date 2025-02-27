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
  private pendingOperations: Map<string, { resolve: Function, reject: Function, timeout: NodeJS.Timeout }> = new Map();
  private operationTimeout = 5000; // Reduced to 5 seconds
  private isReconnecting = false;

  constructor(private url: string = `ws://${window.location.hostname}:3000`) {
    this.connect();
  }

  private async connect() {
    if (this.isReconnecting) return;
    
    try {
      this.isReconnecting = true;
      this.ws = new WebSocket(this.url);
      
      this.ws.onopen = () => {
        console.log('WebSocket connected');
        this.isReconnecting = false;
        this.reconnectAttempts = 0;
        this.reconnectDelay = 1000;
        this.connectionHandlers.forEach(handler => handler());
        this.startSyncVerification();
      };

      this.ws.onclose = () => {
        console.log('WebSocket disconnected');
        this.disconnectionHandlers.forEach(handler => handler());
        this.clearPendingOperations('WebSocket disconnected');
        this.stopSyncVerification();
        this.attemptReconnect();
      };

      this.ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        this.clearPendingOperations('WebSocket error occurred');
      };

      this.ws.onmessage = this.handleMessage.bind(this);
    } catch (error) {
      console.error('Error creating WebSocket connection:', error);
      this.isReconnecting = false;
      this.attemptReconnect();
    }
  }

  private handleMessage(event: MessageEvent) {
    try {
      const data = JSON.parse(event.data);
      
      switch (data.type) {
        case 'INIT_DATA':
          this.currentVersion = data.version;
          this.messageHandlers.forEach(handler => handler(data));
          break;

        case 'SYNC_SUCCESS':
          this.currentVersion = data.payload.version;
          this.resolvePendingOperation(data.payload.type, data);
          this.messageHandlers.forEach(handler => handler(data));
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
          this.messageHandlers.forEach(handler => handler(data));
          break;

        default:
          this.messageHandlers.forEach(handler => handler(data));
      }
    } catch (error) {
      console.error('Error parsing WebSocket message:', error);
    }
  }

  private clearPendingOperations(reason: string) {
    this.pendingOperations.forEach(({ reject, timeout }) => {
      clearTimeout(timeout);
      reject(new Error(reason));
    });
    this.pendingOperations.clear();
  }

  private async handleConflict(payload: any) {
    console.warn('Sync conflict detected:', payload);
    this.messageHandlers.forEach(handler => handler({
      type: 'SYNC_CONFLICT',
      payload
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
    if (this.reconnectAttempts >= this.maxReconnectAttempts || this.isReconnecting) {
      console.error('Max reconnection attempts reached or already reconnecting');
      return;
    }

    console.log(`Attempting to reconnect in ${this.reconnectDelay / 1000} seconds...`);
    
    setTimeout(() => {
      this.reconnectAttempts++;
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, 30000); // Cap at 30 seconds
      this.connect();
    }, this.reconnectDelay);
  }

  private createOperationPromise(type: string): Promise<any> {
    return new Promise((resolve, reject) => {
      const operationId = `${type}_${Date.now()}`;
      const timeout = setTimeout(() => {
        if (this.pendingOperations.has(operationId)) {
          this.pendingOperations.delete(operationId);
          reject(new Error(`Operation ${type} timed out`));
        }
      }, this.operationTimeout);

      this.pendingOperations.set(operationId, { resolve, reject, timeout });
    });
  }

  private resolvePendingOperation(type: string, data: any) {
    const operationId = Array.from(this.pendingOperations.keys())
      .find(key => key.startsWith(type));
    
    if (operationId) {
      const { resolve, timeout } = this.pendingOperations.get(operationId)!;
      clearTimeout(timeout);
      this.pendingOperations.delete(operationId);
      resolve(data);
    }
  }

  private rejectPendingOperation(error: string, data: any) {
    this.pendingOperations.forEach(({ reject, timeout }, key) => {
      clearTimeout(timeout);
      this.pendingOperations.delete(key);
      reject({ error, details: data });
    });
  }

  public async send(data: any): Promise<any> {
    if (!this.isConnected()) {
      await this.waitForConnection();
    }

    try {
      if (data.type === 'SYNC_REQUEST') {
        data.clientVersion = this.currentVersion;
      }
      
      const promise = this.createOperationPromise(data.type);
      this.ws!.send(JSON.stringify(data));
      return promise;
    } catch (error) {
      console.error('Error sending WebSocket message:', error);
      throw error;
    }
  }

  private async waitForConnection(timeout = 5000): Promise<void> {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
      if (this.isConnected()) {
        return;
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    throw new Error('Failed to establish WebSocket connection');
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
    this.stopSyncVerification();
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

  private stopSyncVerification() {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
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
    this.stopSyncVerification();
    this.clearPendingOperations('WebSocket service disconnected');
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}

// Create a singleton instance
const wsService = new WebSocketService();
export default wsService;
