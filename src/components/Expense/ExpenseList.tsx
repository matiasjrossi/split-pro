import { SplitType } from '@prisma/client';
import { type inferRouterOutputs } from '@trpc/server';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/router';
import React, { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { CategoryIcon, CurrencyConversionIcon, SettleupIcon } from '~/components/ui/categoryIcons';
import { useTranslationWithUtils } from '~/hooks/useTranslationWithUtils';
import { cn } from '~/lib/utils';
import type { ExpenseRouter } from '~/server/api/routers/expense';
import { api } from '~/utils/api';
import { Separator } from '../ui/separator';

type ExpensesOutput =
  | inferRouterOutputs<ExpenseRouter>['getGroupExpenses']
  | inferRouterOutputs<ExpenseRouter>['getExpensesWithFriend']['expenses'];

type SingleExpenseOutput = ExpensesOutput[number];

type ExpenseComponent = React.FC<{
  e: SingleExpenseOutput;
  userId: number;
}>;

export const ExpenseList: React.FC<{
  userId: number;
  expenses?: ExpensesOutput;
  contactId: number;
  isGroup?: boolean;
  isLoading?: boolean;
  hasMore?: boolean;
  isFetchingMore?: boolean;
  onLoadMore?: () => void;
}> = ({
  userId,
  isGroup = false,
  expenses = [],
  contactId,
  isLoading,
  hasMore = false,
  isFetchingMore = false,
  onLoadMore,
}) => {
  const { i18n } = useTranslationWithUtils();

  // Auto-load the next page when the sentinel scrolls into view. `rootMargin`
  // pre-fetches a screenful early so scrolling feels seamless.
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !hasMore || !onLoadMore) {
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          onLoadMore();
        }
      },
      { rootMargin: '600px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, isFetchingMore, onLoadMore, expenses.length]);

  if (!isLoading && expenses.length === 0) {
    return <NoExpenses />;
  }

  let lastDate: Date | null = null;

  return (
    <div className="flex flex-col gap-3">
      {expenses.map((e) => {
        const currentDate = e.expenseDate;
        let isFirstOfMonth = false;

        if (
          lastDate === null ||
          currentDate.getMonth() !== lastDate.getMonth() ||
          currentDate.getFullYear() !== lastDate.getFullYear()
        ) {
          isFirstOfMonth = true;
        }

        lastDate = currentDate;

        const isSettlement = e.splitType === SplitType.SETTLEMENT;
        const isCurrencyConversion = e.splitType === SplitType.CURRENCY_CONVERSION;

        return (
          <React.Fragment key={e.id}>
            {isFirstOfMonth && (
              <div className="flex flex-row items-center gap-4 pt-2">
                <div className="text-xs font-medium text-gray-700 uppercase">
                  {new Intl.DateTimeFormat(i18n.language, {
                    month: 'long',
                    year: 'numeric',
                  }).format(currentDate)}
                </div>
                <Separator className="flex-1 bg-gray-800" />
              </div>
            )}
            <Link
              href={`/${isGroup ? 'groups' : 'balances'}/${contactId}/expenses/${e.id}`}
              className={cn('flex items-center justify-between', isFirstOfMonth ? 'pb-2' : 'py-2')}
            >
              {isSettlement && <Settlement e={e} userId={userId} />}
              {isCurrencyConversion && <CurrencyConversion e={e} userId={userId} />}
              {!isSettlement && !isCurrencyConversion && <Expense e={e} userId={userId} />}
            </Link>
          </React.Fragment>
        );
      })}
      {hasMore && <div ref={sentinelRef} aria-hidden className="h-px" />}
      {isFetchingMore && (
        <div className="flex justify-center py-3">
          <div className="size-5 animate-spin rounded-full border-2 border-gray-700 border-t-transparent" />
        </div>
      )}
    </div>
  );
};

