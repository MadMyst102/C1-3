import React, { useMemo } from 'react';
import type { Cashier } from '../types';
import { formatCurrency } from '../utils/validation';

interface StatisticsProps {
  cashiers: Cashier[];
}

export const Statistics: React.FC<StatisticsProps> = ({ cashiers }) => {
  const stats = useMemo(() => {
    const totalCashSales = cashiers.reduce((sum, c) => sum + c.cashSales, 0);
    const totalReturnSales = cashiers.reduce((sum, c) => sum + c.returnSales, 0);
    const totalExpected = cashiers.reduce((sum, c) => sum + c.expectedAmount, 0);
    const totalDelivered = cashiers.reduce(
      (sum, c) => sum + c.deliveries.reduce((dSum, d) => dSum + d.amount, 0),
      0
    );
    const activeCashiers = cashiers.filter(c => c.deliveries.length > 0).length;

    return {
      totalCashSales,
      totalReturnSales,
      totalExpected,
      totalDelivered,
      difference: totalExpected - totalDelivered,
      activeCashiers,
      totalCashiers: cashiers.length
    };
  }, [cashiers]);

  return (
    <div className="bg-white rounded-lg shadow p-6 mb-8">
      <h2 className="text-xl font-semibold mb-4">إحصائيات اليوم</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-gray-50 p-4 rounded-lg">
          <div className="text-sm text-gray-600">إجمالي المبيعات النقدية</div>
          <div className="text-2xl font-bold text-green-600">{formatCurrency(stats.totalCashSales)}</div>
        </div>
        <div className="bg-gray-50 p-4 rounded-lg">
          <div className="text-sm text-gray-600">إجمالي المرتجعات</div>
          <div className="text-2xl font-bold text-red-600">{formatCurrency(stats.totalReturnSales)}</div>
        </div>
        <div className="bg-gray-50 p-4 rounded-lg">
          <div className="text-sm text-gray-600">إجمالي المتوقع</div>
          <div className="text-2xl font-bold text-blue-600">{formatCurrency(stats.totalExpected)}</div>
        </div>
        <div className="bg-gray-50 p-4 rounded-lg">
          <div className="text-sm text-gray-600">إجمالي المسلم</div>
          <div className="text-2xl font-bold text-purple-600">{formatCurrency(stats.totalDelivered)}</div>
        </div>
        <div className="bg-gray-50 p-4 rounded-lg">
          <div className="text-sm text-gray-600">الفرق</div>
          <div className={`text-2xl font-bold ${stats.difference > 0 ? 'text-red-600' : 'text-green-600'}`}>
            {formatCurrency(Math.abs(stats.difference))}
            {stats.difference > 0 ? ' (عجز)' : stats.difference < 0 ? ' (زيادة)' : ''}
          </div>
        </div>
        <div className="bg-gray-50 p-4 rounded-lg">
          <div className="text-sm text-gray-600">الموظفين النشطين</div>
          <div className="text-2xl font-bold text-indigo-600">
            {stats.activeCashiers} / {stats.totalCashiers}
          </div>
        </div>
      </div>
    </div>
  );
};
