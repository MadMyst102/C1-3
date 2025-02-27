import React, { useEffect, useState } from 'react';
import { X, CheckCircle, AlertCircle, Info, AlertTriangle } from 'lucide-react';

export type NotificationType = 'success' | 'error' | 'info' | 'warning';

interface NotificationProps {
  type: NotificationType;
  message: string;
  duration?: number;
  onClose: () => void;
}

const icons = {
  success: <CheckCircle className="w-5 h-5 text-green-500" />,
  error: <AlertCircle className="w-5 h-5 text-red-500" />,
  info: <Info className="w-5 h-5 text-blue-500" />,
  warning: <AlertTriangle className="w-5 h-5 text-yellow-500" />
};

const backgrounds = {
  success: 'bg-green-50 border-green-200',
  error: 'bg-red-50 border-red-200',
  info: 'bg-blue-50 border-blue-200',
  warning: 'bg-yellow-50 border-yellow-200'
};

export const Notification: React.FC<NotificationProps> = ({
  type,
  message,
  duration = 5000,
  onClose
}) => {
  const [isVisible, setIsVisible] = useState(true);
  const [progress, setProgress] = useState(100);

  useEffect(() => {
    if (!duration) return;

    const startTime = Date.now();
    const endTime = startTime + duration;

    const updateProgress = () => {
      const now = Date.now();
      const remaining = endTime - now;
      const newProgress = (remaining / duration) * 100;

      if (newProgress <= 0) {
        setIsVisible(false);
        setTimeout(onClose, 300); // Allow exit animation to complete
      } else {
        setProgress(newProgress);
        requestAnimationFrame(updateProgress);
      }
    };

    const animationFrame = requestAnimationFrame(updateProgress);
    return () => cancelAnimationFrame(animationFrame);
  }, [duration, onClose]);

  if (!isVisible) return null;

  return (
    <div
      className={`
        fixed bottom-4 right-4 max-w-sm w-full
        border rounded-lg shadow-lg
        transform transition-all duration-300 ease-in-out
        ${backgrounds[type]}
        ${isVisible ? 'translate-x-0 opacity-100' : 'translate-x-full opacity-0'}
      `}
      role="alert"
    >
      <div className="p-4">
        <div className="flex items-start">
          <div className="flex-shrink-0">{icons[type]}</div>
          <div className="mr-3 flex-1">
            <p className="text-sm font-medium text-gray-800">{message}</p>
          </div>
          <button
            onClick={() => {
              setIsVisible(false);
              setTimeout(onClose, 300);
            }}
            className="flex-shrink-0 ml-4 text-gray-400 hover:text-gray-600 focus:outline-none"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>
      {duration && (
        <div className="h-1 w-full bg-gray-200 rounded-b-lg overflow-hidden">
          <div
            className={`h-full transition-all duration-100 ease-linear ${
              type === 'success' ? 'bg-green-500' :
              type === 'error' ? 'bg-red-500' :
              type === 'warning' ? 'bg-yellow-500' : 'bg-blue-500'
            }`}
            style={{ width: `${progress}%` }}
          />
        </div>
      )}
    </div>
  );
};

// Notification Manager
type NotificationItem = {
  id: string;
  type: NotificationType;
  message: string;
  duration?: number;
};

interface NotificationManagerProps {
  notifications: NotificationItem[];
  onRemove: (id: string) => void;
}

export const NotificationManager: React.FC<NotificationManagerProps> = ({
  notifications,
  onRemove
}) => {
  return (
    <div className="fixed bottom-0 right-0 p-4 space-y-4 z-50">
      {notifications.map((notification) => (
        <Notification
          key={notification.id}
          type={notification.type}
          message={notification.message}
          duration={notification.duration}
          onClose={() => onRemove(notification.id)}
        />
      ))}
    </div>
  );
};

// Notification Context
type NotificationContextType = {
  showNotification: (type: NotificationType, message: string, duration?: number) => void;
};

export const NotificationContext = React.createContext<NotificationContextType>({
  showNotification: () => {}
});

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);

  const showNotification = (type: NotificationType, message: string, duration?: number) => {
    const id = Date.now().toString();
    setNotifications(prev => [...prev, { id, type, message, duration }]);
  };

  const removeNotification = (id: string) => {
    setNotifications(prev => prev.filter(notification => notification.id !== id));
  };

  return (
    <NotificationContext.Provider value={{ showNotification }}>
      {children}
      <NotificationManager
        notifications={notifications}
        onRemove={removeNotification}
      />
    </NotificationContext.Provider>
  );
};

// Custom hook for using notifications
export const useNotification = () => {
  const context = React.useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotification must be used within a NotificationProvider');
  }
  return context;
};