const Expense: ExpenseComponent = ({ e, userId }) => {
  const { displayName, toUIDate, t, getCurrencyHelpersCached } = useTranslationWithUtils();
  const router = useRouter();
  const { friendId } = router.query;

  const youPaid = e.paidBy === userId && e.amount >= 0n;
  const yourExpense = e.expenseParticipants.find((participant) => participant.userId === userId);
  const theirExpense = e.expenseParticipants.find(
    (participant) => participant.userId.toString() === friendId,
  );
  const yourExpenseAmount = youPaid
    ? (theirExpense?.amount ?? yourExpense?.amount ?? 0n)
    : -(yourExpense?.amount ?? 0n);

  const { toUIString } = getCurrencyHelpersCached(e.currency);

  return (
    <>
      <div className="flex min-w-0 items-center gap-4">
        <div className="inline-block w-6 shrink-0 text-center text-xs text-gray-500">
          {toUIDate(e.expenseDate)}
        </div>
        <CategoryIcon category={e.category} className="size-5 shrink-0 text-gray-400" />
        <div className="min-w-0 pe-1">
          <p className="truncate text-sm lg:text-base">{e.name}</p>
          <p className="truncate text-xs text-gray-500">
            {displayName(e.paidByUser, userId)}{' '}
            {t(`ui.expense.user.${e.amount < 0n ? 'received' : 'paid'}`)} {toUIString(e.amount)}
          </p>
        </div>
      </div>
      <div className="min-w-10 shrink-0">
        {youPaid || 0n !== yourExpenseAmount ? (
          <>
            <div className={`text-right text-xs ${youPaid ? 'text-positive' : 'text-negative'}`}>
              {t('actors.you')} {t(`ui.expense.you.${youPaid ? 'lent' : 'owe'}`)}
            </div>
            <div
              className={`xs:max-w-full max-w-32 truncate text-right ${youPaid ? 'text-positive' : 'text-negative'}`}
            >
              {toUIString(yourExpenseAmount)}
            </div>
          </>
        ) : (
          <div>
            <p className="text-xs text-gray-400">{t('ui.not_involved')}</p>
          </div>
        )}
      </div>
    </>
  );
};

const Settlement: ExpenseComponent = ({ e, userId }) => {
  const { displayName, toUIDate, t, getCurrencyHelpersCached } = useTranslationWithUtils();

  const { toUIString } = getCurrencyHelpersCached(e.currency);

  const receiverId = e.expenseParticipants.find((p) => p.userId !== e.paidBy)?.userId;
  const userDetails = api.user.getUserDetails.useQuery({ userId: receiverId! });

  return (
    <div className="flex items-center gap-4">
      <div className="inline-block w-6 text-center text-xs text-gray-500">
        {toUIDate(e.expenseDate)}
      </div>
      <SettleupIcon className="size-5 shrink-0 text-gray-400" />
      <div className="min-w-0">
        <p className="line-clamp-2 text-sm text-gray-400">
          {displayName(e.paidByUser, userId)}{' '}
          {t(`ui.expense.user.${e.amount < 0n ? 'received' : 'paid'}`)} {toUIString(e.amount)}{' '}
          {t('ui.expense.to')} {displayName(userDetails.data, userId)}
        </p>
      </div>
    </div>
  );
};

const CurrencyConversion: ExpenseComponent = ({ e, userId }) => {
  const { displayName, toUIDate, t, getCurrencyHelpersCached } = useTranslationWithUtils();

  if (!e.conversionTo) {
    toast.error(t('errors.currency_conversion_malformed'));
    console.error(
      'Malformed currency conversion data: no conversionTo present, please report this issue.',
    );
    return null;
  }

  const receiverId = e.expenseParticipants.find((p) => p.userId !== e.paidBy)?.userId;
  const userDetails = api.user.getUserDetails.useQuery({ userId: receiverId! });

  return (
    <div className="flex min-w-0 items-center gap-4">
      <div className="inline-block w-6 shrink-0 text-center text-xs text-gray-500">
        {toUIDate(e.expenseDate)}
      </div>
      <CurrencyConversionIcon className="size-5 shrink-0 text-gray-400" />
      <div className="min-w-0">
        <p className="truncate text-sm lg:text-base">
          {getCurrencyHelpersCached(e.currency).toUIString(e.amount)} ➡️{' '}
          {
            /* @ts-ignore */
            getCurrencyHelpersCached(e.conversionTo.currency).toUIString(e.conversionTo.amount)
          }
        </p>
        <p className="truncate text-xs text-gray-500">
          {t('ui.expense.for')} {displayName(e.paidByUser, userId)} {t('ui.and')}{' '}
          {displayName(userDetails.data, userId)}
        </p>
      </div>
    </div>
  );
};

const NoExpenses = () => (
  <div className="mt-20 flex flex-col items-center justify-center">
    <Image src="/add_expense.svg" alt="Empty" width={200} height={200} className="mb-4" />
  </div>
);
