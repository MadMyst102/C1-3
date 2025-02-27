import React from 'react';
import { AlertTriangle, AlertCircle, HelpCircle } from 'lucide-react';

export type DialogType = 'warning' | 'danger' | 'info';

interface ConfirmDialogProps {
  isOpen: boolean;
  type?: DialogType;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

const dialogConfig = {
  warning: {
    icon: AlertTriangle,
    iconColor: 'text-yellow-500',
    buttonColor: 'bg-yellow-600 hover:bg-yellow-700',
    borderColor: 'border-yellow-200'
  },
  danger: {
    icon: AlertCircle,
    iconColor: 'text-red-500',
    buttonColor: 'bg-red-600 hover:bg-red-700',
    borderColor: 'border-red-200'
  },
  info: {
    icon: HelpCircle,
    iconColor: 'text-blue-500',
    buttonColor: 'bg-blue-600 hover:bg-blue-700',
    borderColor: 'border-blue-200'
  }
};

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  type = 'warning',
  title,
  message,
  confirmText = 'تأكيد',
  cancelText = 'إلغاء',
  onConfirm,
  onCancel
}) => {
  if (!isOpen) return null;

  const config = dialogConfig[type];
  const Icon = config.icon;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div 
        className={`
          bg-white rounded-lg shadow-xl max-w-md w-full 
          border-2 ${config.borderColor}
          transform transition-all duration-200 ease-out
        `}
      >
        <div className="p-6">
          <div className="flex items-center gap-4 mb-4">
            <Icon className={`w-8 h-8 ${config.iconColor}`} />
            <h3 className="text-xl font-bold text-gray-900">{title}</h3>
          </div>
          
          <p className="text-gray-600 mb-6">{message}</p>
          
          <div className="flex justify-end gap-3">
            <button
              onClick={onCancel}
              className="px-4 py-2 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-md transition-colors"
            >
              {cancelText}
            </button>
            
            <button
              onClick={onConfirm}
              className={`
                px-4 py-2 text-white rounded-md 
                transition-colors focus:outline-none
                ${config.buttonColor}
              `}
            >
              {confirmText}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// Custom hook for using confirm dialog
export const useConfirmDialog = () => {
  const [dialog, setDialog] = React.useState<{
    isOpen: boolean;
    props?: Omit<ConfirmDialogProps, 'isOpen' | 'onConfirm' | 'onCancel'>;
    resolve?: (value: boolean) => void;
  }>({
    isOpen: false
  });

  const confirm = React.useCallback(
    (props: Omit<ConfirmDialogProps, 'isOpen' | 'onConfirm' | 'onCancel'>) => {
      return new Promise<boolean>((resolve) => {
        setDialog({
          isOpen: true,
          props,
          resolve
        });
      });
    },
    []
  );

  const handleConfirm = React.useCallback(() => {
    dialog.resolve?.(true);
    setDialog({ isOpen: false });
  }, [dialog]);

  const handleCancel = React.useCallback(() => {
    dialog.resolve?.(false);
    setDialog({ isOpen: false });
  }, [dialog]);

  const ConfirmDialogComponent = dialog.props ? (
    <ConfirmDialog
      {...dialog.props}
      isOpen={dialog.isOpen}
      onConfirm={handleConfirm}
      onCancel={handleCancel}
    />
  ) : null;

  return {
    confirm,
    ConfirmDialog: ConfirmDialogComponent
  };
};

// Example usage:
/*
const MyComponent = () => {
  const { confirm, ConfirmDialog } = useConfirmDialog();

  const handleDangerousAction = async () => {
    const confirmed = await confirm({
      type: 'danger',
      title: 'تأكيد الحذف',
      message: 'هل أنت متأكد من حذف هذا العنصر؟'
    });

    if (confirmed) {
      // Proceed with action
    }
  };

  return (
    <>
      <button onClick={handleDangerousAction}>حذف</button>
      {ConfirmDialog}
    </>
  );
};
*/
