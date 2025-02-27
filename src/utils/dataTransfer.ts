import { Cashier, DailyReport } from '../types';

interface AppData {
  cashiers: Cashier[];
  dailyReports: DailyReport[];
}

// Storage keys
const STORAGE_KEYS = {
  CASHIERS: 'bolt_income_cashiers',
  DAILY_REPORTS: 'bolt_income_daily_reports'
};

// Function to export data to a JSON file
export const exportData = (): void => {
  const cashiers = localStorage.getItem(STORAGE_KEYS.CASHIERS);
  const dailyReports = localStorage.getItem(STORAGE_KEYS.DAILY_REPORTS);

  const data: AppData = {
    cashiers: cashiers ? JSON.parse(cashiers) : [],
    dailyReports: dailyReports ? JSON.parse(dailyReports) : []
  };

  // Create a Blob containing the data
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  // Create a temporary link element and trigger the download
  const link = document.createElement('a');
  link.href = url;
  link.download = `bolt-income-backup-${new Date().toISOString().split('T')[0]}.json`;
  document.body.appendChild(link);
  link.click();

  // Clean up
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

// Function to import data from a JSON file
export const importData = async (file: File): Promise<void> => {
  try {
    const text = await file.text();
    const data: AppData = JSON.parse(text);

    // Validate the imported data structure
    if (!data.cashiers || !Array.isArray(data.cashiers) ||
        !data.dailyReports || !Array.isArray(data.dailyReports)) {
      throw new Error('Invalid data format');
    }

    // Store the imported data
    localStorage.setItem(STORAGE_KEYS.CASHIERS, JSON.stringify(data.cashiers));
    localStorage.setItem(STORAGE_KEYS.DAILY_REPORTS, JSON.stringify(data.dailyReports));

    // Force a page reload to reflect the imported data
    window.location.reload();
  } catch (error) {
    console.error('Error importing data:', error);
    throw error;
  }
};