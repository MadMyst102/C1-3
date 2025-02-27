import React, { useState, useEffect } from 'react';
import { Network, Users } from 'lucide-react';
import wsService from '../services/websocket-service';

interface NetworkClient {
  id: string;
  ip: string;
  lastSeen: Date;
  status: 'active' | 'inactive';
}

export const NetworkStatus: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [clients, setClients] = useState<NetworkClient[]>([]);
  const [localIp, setLocalIp] = useState<string>('');

  useEffect(() => {
    // Subscribe to client updates from WebSocket
    const unsubscribe = wsService.onMessage((data) => {
      if (data.type === 'CLIENTS_UPDATE') {
        setClients(data.clients.map((client: any) => ({
          ...client,
          lastSeen: new Date(client.lastSeen)
        })));
      } else if (data.type === 'LOCAL_IP') {
        setLocalIp(data.ip);
      }
    });

    // Request initial client list
    if (wsService.isConnected()) {
      wsService.send({ type: 'GET_CLIENTS' });
      wsService.send({ type: 'GET_LOCAL_IP' });
    }

    return () => unsubscribe();
  }, []);

  // Remove clients that haven't been seen in 30 seconds
  useEffect(() => {
    const cleanup = setInterval(() => {
      const now = new Date();
      setClients(prev => prev.filter(client => {
        const timeDiff = now.getTime() - client.lastSeen.getTime();
        return timeDiff < 30000; // 30 seconds
      }));
    }, 5000); // Check every 5 seconds

    return () => clearInterval(cleanup);
  }, []);

  const activeClients = clients.filter(c => c.status === 'active');

  return (
    <div className="fixed top-4 left-4 z-50">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="bg-white rounded-lg shadow-md p-3 flex items-center gap-2 hover:bg-gray-50"
      >
        <Network className="text-indigo-600" size={20} />
        <span className="font-medium text-gray-700">
          {activeClients.length} متصل
        </span>
      </button>

      {isOpen && (
        <div className="absolute left-0 mt-2 w-80 bg-white rounded-lg shadow-lg p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-gray-700">المتصلين بالشبكة</h3>
            <button
              onClick={() => setIsOpen(false)}
              className="text-gray-400 hover:text-gray-600"
            >
              ✕
            </button>
          </div>

          <div className="mb-4">
            <div className="text-sm text-gray-600">عنوان IP المحلي:</div>
            <div className="font-mono text-sm bg-gray-50 p-2 rounded">
              {localIp || 'جاري التحميل...'}
            </div>
          </div>

          <div className="space-y-2 max-h-60 overflow-y-auto">
            {clients.map(client => (
              <div
                key={client.id}
                className={`flex items-center justify-between p-2 rounded ${
                  client.status === 'active' ? 'bg-green-50' : 'bg-gray-50'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Users size={16} className={
                    client.status === 'active' ? 'text-green-600' : 'text-gray-400'
                  } />
                  <span className="font-mono text-sm">{client.ip}</span>
                </div>
                <span className={`text-sm ${
                  client.status === 'active' ? 'text-green-600' : 'text-gray-400'
                }`}>
                  {client.status === 'active' ? 'متصل' : 'غير متصل'}
                </span>
              </div>
            ))}

            {clients.length === 0 && (
              <div className="text-center text-gray-500 py-4">
                لا يوجد متصلين حالياً
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
