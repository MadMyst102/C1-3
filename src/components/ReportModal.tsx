import React from 'react';
import { Save } from 'lucide-react';
import { format } from 'date-fns';
import { ar } from 'date-fns/locale';
import { jsPDF } from 'jspdf';
import type { CashierReport } from '../types';
import { formatCurrency } from '../utils/validation';
import { useNotification } from './Notification';

interface ReportModalProps {
  report: CashierReport[];
  date: Date;
  onClose: () => void;
}

export const ReportModal: React.FC<ReportModalProps> = ({ report, date, onClose }) => {
  const { showNotification } = useNotification();

  const saveReportAsPDF = () => {
    try {
      const doc = new jsPDF();
      doc.setFont('Arial', 'normal');
      doc.setR2L(true);

      // Add title
      doc.setFontSize(20);
      doc.text('تقرير تسليمات الكاشير', 105, 20, { align: 'center' });
      doc.text(format(date, 'yyyy/MM/dd', { locale: ar }), 105, 30, { align: 'center' });

      let yPos = 50;
      report.forEach((cashier) => {
        if (yPos > 250) {
          doc.addPage();
          yPos = 20;
        }

        doc.setFontSize(16);
        doc.text(`${cashier.name}`, 190, yPos, { align: 'right' });
        yPos += 10;

        doc.setFontSize(12);
        doc.text(`المبلغ المتوقع: ${formatCurrency(cashier.expectedAmount)}`, 190, yPos, { align: 'right' });
        yPos += 7;
        doc.text(`إجمالي التسليم: ${formatCurrency(cashier.totalDelivered)}`, 190, yPos, { align: 'right' });
        yPos += 7;
        doc.text(`${cashier.status}: ${formatCurrency(cashier.difference)}`, 190, yPos, { align: 'right' });
        yPos += 10;

        if (cashier.deliveries.length > 0) {
          doc.text('التسليمات:', 190, yPos, { align: 'right' });
          yPos += 7;
          cashier.deliveries.forEach((delivery) => {
            doc.text(
              `${format(new Date(delivery.timestamp), 'HH:mm')} - ${formatCurrency(delivery.amount)} (${delivery.method})`,
              190,
              yPos,
              { align: 'right' }
            );
            yPos += 7;
          });
        }

        yPos += 10;
      });

      const fileName = `تقرير_الكاشير_${format(date, 'yyyy_MM_dd')}.pdf`;
      doc.save(fileName);
      showNotification('success', 'تم حفظ التقرير بنجاح');
    } catch (error) {
      console.error('Error saving PDF:', error);
      showNotification('error', 'حدث خطأ أثناء حفظ التقرير');
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg shadow-xl p-6 max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold">
            تقرير {format(date, 'yyyy/MM/dd', { locale: ar })}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700"
          >
            ✕
          </button>
        </div>

        <div className="space-y-6">
          {report.map((cashier, index) => (
            <div
              key={index}
              className="border rounded-lg p-4 bg-gray-50"
            >
              <h3 className="text-xl font-semibold mb-3">{cashier.name}</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                <div className="bg-white p-3 rounded-md shadow-sm">
                  <div className="text-gray-600">المبلغ المتوقع</div>
                  <div className="text-xl font-semibold">
                    {formatCurrency(cashier.expectedAmount)}
                  </div>
                </div>
                <div className="bg-white p-3 rounded-md shadow-sm">
                  <div className="text-gray-600">إجمالي التسليم</div>
                  <div className="text-xl font-semibold">
                    {formatCurrency(cashier.totalDelivered)}
                  </div>
                </div>
                <div className={`bg-white p-3 rounded-md shadow-sm ${
                  cashier.status === 'عجز'
                    ? 'text-red-600'
                    : cashier.status === 'زيادة'
                    ? 'text-green-600'
                    : 'text-blue-600'
                }`}>
                  <div>{cashier.status}</div>
                  <div className="text-xl font-semibold">
                    {formatCurrency(cashier.difference)}
                  </div>
                </div>
              </div>
              
              {cashier.deliveries.length > 0 && (
                <div>
                  <h4 className="font-semibold mb-2">التسليمات:</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                    {cashier.deliveries.map((delivery) => (
                      <div
                        key={delivery.id}
                        className="bg-white p-2 rounded-md shadow-sm flex justify-between"
                      >
                        <div className="flex items-center gap-2">
                          <span>{formatCurrency(delivery.amount)}</span>
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
            className="bg-green-600 text-white px-6 py-3 rounded-md hover:bg-green-700 flex items-center gap-2"
          >
            <Save size={20} />
            حفظ كملف PDF
          </button>
        </div>
      </div>
    </div>
  );
};
