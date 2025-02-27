import { Cashier, DailyReport } from '../types';

const BACKUP_PREFIX = 'cashier_backup_';

export const createBackup = () => {
  try {
    const cashiers = localStorage.getItem('bolt_income_cashiers');
    const reports = localStorage.getItem('dailyReports');
    const timestamp = new Date().toISOString().split('T')[0];
    
    const backup = {
      cashiers: cashiers ? JSON.parse(cashiers) : [],
      reports: reports ? JSON.parse(reports) : [],
      timestamp
    };

    localStorage.setItem(`${BACKUP_PREFIX}${timestamp}`, JSON.stringify(backup));
    return true;
  } catch (error) {
    console.error('Backup creation failed:', error);
    return false;
  }
};

export const restoreBackup = (timestamp: string): boolean => {
  try {
    const backupData = localStorage.getItem(`${BACKUP_PREFIX}${timestamp}`);
    if (!backupData) return false;

    const { cashiers, reports } = JSON.parse(backupData);
    
    localStorage.setItem('bolt_income_cashiers', JSON.stringify(cashiers));
    localStorage.setItem('dailyReports', JSON.stringify(reports));
    
    return true;
  } catch (error) {
    console.error('Backup restoration failed:', error);
    return false;
  }
};

export const listBackups = (): string[] => {
  const backups: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith(BACKUP_PREFIX)) {
      backups.push(key.replace(BACKUP_PREFIX, ''));
    }
  }
  return backups.sort().reverse();
};
