import React, { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { ar } from 'date-fns/locale';
import { Clock as ClockIcon } from 'lucide-react';

export const Clock: React.FC = () => {
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  return (
    <div className="fixed top-4 right-4 bg-white rounded-lg shadow-md p-3 flex items-center gap-3 z-50">
      <ClockIcon className="text-indigo-600" size={20} />
      <div className="text-gray-700">
        <div className="text-sm font-medium">
          {format(currentTime, 'EEEE', { locale: ar })}
        </div>
        <div className="text-lg font-bold">
          {format(currentTime, 'dd/MM/yyyy', { locale: ar })}
        </div>
        <div className="text-base">
          {format(currentTime, 'hh:mm:ss a', { locale: ar })}
        </div>
      </div>
    </div>
  );
};
