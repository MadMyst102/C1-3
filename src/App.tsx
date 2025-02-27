import { useState, useEffect, useCallback, useMemo } from 'react';
import { ReportModal } from './components/ReportModal';
import { Clock } from './components/Clock';
import { NetworkStatus } from './components/NetworkStatus';
import { FileDown, FileUp, Calendar, Users, FileText, BarChart } from 'lucide-react';
import { Statistics } from './components/Statistics';
import { format } from 'date-fns';
import { ar } from 'date-fns/locale';
import { DayPicker } from 'react-day-picker';
import 'react-day-picker/dist/style.css';

import wsService from './services/websocket-service';
import { CashierCard } from './components/CashierCard';
import { LoadingSpinner, ConnectionStatus, LoadingOverlay } from './components/LoadingSpinner';
import { NotificationProvider, useNotification } from './components/Notification';
import { useConfirmDialog } from './components/ConfirmDialog';
import { validateCashier, calculateExpectedAmount } from './utils/validation';
import { createBackup, restoreBackup } from './utils/backup';
import { exportData, importData } from './utils/dataTransfer';
import type { Cashier, CashierReport, DailyReport, Delivery } from './types';

// Local storage keys
const STORAGE_KEYS = {
  CASHIERS: 'bolt_income_cashiers',
  DAILY_REPORTS: 'dailyReports'
};

