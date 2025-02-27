import { useState, useEffect, useCallback } from 'react';
import debounce from 'lodash/debounce';
import { PlusCircle, FileText, Users, DollarSign, Save, Calendar, Pencil as PencilIcon, FileDown, FileUp } from 'lucide-react';
import wsService from './services/db-websocket';
import { jsPDF } from 'jspdf';
import { format } from 'date-fns';
import { ar } from 'date-fns/locale';
import { DayPicker } from 'react-day-picker';
import 'react-day-picker/dist/style.css';
import type { Cashier, CashierReport, DailyReport, Delivery } from './types';
import { exportData, importData } from './utils/dataTransfer';
import { formatNumber } from './utils/formatNumber';

// Local storage keys
const STORAGE_KEYS = {
  CASHIERS: 'bolt_income_cashiers',
  DAILY_REPORTS: 'bolt_income_daily_reports'
};

function App() {
  // State declarations
  const [loading, setLoading] = useState(false);
  const [newCashierName, setNewCashierName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [showReport, setShowReport] = useState(false);
  const [currentReport, setCurrentReport] = useState<CashierReport[]>([]);
  const [showCalendar, setShowCalendar] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
  const [cashiers, setCashiers] = useState<Cashier[]>(() => {
    const savedCashiers = localStorage.getItem(STORAGE_KEYS.CASHIERS);
    return savedCashiers ? JSON.parse(savedCashiers) : [];
  });

  // Optimized state update and broadcast
  const updateCashiersState = useCallback((newCashiers: Cashier[]) => {
    // Update localStorage immediately
    localStorage.setItem(STORAGE_KEYS.CASHIERS, JSON.stringify(newCashiers));
    // Update state
    setCashiers(newCashiers);
    // Broadcast changes
    wsService.send({
      type: 'CASHIERS_UPDATE',
      cashiers: newCashiers
    });
  }, []);

  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    setLoading(true);
    const file = event.target.files?.[0];
    if (file) {
      try {
        await importData(file);
      } catch (error) {
        alert('Error importing data. Please check the file format.');
      } finally {
        setLoading(false);
      }
    }
  };

  // WebSocket connection and synchronization
  useEffect(() => {
    // Subscribe to WebSocket updates
    const unsubscribe = wsService.subscribe((data: { 
      type: string; 
      cashiers?: Cashier[]; 
      reports?: DailyReport[];
    }) => {
      if (data.type === 'CASHIERS_UPDATE' && data.cashiers) {
        // Only update if the data is different from our current state
        const currentCashiers = JSON.stringify(cashiers);
        const newCashiers = JSON.stringify(data.cashiers);
        if (currentCashiers !== newCashiers) {
          setCashiers(data.cashiers);
          localStorage.setItem(STORAGE_KEYS.CASHIERS, newCashiers);
        }
      } else if (data.type === 'REPORTS_UPDATE' && data.reports) {
        localStorage.setItem('dailyReports', JSON.stringify(data.reports));
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
      unsubscribe();
    };
  }, [selectedDate, cashiers]);

  // Load saved reports from localStorage on component mount
  useEffect(() => {
    const savedReports = localStorage.getItem('dailyReports');
    if (savedReports && selectedDate) {
      const reports: DailyReport[] = JSON.parse(savedReports);
      const dateStr = format(selectedDate, 'yyyy-MM-dd');
      
      // Find report for the selected date
      const savedReport = reports.find(r => r.date === dateStr);
      
      if (savedReport) {
        // Parse timestamps back to Date objects
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
    }
  }, [selectedDate]);

  const addCashier = () => {
    if (!newCashierName.trim()) {
      alert('الرجاء إدخال اسم موظف صحيح');
      return;
    }
    const newCashiers = [
      ...cashiers,
      {
        id: Date.now().toString(),
        name: newCashierName,
        expectedAmount: 0,
        cashSales: 0,
        returnSales: 0,
        deliveries: [],
      },
    ];
    updateCashiersState(newCashiers);
    setNewCashierName('');
  };

  const updateCashierSales = (
    id: string,
    field: 'cashSales' | 'returnSales',
    value: number
  ) => {
    if (value < 0) {
      alert('لا يمكن أن تكون المبيعات بالسالب');
      return;
    }
    const newCashiers = cashiers.map((cashier) =>
      cashier.id === id
        ? {
            ...cashier,
            [field]: value,
            expectedAmount:
              field === 'cashSales'
                ? value - cashier.returnSales
                : cashier.cashSales - value,
          }
        : cashier
    );
    updateCashiersState(newCashiers);
  };

  const addDelivery = useCallback((id: string, amount: number, method: Delivery['method']) => {
    const newCashiers = cashiers.map((cashier) =>
      cashier.id === id
        ? {
            ...cashier,
            deliveries: [
              ...cashier.deliveries,
              { id: Date.now().toString(), amount, timestamp: new Date(), method },
            ],
          }
        : cashier
    );
    updateCashiersState(newCashiers);
  }, [cashiers, updateCashiersState]);

  const deleteDelivery = useCallback((cashierId: string, deliveryId: string) => {
    const newCashiers = cashiers.map((c) =>
      c.id === cashierId
        ? {
            ...c,
            deliveries: c.deliveries.filter((d) => d.id !== deliveryId),
          }
        : c
    );
    updateCashiersState(newCashiers);
  }, [cashiers, updateCashiersState]);

  const startNewDay = () => {
    // Save current data as a report first
    generateReport();
    
    // Reset cashiers' daily data but keep their names
    const newCashiers = cashiers.map(cashier => ({
      ...cashier,
      expectedAmount: 0,
      cashSales: 0,
      returnSales: 0,
      deliveries: []
    }));
    updateCashiersState(newCashiers);
  };

  const generateReport = () => {
    if (cashiers.length === 0) {
      alert('لا يوجد موظفين لإنشاء التقرير');
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

    // Save and broadcast report
    const dailyReport: DailyReport = {
      date: format(new Date(), 'yyyy-MM-dd'),
      reports: report
    };

    const savedReports = localStorage.getItem('dailyReports');
    let reports: DailyReport[] = savedReports ? JSON.parse(savedReports) : [];
    
    // Update or add new report
    const existingReportIndex = reports.findIndex(r => r.date === dailyReport.date);
    if (existingReportIndex !== -1) {
      reports[existingReportIndex] = dailyReport;
    } else {
      reports.push(dailyReport);
    }
    
    localStorage.setItem('dailyReports', JSON.stringify(reports));
    wsService.send({
      type: 'REPORTS_UPDATE',
      reports
    });

    setCurrentReport(report);
    setShowReport(true);
  };

  const saveReportAsPDF = () => {
    const doc = new jsPDF();
    doc.setFont('Arial', 'normal');
    doc.setR2L(true);

    // Add title
    doc.setFontSize(20);
    doc.text('تقرير تسليمات الكاشير', 105, 20, { align: 'center' });
    doc.text(
      format(selectedDate || new Date(), 'yyyy/MM/dd', { locale: ar }),
      105,
      30,
      { align: 'center' }
    );

    let yPos = 50;
    currentReport.forEach((report) => {
      if (yPos > 250) {
        doc.addPage();
        yPos = 20;
      }

      doc.setFontSize(16);
      doc.text(`${report.name}`, 190, yPos, { align: 'right' });
      yPos += 10;

      doc.setFontSize(12);
      doc.text(`المبلغ المتوقع: ${report.expectedAmount}`, 190, yPos, { align: 'right' });
      yPos += 7;
      doc.text(`إجمالي التسليم: ${report.totalDelivered}`, 190, yPos, { align: 'right' });
      yPos += 7;
      doc.text(`${report.status}: ${report.difference}`, 190, yPos, { align: 'right' });
      yPos += 10;

      if (report.deliveries.length > 0) {
        doc.text('التسليمات:', 190, yPos, { align: 'right' });
        yPos += 7;
        report.deliveries.forEach((delivery) => {
          doc.text(
            `${format(new Date(delivery.timestamp), 'HH:mm')} - ${delivery.amount}`,
            190,
            yPos,
            { align: 'right' }
          );
          yPos += 7;
        });
      }

      yPos += 10;
    });

    const fileName = `تقرير_الكاشير_${format(selectedDate || new Date(), 'yyyy_MM_dd')}.pdf`;
    doc.save(fileName);
  };

  return (
    <div className="min-h-screen bg-gray-50 text-right" dir="rtl">
      <div className="container mx-auto px-4 py-8">
        <div className="mb-4 flex justify-between items-center">
          <div className="flex gap-2 items-center">
            <button
              onClick={exportData}
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
              placeholder="اسم الموظف"
              className="flex-1 p-2 border rounded-md"
            />
            <button
              onClick={addCashier}
              className="bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 flex items-center"
            >
              <PlusCircle className="ml-2" size={20} />
              إضافة
            </button>
          </div>
        </div>

        {/* قائمة الموظفين */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {cashiers.map((cashier) => (
            <div key={cashier.id} className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-semibold mb-4 flex justify-between items-center">
                {cashier.id === editingId ? (
                  <input
                    type="text"
                    value={editingName}
                    onChange={(e) => setEditingName(e.target.value)}
                    onBlur={() => {
                      if (editingName.trim()) {
                        const newCashiers = cashiers.map((c) =>
                          c.id === editingId ? { ...c, name: editingName.trim() } : c
                        );
                        updateCashiersState(newCashiers);
                      }
                      setEditingId(null);
                      setEditingName('');
                    }}
                    onKeyPress={(e) => {
                      if (e.key === 'Enter' && editingName.trim()) {
                        const newCashiers = cashiers.map((c) =>
                          c.id === editingId ? { ...c, name: editingName.trim() } : c
                        );
                        updateCashiersState(newCashiers);
                        setEditingId(null);
                        setEditingName('');
                      }
                    }}
                    className="w-full p-2 border rounded-md"
                    autoFocus
                  />
                ) : (
                  <>
                    <span>{cashier.name}</span>
                    <button
                      onClick={() => {
                        setEditingId(cashier.id);
                        setEditingName(cashier.name);
                      }}
                      className="text-gray-500 hover:text-gray-700"
                    >
                      <PencilIcon size={16} />
                    </button>
                  </>
                )}
              </h3>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-gray-600 mb-1">
                    فواتير البيع النقدي
                  </label>
                  <input
                    type="number"
                    value={cashier.cashSales}
                    onChange={(e) =>
                      updateCashierSales(
                        cashier.id,
                        'cashSales',
                        Number(e.target.value)
                      )
                    }
                    className="w-full p-2 border rounded-md"
                  />
                </div>

                <div>
                  <label className="block text-sm text-gray-600 mb-1">
                    فواتير مرتجع البيع
                  </label>
                  <input
                    type="number"
                    value={cashier.returnSales}
                    onChange={(e) =>
                      updateCashierSales(
                        cashier.id,
                        'returnSales',
                        Number(e.target.value)
                      )
                    }
                    className="w-full p-2 border rounded-md"
                  />
                </div>

                <div>
                  <label className="block text-sm text-gray-600 mb-1">
                    صافي التسليم المتوقع
                  </label>
                  <div className="w-full p-2 bg-gray-100 rounded-md">
                    {formatNumber(cashier.expectedAmount)}
                  </div>
                </div>

                <div>
                  <label className="block text-sm text-gray-600 mb-1">
                    إضافة تسليم
                  </label>
                  <div className="space-y-2">
                    <div className="flex gap-2">
                      <input
                        type="number"
                        placeholder="المبلغ"
                        className="flex-1 p-2 border rounded-md"
                        onKeyPress={(e) => {
                          if (e.key === 'Enter') {
                            const input = e.target as HTMLInputElement;
                            const select = input.parentElement?.querySelector('select') as HTMLSelectElement;
                            const amount = Number(input.value);
                            if (amount) {
                              addDelivery(cashier.id, amount, select.value as Delivery['method']);
                              input.value = '';
                            }
                          }
                        }}
                      />
                      <select
                        defaultValue="نقدي"
                        className="w-40 p-2 border rounded-md bg-white"
                      >
                        <option value="نقدي">نقدي</option>
                        <option value="فودافون كاش">فودافون كاش</option>
                        <option value="دفعات">دفعات</option>
                        <option value="انستا باي">انستا باي</option>
                        <option value="شيكات">شيكات</option>
                        <option value="تحويل بنكي">تحويل بنكي</option>
                      </select>
                      <button
                        onClick={(event) => {
                          const input = event.currentTarget.parentElement?.querySelector('input') as HTMLInputElement;
                          const select = event.currentTarget.parentElement?.querySelector('select') as HTMLSelectElement;
                          const amount = Number(input.value);
                          if (amount) {
                            addDelivery(cashier.id, amount, select.value as Delivery['method']);
                            input.value = '';
                          }
                        }}
                        className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700"
                      >
                        <DollarSign size={20} />
                      </button>
                    </div>
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
                          <span>{formatNumber(delivery.amount)}</span>
                          <span className="text-sm text-gray-400">({delivery.method})</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-gray-500">
                            {format(new Date(delivery.timestamp), 'hh:mm a')}
                          </span>
                          <button
                            onClick={() => deleteDelivery(cashier.id, delivery.id)}
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
            </div>
          ))}
        </div>

        {/* زر توليد التقرير */}
        <div className="mt-8 flex justify-end gap-4">
          <button
            onClick={generateReport}
            className="bg-indigo-600 text-white px-6 py-3 rounded-md hover:bg-indigo-700 flex items-center"
          >
            <FileText className="ml-2" size={20} />
            توليد التقرير
          </button>
        </div>

        {/* عرض التقرير */}
        {showReport && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-lg shadow-xl p-6 max-w-4xl w-full max-h-[90vh] overflow-y-auto">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold">
                  تقرير {format(selectedDate || new Date(), 'yyyy/MM/dd', { locale: ar })}
                </h2>
                <button
                  onClick={() => setShowReport(false)}
                  className="text-gray-500 hover:text-gray-700"
                >
                  ✕
                </button>
              </div>

              <div className="space-y-6">
                {currentReport.map((report, index) => (
                  <div
                    key={index}
                    className="border rounded-lg p-4 bg-gray-50"
                  >
                    <h3 className="text-xl font-semibold mb-3">{report.name}</h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                      <div className="bg-white p-3 rounded-md shadow-sm">
                        <div className="text-gray-600">المبلغ المتوقع</div>
                        <div className="text-xl font-semibold">{formatNumber(report.expectedAmount)}</div>
                      </div>
                      <div className="bg-white p-3 rounded-md shadow-sm">
                        <div className="text-gray-600">إجمالي التسليم</div>
                        <div className="text-xl font-semibold">{formatNumber(report.totalDelivered)}</div>
                      </div>
                      <div className={`bg-white p-3 rounded-md shadow-sm ${
                        report.status === 'عجز'
                          ? 'text-red-600'
                          : report.status === 'زيادة'
                          ? 'text-green-600'
                          : 'text-blue-600'
                      }`}>
                        <div>{report.status}</div>
                        <div className="text-xl font-semibold">{report.difference}</div>
                      </div>
                    </div>
                    
                    {report.deliveries.length > 0 && (
                      <div>
                        <h4 className="font-semibold mb-2">التسليمات:</h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                          {report.deliveries.map((delivery) => (
                            <div
                              key={delivery.id}
                              className="bg-white p-2 rounded-md shadow-sm flex justify-between"
                            >
                              <div className="flex items-center gap-2">
                                <span>{formatNumber(delivery.amount)}</span>
                                <span className="text-sm text-gray-400">({delivery.method})</span>
                              </div>
                              <span className="text-gray-500">
                                {format(new Date(delivery.timestamp), 'hh:mm a')}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <div className="mt-6 flex justify-end">
                <button
                  onClick={saveReportAsPDF}
                  className="bg-green-600 text-white px-6 py-3 rounded-md hover:bg-green-700 flex items-center"
                >
                  <Save className="ml-2" size={20} />
                  حفظ كملف PDF
                </button>
              </div>
            </div>
          </div>
        )}

        {/* التقويم */}
        {showCalendar && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4">
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
      </div>
    </div>
  );
}

export default App;
