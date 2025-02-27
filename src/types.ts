export interface Cashier {
  id: string;
  name: string;
  expectedAmount: number;
  cashSales: number;
  returnSales: number;
  deliveries: Delivery[];
}

export interface Delivery {
  id: string;
  amount: number;
  timestamp: Date;
  method: 'نقدي' | 'فودافون كاش' | 'دفعات' | 'انستا باي' | 'شيكات' | 'تحويل بنكي';
}

export interface CashierReport {
  name: string;
  expectedAmount: number;
  totalDelivered: number;
  difference: number;
  status: 'زيادة' | 'عجز' | 'تسليم صحيح';
  deliveries: Delivery[];
}

export interface DailyReport {
  date: string;
  reports: CashierReport[];
}