function AppContent() {
  // State declarations
  const [loading, setLoading] = useState(false);
  const [newCashierName, setNewCashierName] = useState('');
  const [showReport, setShowReport] = useState(false);
  const [currentReport, setCurrentReport] = useState<CashierReport[]>([]);
  const [showCalendar, setShowCalendar] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'connecting' | 'disconnected'>('connecting');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'inactive'>('all');
  const [cashiers, setCashiers] = useState<Cashier[]>(() => {
    const savedCashiers = localStorage.getItem(STORAGE_KEYS.CASHIERS);
    return savedCashiers ? JSON.parse(savedCashiers) : [];
  });

  // Filter cashiers based on search query and status
  const filteredCashiers = useMemo(() => {
    return cashiers.filter(cashier => {
      const matchesSearch = cashier.name.toLowerCase().includes(searchQuery.toLowerCase());
      const hasDeliveries = cashier.deliveries.length > 0;
      
      if (filterStatus === 'active' && !hasDeliveries) return false;
      if (filterStatus === 'inactive' && hasDeliveries) return false;
      
      return matchesSearch;
    });
  }, [cashiers, searchQuery, filterStatus]);

  const { showNotification } = useNotification();
  const { confirm, ConfirmDialog } = useConfirmDialog();

  // WebSocket connection and synchronization
  useEffect(() => {
    const handleConnect = () => {
      setConnectionStatus('connected');
      showNotification('success', 'تم الاتصال بالخادم بنجاح');
    };

    const handleDisconnect = () => {
      setConnectionStatus('disconnected');
      showNotification('error', 'تم قطع الاتصال بالخادم');
    };

    const unsubscribeConnect = wsService.onConnect(handleConnect);
    const unsubscribeDisconnect = wsService.onDisconnect(handleDisconnect);
    const unsubscribeMessage = wsService.onMessage((data: {
      type: string;
      cashiers?: Cashier[];
      reports?: DailyReport[];
    }) => {
      if (data.type === 'CASHIERS_UPDATE' && data.cashiers) {
        const currentCashiers = JSON.stringify(cashiers);
        const newCashiers = JSON.stringify(data.cashiers);
        if (currentCashiers !== newCashiers) {
          setCashiers(data.cashiers);
          localStorage.setItem(STORAGE_KEYS.CASHIERS, newCashiers);
        }
      } else if (data.type === 'REPORTS_UPDATE' && data.reports) {
        localStorage.setItem(STORAGE_KEYS.DAILY_REPORTS, JSON.stringify(data.reports));
        if (selectedDate) {
          const dateStr = format(selectedDate, 'yyyy-MM-dd');
          const report = data.reports.find((r: DailyReport) => r.date === dateStr);
          if (report) {
            setCurrentReport(report.reports);
            setShowReport(true);
          }
        }
      }
    });

    return () => {
      unsubscribeConnect();
      unsubscribeDisconnect();
      unsubscribeMessage();
    };
  }, [selectedDate, cashiers, showNotification]);

  // Load saved reports
  useEffect(() => {
    if (!selectedDate) return;

    const savedReports = localStorage.getItem(STORAGE_KEYS.DAILY_REPORTS);
    if (!savedReports) return;

    const reports: DailyReport[] = JSON.parse(savedReports);
    const dateStr = format(selectedDate, 'yyyy-MM-dd');
    const savedReport = reports.find(r => r.date === dateStr);

    if (savedReport) {
      const reportsWithDates = savedReport.reports.map(report => ({
        ...report,
        deliveries: report.deliveries.map(delivery => ({
          ...delivery,
          timestamp: new Date(delivery.timestamp)
        }))
      }));
      setCurrentReport(reportsWithDates);
      setShowReport(true);
    } else {
      setCurrentReport([]);
      setShowReport(false);
    }
  }, [selectedDate]);

  // Optimized state update and broadcast
  const updateCashiersState = useCallback((newCashiers: Cashier[]) => {
    localStorage.setItem(STORAGE_KEYS.CASHIERS, JSON.stringify(newCashiers));
    setCashiers(newCashiers);
    wsService.send({
      type: 'CASHIERS_UPDATE',
      cashiers: newCashiers
    });
  }, []);

  const addCashier = async () => {
    const newCashier: Partial<Cashier> = {
      name: newCashierName.trim()
    };

    const errors = validateCashier(newCashier);
    if (errors.length > 0) {
      showNotification('error', errors[0]);
      return;
    }

    const fullCashier: Cashier = {
      id: Date.now().toString(),
      name: newCashier.name!,
      expectedAmount: 0,
      cashSales: 0,
      returnSales: 0,
      deliveries: [],
    };

    updateCashiersState([...cashiers, fullCashier]);
    setNewCashierName('');
    showNotification('success', 'تم إضافة الموظف بنجاح');
  };

  const updateCashierSales = (
    id: string,
    field: 'cashSales' | 'returnSales',
    value: number
  ) => {
    if (value < 0) {
      showNotification('error', 'لا يمكن أن تكون المبيعات بالسالب');
      return;
    }

    const newCashiers = cashiers.map((cashier) =>
      cashier.id === id
        ? {
            ...cashier,
            [field]: value,
            expectedAmount: calculateExpectedAmount(
              field === 'cashSales' ? value : cashier.cashSales,
              field === 'returnSales' ? value : cashier.returnSales
            )
          }
        : cashier
    );
    updateCashiersState(newCashiers);
  };

  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      setLoading(true);
      await importData(file);
      showNotification('success', 'تم استيراد البيانات بنجاح');
    } catch (error) {
      showNotification('error', 'حدث خطأ أثناء استيراد البيانات');
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async () => {
    try {
      await exportData();
      showNotification('success', 'تم تصدير البيانات بنجاح');
    } catch (error) {
      showNotification('error', 'حدث خطأ أثناء تصدير البيانات');
    }
  };

  const startNewDay = async () => {
    const confirmed = await confirm({
      type: 'warning',
      title: 'تأكيد بدء يوم جديد',
      message: 'هل أنت متأكد من بدء يوم جديد؟ سيتم حفظ بيانات اليوم الحالي في التقارير.'
    });

    if (!confirmed) return;

    // Save current data as a report first
    generateReport();
    
    // Create backup
    if (createBackup()) {
      showNotification('info', 'تم إنشاء نسخة احتياطية من بيانات اليوم السابق');
    }
    
    // Reset cashiers' daily data but keep their names
    const newCashiers = cashiers.map(cashier => ({
      ...cashier,
      expectedAmount: 0,
      cashSales: 0,
      returnSales: 0,
      deliveries: []
    }));
    
    updateCashiersState(newCashiers);
    showNotification('success', 'تم بدء يوم جديد بنجاح');
  };

  const generateReport = () => {
    if (cashiers.length === 0) {
      showNotification('error', 'لا يوجد موظفين لإنشاء التقرير');
      return;
    }

    const report = cashiers.map((cashier) => {
      const totalDelivered = cashier.deliveries.reduce(
        (sum, delivery) => sum + delivery.amount,
        0
      );
      const difference = cashier.expectedAmount - totalDelivered;
      
      let status: CashierReport['status'] = 'تسليم صحيح';
      if (difference > 0) {
        status = 'عجز';
      } else if (difference < 0) {
        status = 'زيادة';
      }

      return {
        name: cashier.name,
        expectedAmount: cashier.expectedAmount,
        totalDelivered,
        difference: Math.abs(difference),
        status,
        deliveries: cashier.deliveries,
      };
    });

    const dailyReport: DailyReport = {
      date: format(new Date(), 'yyyy-MM-dd'),
      reports: report
    };

    const savedReports = localStorage.getItem(STORAGE_KEYS.DAILY_REPORTS);
    let reports: DailyReport[] = savedReports ? JSON.parse(savedReports) : [];
    
    const existingReportIndex = reports.findIndex(r => r.date === dailyReport.date);
    if (existingReportIndex !== -1) {
      reports[existingReportIndex] = dailyReport;
    } else {
      reports.push(dailyReport);
    }
    
    localStorage.setItem(STORAGE_KEYS.DAILY_REPORTS, JSON.stringify(reports));
    wsService.send({
      type: 'REPORTS_UPDATE',
      reports
    });

    setCurrentReport(report);
    setShowReport(true);
    showNotification('success', 'تم إنشاء التقرير بنجاح');
  };

  return (
    <div className="min-h-screen bg-gray-50 text-right" dir="rtl">
      <Clock />
      <NetworkStatus />
      <ConnectionStatus status={connectionStatus} />
      
      <div className="container mx-auto px-4 py-8 space-y-6">
        <Statistics cashiers={cashiers} />
        <div className="mb-4 flex justify-between items-center">
          <div className="flex gap-2 items-center">
            <button
              onClick={handleExport}
              className="flex items-center gap-2 bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600"
            >
              <FileDown size={20} />
              تصدير البيانات
            </button>
            <label className="flex items-center gap-2 bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 cursor-pointer">
              <FileUp size={20} />
              استيراد البيانات
              <input
                type="file"
                accept=".json"
                onChange={handleImport}
                className="hidden"
              />
            </label>
          </div>
        </div>

        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold text-gray-800">نظام إدارة الكاشير</h1>
          <div className="flex gap-4">
            <button
              onClick={startNewDay}
              className="bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 flex items-center"
            >
              <Calendar className="ml-2" size={20} />
              بدء يوم جديد
            </button>
            <button
              onClick={() => setShowCalendar(true)}
              className="bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-700 flex items-center"
            >
              <Calendar className="ml-2" size={20} />
              عرض التقارير السابقة
            </button>
          </div>
        </div>

        {/* إضافة موظف جديد */}
        <div className="bg-white rounded-lg shadow p-6 mb-8">
          <h2 className="text-xl font-semibold mb-4 flex items-center">
            <Users className="ml-2" />
            إضافة موظف جديد
          </h2>
          <div className="flex gap-4">
            <input
              type="text"
              value={newCashierName}
              onChange={(e) => setNewCashierName(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && addCashier()}
              placeholder="اسم الموظف"
              className="flex-1 p-2 border rounded-md"
            />
            <button
              onClick={addCashier}
              className="bg-green-600 text-white px-6 py-2 rounded-md hover:bg-green-700 flex items-center gap-2"
            >
              إضافة
            </button>
          </div>
        </div>

        {/* Search and Filter Controls */}
        <div className="bg-white rounded-lg shadow p-4 mb-6">
          <div className="flex gap-4 items-center">
            <div className="flex-1">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="بحث عن موظف..."
                className="w-full p-2 border rounded-md"
              />
            </div>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value as 'all' | 'active' | 'inactive')}
              className="p-2 border rounded-md bg-white"
            >
              <option value="all">جميع الموظفين</option>
              <option value="active">النشطين</option>
              <option value="inactive">غير النشطين</option>
            </select>
          </div>
        </div>

        {/* قائمة الموظفين */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredCashiers.length === 0 ? (
            <div className="col-span-full text-center py-8 text-gray-500">
              لا يوجد موظفين مطابقين للبحث
            </div>
          ) : (
            filteredCashiers.map((cashier) => (
            <CashierCard
              key={cashier.id}
              cashier={cashier}
              onUpdate={updateCashierSales}
              onNameEdit={(id, newName) => {
                const newCashiers = cashiers.map(c =>
                  c.id === id ? { ...c, name: newName } : c
                );
                updateCashiersState(newCashiers);
              }}
              onAddDelivery={(id, amount, method) => {
                const newCashiers = cashiers.map(c =>
                  c.id === id ? {
                    ...c,
                    deliveries: [
                      ...c.deliveries,
                      { id: Date.now().toString(), amount, method, timestamp: new Date() }
                    ]
                  } : c
                );
                updateCashiersState(newCashiers);
              }}
              onDeleteDelivery={(cashierId, deliveryId) => {
                const newCashiers = cashiers.map(c =>
                  c.id === cashierId ? {
                    ...c,
                    deliveries: c.deliveries.filter(d => d.id !== deliveryId)
                  } : c
                );
                updateCashiersState(newCashiers);
              }}
            />
            ))
          )}
        </div>

        {/* زر توليد التقرير */}
        <div className="mt-8 flex justify-end">
          <button
            onClick={generateReport}
            className="bg-indigo-600 text-white px-6 py-3 rounded-md hover:bg-indigo-700 flex items-center gap-2"
          >
            <FileText size={20} />
            توليد التقرير
          </button>
        </div>

        {/* Modal components */}
        {showReport && (
          <ReportModal
            report={currentReport}
            date={selectedDate || new Date()}
            onClose={() => setShowReport(false)}
          />
        )}

        {showCalendar && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-lg shadow-xl p-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold">اختر تاريخ التقرير</h2>
                <button
                  onClick={() => setShowCalendar(false)}
                  className="text-gray-500 hover:text-gray-700"
                >
                  ✕
                </button>
              </div>
              
              <DayPicker
                mode="single"
                selected={selectedDate}
                onSelect={(date) => {
                  setSelectedDate(date);
                  setShowCalendar(false);
                }}
                locale={ar}
                className="rtl"
              />
            </div>
          </div>
        )}

        <LoadingOverlay isLoading={loading} />
        {ConfirmDialog}
      </div>
    </div>
  );
}

// Wrap the app with providers
function App() {
  return (
    <NotificationProvider>
      <AppContent />
    </NotificationProvider>
  );
}

export default App;
