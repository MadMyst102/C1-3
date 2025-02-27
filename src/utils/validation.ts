import { Cashier, Delivery } from '../types';

export const validateCashier = (cashier: Partial<Cashier>): string[] => {
  const errors: string[] = [];

  if (!cashier.name?.trim()) {
    errors.push('اسم الموظف مطلوب');
  }

  if (typeof cashier.cashSales !== 'undefined' && cashier.cashSales < 0) {
    errors.push('لا يمكن أن تكون المبيعات النقدية بالسالب');
  }

  if (typeof cashier.returnSales !== 'undefined' && cashier.returnSales < 0) {
    errors.push('لا يمكن أن تكون مرتجعات المبيعات بالسالب');
  }

  return errors;
};

export const validateDelivery = (delivery: Partial<Delivery>): string[] => {
  const errors: string[] = [];

  if (!delivery.amount || delivery.amount <= 0) {
    errors.push('يجب أن يكون مبلغ التسليم أكبر من صفر');
  }

  if (!delivery.method) {
    errors.push('طريقة الدفع مطلوبة');
  }

  return errors;
};

export const PAYMENT_METHODS = [
  'نقدي',
  'فودافون كاش',
  'دفعات',
  'انستا باي',
  'شيكات',
  'تحويل بنكي'
] as const;

export const isValidPaymentMethod = (method: string): boolean => {
  return PAYMENT_METHODS.includes(method as any);
};

export const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat('ar-EG', {
    style: 'currency',
    currency: 'EGP',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(amount);
};

export const calculateExpectedAmount = (cashSales: number, returnSales: number): number => {
  const expected = cashSales - returnSales;
  return expected >= 0 ? expected : 0;
};

export const calculateDeliveryTotal = (deliveries: Delivery[]): number => {
  return deliveries.reduce((sum, delivery) => sum + delivery.amount, 0);
};

export const calculateDifference = (expectedAmount: number, deliveredAmount: number): {
  amount: number;
  status: 'عجز' | 'زيادة' | 'تسليم صحيح';
} => {
  const difference = expectedAmount - deliveredAmount;
  
  if (Math.abs(difference) < 0.01) { // Handle floating point precision
    return { amount: 0, status: 'تسليم صحيح' };
  }
  
  return {
    amount: Math.abs(difference),
    status: difference > 0 ? 'عجز' : 'زيادة'
  };
};
