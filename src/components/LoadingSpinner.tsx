import React from 'react';

interface LoadingSpinnerProps {
  size?: 'small' | 'medium' | 'large';
  className?: string;
}

export const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({ 
  size = 'medium',
  className = ''
}) => {
  const sizeClasses = {
    small: 'w-4 h-4 border-2',
    medium: 'w-8 h-8 border-3',
    large: 'w-12 h-12 border-4'
  };

  return (
    <div
      className={`
        inline-block animate-spin rounded-full
        border-solid border-current
        border-r-transparent align-[-0.125em]
        motion-reduce:animate-[spin_1.5s_linear_infinite]
        ${sizeClasses[size]}
        ${className}
      `}
      role="status"
    >
      <span className="!absolute !-m-px !h-px !w-px !overflow-hidden !whitespace-nowrap !border-0 !p-0 ![clip:rect(0,0,0,0)]">
        جاري التحميل...
      </span>
    </div>
  );
};

interface ConnectionStatusProps {
  status: 'connected' | 'connecting' | 'disconnected';
}

export const ConnectionStatus: React.FC<ConnectionStatusProps> = ({ status }) => {
  const statusConfig = {
    connected: {
      color: 'bg-green-500',
      text: 'متصل',
      textColor: 'text-green-700',
      bgColor: 'bg-green-50'
    },
    connecting: {
      color: 'bg-yellow-500',
      text: 'جاري الاتصال',
      textColor: 'text-yellow-700',
      bgColor: 'bg-yellow-50'
    },
    disconnected: {
      color: 'bg-red-500',
      text: 'غير متصل',
      textColor: 'text-red-700',
      bgColor: 'bg-red-50'
    }
  };

  const config = statusConfig[status];

  return (
    <div className={`fixed top-4 left-4 rounded-lg ${config.bgColor} p-2 flex items-center gap-2 shadow-sm z-50`}>
      <div className="relative">
        <div className={`w-2.5 h-2.5 rounded-full ${config.color}`}>
          {status === 'connecting' && (
            <div className={`absolute inset-0 rounded-full ${config.color} animate-ping`} />
          )}
        </div>
      </div>
      <span className={`text-sm font-medium ${config.textColor}`}>
        {config.text}
      </span>
    </div>
  );
};

interface LoadingOverlayProps {
  isLoading: boolean;
  message?: string;
}

export const LoadingOverlay: React.FC<LoadingOverlayProps> = ({ 
  isLoading, 
  message = 'جاري التحميل...' 
}) => {
  if (!isLoading) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 flex flex-col items-center gap-4">
        <LoadingSpinner size="large" className="text-indigo-600" />
        <p className="text-gray-700 font-medium">{message}</p>
      </div>
    </div>
  );
};
