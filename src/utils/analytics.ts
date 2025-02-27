import { Cashier, Delivery, DailyReport } from '../types';
import { format, subDays } from 'date-fns';

export interface DailySummary {
  date: string;
  totalSales: number;
  totalDeliveries: number;
  activeEmployees: number;
  shortages: number;
  overages: number;
}

export interface CashierPerformance {
  name: string;
  totalSales: number;
  averageDeliveryTime: number;
  accuracyRate: number;
  shortageCount: number;
}

export const analyzeDailyReports = (reports: DailyReport[]): DailySummary[] => {
  return reports.map(report => {
    const totalSales = report.reports.reduce((sum, r) => sum + r.expectedAmount, 0);
    const totalDeliveries = report.reports.reduce((sum, r) => 
      sum + r.deliveries.reduce((dSum, d) => dSum + d.amount, 0), 0);
    const activeEmployees = report.reports.filter(r => r.deliveries.length > 0).length;
    const shortages = report.reports.filter(r => r.status === 'عجز').length;
    const overages = report.reports.filter(r => r.status === 'زيادة').length;

    return {
      date: report.date,
      totalSales,
      totalDeliveries,
      activeEmployees,
      shortages,
      overages
    };
  });
};

export const analyzeCashierPerformance = (cashier: Cashier): CashierPerformance => {
  const totalSales = cashier.cashSales - cashier.returnSales;
  
  // Calculate average delivery time (in minutes)
  const deliveryTimes = cashier.deliveries.map(d => new Date(d.timestamp).getHours() * 60 + new Date(d.timestamp).getMinutes());
  const averageDeliveryTime = deliveryTimes.length > 0 
    ? deliveryTimes.reduce((sum, time) => sum + time, 0) / deliveryTimes.length 
    : 0;

  // Calculate accuracy rate based on expected vs actual deliveries
  const totalDelivered = cashier.deliveries.reduce((sum, d) => sum + d.amount, 0);
  const difference = Math.abs(cashier.expectedAmount - totalDelivered);
  const accuracyRate = cashier.expectedAmount > 0 
    ? (1 - difference / cashier.expectedAmount) * 100 
    : 100;

  // Count number of shortages
  const shortageCount = cashier.expectedAmount > totalDelivered ? 1 : 0;

  return {
    name: cashier.name,
    totalSales,
    averageDeliveryTime,
    accuracyRate,
    shortageCount
  };
};

export const generatePerformanceReport = (cashiers: Cashier[]): CashierPerformance[] => {
  return cashiers.map(cashier => analyzeCashierPerformance(cashier));
};

export const calculateTrends = (reports: DailyReport[], days: number = 7): {
  salesTrend: number;
  accuracyTrend: number;
} => {
  const recentReports = reports
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, days);

  if (recentReports.length < 2) {
    return { salesTrend: 0, accuracyTrend: 0 };
  }

  const firstDay = recentReports[recentReports.length - 1];
  const lastDay = recentReports[0];

  const firstDaySales = firstDay.reports.reduce((sum, r) => sum + r.expectedAmount, 0);
  const lastDaySales = lastDay.reports.reduce((sum, r) => sum + r.expectedAmount, 0);

  const firstDayAccuracy = firstDay.reports.filter(r => r.status === 'تسليم صحيح').length / firstDay.reports.length;
  const lastDayAccuracy = lastDay.reports.filter(r => r.status === 'تسليم صحيح').length / lastDay.reports.length;

  return {
    salesTrend: ((lastDaySales - firstDaySales) / firstDaySales) * 100,
    accuracyTrend: ((lastDayAccuracy - firstDayAccuracy) / firstDayAccuracy) * 100
  };
};
