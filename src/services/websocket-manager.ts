import debounce from 'lodash/debounce';
import type { Cashier, DailyReport } from '../types';

type MessageHandler = (data: any) => void;

interface InitialData {
  cashiers: Cashier[];
  reports: DailyReport[];
}

class WebSocketManager {
  private ws: WebSocket | null = null;
  private messageHandlers: Set<MessageHandler> = new Set();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectTimeout = 3000;
  private messageQueue: any[] = [];
  private isConnected = false;
  private initialData: InitialData | null = null;

  // Debounced send function
  private debouncedSend = debounce(() => {
    if (this.messageQueue.length > 0 && this.isConnected) {
      const lastMessage = this.messageQueue[this.messageQueue.length - 1];
      this.messageQueue = [];
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify(lastMessage));
      }
    }
  }, 300);

  constructor(private url: string) {
    this.connect();
  }

  private connect() {
    try {
      this.ws = new WebSocket(this.url);

      this.ws.onopen = () => {
        console.log('WebSocket connected');
        this.isConnected = true;
        this.reconnectAttempts = 0;
        // Send any queued messages
        this.debouncedSend();
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          
          // Handle initial data
          if (data.type === 'INIT_DATA') {
            this.initialData = {
              cashiers: data.cashiers,
              reports: data.reports
            };
          }
          
          this.messageHandlers.forEach(handler => handler(data));
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
        }
      };

      this.ws.onclose = () => {
        console.log('WebSocket disconnected');
        this.isConnected = false;
        this.attemptReconnect();
      };

      this.ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        this.isConnected = false;
      };
    } catch (error) {
      console.error('Error creating WebSocket:', error);
      this.isConnected = false;
      this.attemptReconnect();
    }
  }

  private attemptReconnect() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      console.log(`Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);
      setTimeout(() => this.connect(), this.reconnectTimeout);
    } else {
      console.error('Max reconnection attempts reached');
    }
  }

  public send(data: any) {
    // Add message to queue
    this.messageQueue.push(data);
    // Trigger debounced send
    this.debouncedSend();
  }

  public subscribe(handler: MessageHandler) {
    this.messageHandlers.add(handler);
    
    // If we have initial data and the handler is new, send it immediately
    if (this.initialData) {
      handler({
        type: 'INIT_DATA',
        ...this.initialData
      });
    }
    
    return () => this.messageHandlers.delete(handler);
  }

  public close() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
      this.isConnected = false;
    }
  }

  public getInitialData() {
    return this.initialData;
  }
}

// Create a singleton instance
const wsManager = new WebSocketManager('ws://localhost:3000');

export default wsManager;
