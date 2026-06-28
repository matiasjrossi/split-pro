import { SplitType } from '@prisma/client';
import { format } from 'date-fns';
import { Download } from 'lucide-react';
import React, { useState } from 'react';
import { toast } from 'sonner';

import { Button } from '~/components/ui/button';
import { useTranslationWithUtils } from '~/hooks/useTranslationWithUtils';
import { api } from '~/utils/api';

interface ExportCSVProps {
  fileName: string;
  currentUserId: number;
  friendName: string;
  friendId: number;
  disabled?: boolean;
}

export const Export: React.FC<ExportCSVProps> = ({
  fileName,
  currentUserId,
  friendName,
  friendId,
  disabled = false,
}) => {
  const headers = [
    'Paid By',
    'Name',
    'Category',
    'Amount',
    'Split Type',
    'Expense Date',
    'Currency',
    'You Lent',
    'You Owe',
    'Settlement',
  ];

  const { getCurrencyHelpersCached, t } = useTranslationWithUtils('common');

  // The expenses list is paginated on the page, so the export pulls the full
  // history on demand (lazy query, `enabled: false`) rather than relying on
  // however many pages happen to be loaded.
  const [isExporting, setIsExporting] = useState(false);
  const allExpenses = api.expense.getAllExpensesWithFriend.useQuery(
    { friendId },
    { enabled: false },
  );

  const buildAndDownloadCSV = (
    expenses: NonNullable<typeof allExpenses.data>,
  ) => {
    const csvHeaders = headers.join(',');
    const csvData = expenses.map((expense) => {
      const youPaid = expense.paidBy === currentUserId;
      const yourExpense = expense.expenseParticipants.find(
        (p) => p.userId === (youPaid ? friendId : currentUserId),
      );

      const isSettlement = expense.splitType === SplitType.SETTLEMENT;
      const { parseToCleanString } = getCurrencyHelpersCached(expense.currency);

      return [
        expense.paidBy === currentUserId ? 'You' : friendName,
        expense.name,
        expense.category,
        parseToCleanString(expense?.amount),
        expense.splitType,
        format(new Date(expense.expenseDate), 'yyyy-MM-dd HH:mm:ss'),
        expense.currency,
        youPaid && !isSettlement ? parseToCleanString(yourExpense?.amount) : 0n,
        !youPaid && !isSettlement ? parseToCleanString(yourExpense?.amount) : 0n,
        isSettlement ? parseToCleanString(yourExpense?.amount) : 0n,
      ];
    });

    const csvContent = [
      csvHeaders,
      ...csvData.map((row) =>
        row
          .map((cell) => ('string' === typeof cell && cell.includes(',') ? `"${cell}"` : cell))
          .join(','),
      ),
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    if (link.download !== undefined) {
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', `${fileName}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }
  };

  const exportToCSV = async () => {
    setIsExporting(true);
    try {
      const { data } = await allExpenses.refetch();
      if (data) {
        buildAndDownloadCSV(data);
      }
    } catch {
      toast.error(t('errors.something_went_wrong'));
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <Button
      size="sm"
      variant="secondary"
      responsiveIcon
      onClick={exportToCSV}
      disabled={disabled || isExporting}
    >
      <Download className="h-4 w-4 text-white" size={20} /> Export
    </Button>
  );
};
