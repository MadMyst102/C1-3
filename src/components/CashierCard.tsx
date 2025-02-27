import React, { useState } from 'react';
import { PencilIcon, DollarSign } from 'lucide-react';
import type { Cashier, Delivery } from '../types';
import { validateDelivery, PAYMENT_METHODS, formatCurrency } from '../utils/validation';
import { format } from 'date-fns';
import { useNotification } from './Notification';
import { useConfirmDialog } from './ConfirmDialog';

interface CashierCardProps {
  cashier: Cashier;
  onUpdate: (id: string, field: 'cashSales' | 'returnSales', value: number) => void;
  onNameEdit: (id: string, newName: string) => void;
  onAddDelivery: (id: string, amount: number, method: Delivery['method']) => void;
  onDeleteDelivery: (cashierId: string, deliveryId: string) => void;
}

export const CashierCard: React.FC<CashierCardProps> = ({
  cashier,
  onUpdate,
  onNameEdit,
  onAddDelivery,
  onDeleteDelivery
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(cashier.name);
  const [deliveryAmount, setDeliveryAmount] = useState('');
  const [selectedMethod, setSelectedMethod] = useState<Delivery['method']>('نقدي');
  
  const { showNotification } = useNotification();
  const { confirm, ConfirmDialog } = useConfirmDialog();

  const handleNameEdit = () => {
    if (!editName.trim()) {
      showNotification('error', 'اسم الموظف مطلوب');
      return;
    }
    onNameEdit(cashier.id, editName.trim());
    setIsEditing(false);
  };

  const handleDeliveryAdd = () => {
    const amount = Number(deliveryAmount);
    const delivery = { amount, method: selectedMethod };
    const errors = validateDelivery(delivery);

    if (errors.length > 0) {
      showNotification('error', errors[0]);
      return;
    }

    onAddDelivery(cashier.id, amount, selectedMethod);
    setDeliveryAmount('');
    showNotification('success', 'تم إضافة التسليم بنجاح');
  };

  const handleDeliveryDelete = async (deliveryId: string) => {
    const confirmed = await confirm({
      type: 'danger',
      title: 'تأكيد الحذف',
      message: 'هل أنت متأكد من حذف هذا التسليم؟'
    });

    if (confirmed) {
      onDeleteDelivery(cashier.id, deliveryId);
      showNotification('success', 'تم حذف التسليم بنجاح');
    }
  };

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex justify-between items-center mb-4">
        {isEditing ? (
          <input
            type="text"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            onBlur={handleNameEdit}
            onKeyPress={(e) => e.key === 'Enter' && handleNameEdit()}
            className="flex-1 p-2 border rounded-md"
            autoFocus
          />
        ) : (
          <>
            <h3 className="text-lg font-semibold">{cashier.name}</h3>
            <button
              onClick={() => setIsEditing(true)}
              className="text-gray-500 hover:text-gray-700"
            >
              <PencilIcon size={16} />
            </button>
          </>
        )}
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-sm text-gray-600 mb-1">
            فواتير البيع النقدي
          </label>
          <input
            type="number"
            value={cashier.cashSales}
            onChange={(e) => onUpdate(cashier.id, 'cashSales', Number(e.target.value))}
            className="w-full p-2 border rounded-md"
            min="0"
          />
        </div>

        <div>
          <label className="block text-sm text-gray-600 mb-1">
            فواتير مرتجع البيع
          </label>
          <input
            type="number"
            value={cashier.returnSales}
            onChange={(e) => onUpdate(cashier.id, 'returnSales', Number(e.target.value))}
            className="w-full p-2 border rounded-md"
            min="0"
          />
        </div>

        <div>
          <label className="block text-sm text-gray-600 mb-1">
            صافي التسليم المتوقع
          </label>
          <div className="w-full p-2 bg-gray-100 rounded-md font-medium">
            {formatCurrency(cashier.expectedAmount)}
          </div>
        </div>

        <div>
          <label className="block text-sm text-gray-600 mb-1">
            إضافة تسليم
          </label>
          <div className="flex gap-2">
            <input
              type="number"
              value={deliveryAmount}
              onChange={(e) => setDeliveryAmount(e.target.value)}
              placeholder="المبلغ"
              className="flex-1 p-2 border rounded-md"
              min="0"
              onKeyPress={(e) => e.key === 'Enter' && handleDeliveryAdd()}
            />
            <select
              value={selectedMethod}
              onChange={(e) => setSelectedMethod(e.target.value as Delivery['method'])}
              className="w-40 p-2 border rounded-md bg-white"
            >
              {PAYMENT_METHODS.map(method => (
                <option key={method} value={method}>{method}</option>
              ))}
            </select>
            <button
              onClick={handleDeliveryAdd}
              className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700"
            >
              <DollarSign size={20} />
            </button>
          </div>
        </div>

        <div>
          <label className="block text-sm text-gray-600 mb-1">
            التسليمات
          </label>
          <div className="max-h-40 overflow-y-auto">
            {cashier.deliveries.map((delivery) => (
              <div
                key={delivery.id}
                className="flex justify-between items-center p-2 bg-gray-50 rounded-md mb-2"
              >
                <div className="flex items-center gap-2">
                  <span>{formatCurrency(delivery.amount)}</span>
                  <span className="text-sm text-gray-400">({delivery.method})</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-500">
                    {format(new Date(delivery.timestamp), 'hh:mm a')}
                  </span>
                  <button
                    onClick={() => handleDeliveryDelete(delivery.id)}
                    className="text-red-500 hover:text-red-700 p-1"
                    title="حذف"
                  >
                    ✕
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      {ConfirmDialog}
    </div>
  );
};
