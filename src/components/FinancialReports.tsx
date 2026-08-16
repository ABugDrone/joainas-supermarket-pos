import React from 'react';
import { FileSpreadsheet, Printer, Calendar, CalendarRange } from 'lucide-react';
import { SaleRecord, Expenditure, Product, UserRole } from '../types';
import { formatNaira, recordAuditLog } from '../utils/storage';
import { useToast } from './Toast';
import { FinancialStatementPaper } from './FinancialStatementPaper';
import { FinancialStatementModal } from './FinancialStatementModal';

interface FinancialReportsProps {
  sales: SaleRecord[];
  expenditures: Expenditure[];
  products: Product[];
  currentUser: string;
  currentUserRole: UserRole;
}

type PeriodMode = 'month' | 'range';

const months = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const toISODate = (d: Date): string => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const formatDisplayDate = (iso: string): string => {
  const d = new Date(iso + 'T00:00:00');
  return `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
};

const addDays = (iso: string, days: number): string => {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return toISODate(d);
};

const lastDayOfMonth = (y: number, m: number): string => {
  return toISODate(new Date(y, m + 1, 0));
};

export const FinancialReports: React.FC<FinancialReportsProps> = ({
  sales,
  expenditures,
  currentUser,
  currentUserRole,
}) => {
  const { showToast } = useToast();

  const [mode, setMode] = React.useState<PeriodMode>('month');
  const [selectedMonth, setSelectedMonth] = React.useState<number>(new Date().getMonth());
  const [selectedYear, setSelectedYear] = React.useState<number>(new Date().getFullYear());
  const [fromDate, setFromDate] = React.useState<string>(() => {
    const now = new Date();
    return toISODate(new Date(now.getFullYear(), 0, 1));
  });
  const [toDate, setToDate] = React.useState<string>(() => toISODate(new Date()));
  const [isStatementModalOpen, setIsStatementModalOpen] = React.useState(false);

  const years = [2026, 2025, 2024];

  // ============ QUICK PERIOD PRESETS ============
  const applyPreset = (preset: 'q1' | 'q2' | 'q3' | 'q4' | 'h1' | 'h2' | 'year' | 'all') => {
    const now = new Date();
    const y = now.getFullYear();
    setMode('range');
    switch (preset) {
      case 'q1':
        setFromDate(`${y}-01-01`);
        setToDate(lastDayOfMonth(y, 2));
        break;
      case 'q2':
        setFromDate(`${y}-04-01`);
        setToDate(lastDayOfMonth(y, 5));
        break;
      case 'q3':
        setFromDate(`${y}-07-01`);
        setToDate(lastDayOfMonth(y, 8));
        break;
      case 'q4':
        setFromDate(`${y}-10-01`);
        setToDate(lastDayOfMonth(y, 11));
        break;
      case 'h1':
        setFromDate(`${y}-01-01`);
        setToDate(`${y}-06-30`);
        break;
      case 'h2':
        setFromDate(`${y}-07-01`);
        setToDate(`${y}-12-31`);
        break;
      case 'year':
        setFromDate(`${y}-01-01`);
        setToDate(`${y}-12-31`);
        break;
      case 'all':
        if (sales.length > 0) {
          const sorted = sales.map((s) => s.date).sort();
          setFromDate(sorted[0]);
        } else {
          setFromDate(`${y}-01-01`);
        }
        setToDate(toISODate(new Date()));
        break;
    }
  };

  // Normalized [from, to] ISO dates for the active period.
  const periodRange = React.useMemo(() => {
    if (mode === 'month') {
      return {
        from: `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}-01`,
        to: lastDayOfMonth(selectedYear, selectedMonth),
      };
    }
    const safeFrom = fromDate <= toDate ? fromDate : toDate;
    const safeTo = fromDate <= toDate ? toDate : fromDate;
    return { from: safeFrom, to: safeTo };
  }, [mode, selectedMonth, selectedYear, fromDate, toDate]);

  const periodLabel = React.useMemo(() => {
    return `${formatDisplayDate(periodRange.from)} to ${formatDisplayDate(periodRange.to)}`;
  }, [periodRange]);

  // Calculate Financial Metrics for the active period
  const statementData = React.useMemo(() => {
    let periodSales = sales.filter((s) => s.date >= periodRange.from && s.date <= periodRange.to);
    let periodExpenses = expenditures.filter((e) => e.date >= periodRange.from && e.date <= periodRange.to);

    let grossRevenue = periodSales.reduce((sum, s) => sum + s.totalAmount, 0);

    let totalCOGS = 0;
    periodSales.forEach((s) => {
      s.items.forEach((item) => {
        totalCOGS += (item.product.costPrice || item.rate * 0.75) * item.quantity;
      });
    });

    let grossProfit = grossRevenue - totalCOGS;

    let totalOperatingExpenses = periodExpenses.reduce((sum, e) => sum + e.amount, 0);

    let expenseByCategory: Record<string, number> = {};
    periodExpenses.forEach((e) => {
      expenseByCategory[e.category] = (expenseByCategory[e.category] || 0) + e.amount;
    });

    let netProfit = grossProfit - totalOperatingExpenses;

    let grossMarginPercent = grossRevenue > 0 ? (grossProfit / grossRevenue) * 100 : 0;
    let netMarginPercent = grossRevenue > 0 ? (netProfit / grossRevenue) * 100 : 0;

    return {
      periodSales,
      periodExpenses,
      grossRevenue,
      totalCOGS,
      grossProfit,
      totalOperatingExpenses,
      expenseByCategory,
      netProfit,
      grossMarginPercent,
      netMarginPercent,
      transactionCount: periodSales.length,
    };
  }, [sales, expenditures, periodRange]);

  const handlePrintStatement = () => {
    recordAuditLog(
      currentUser,
      currentUserRole,
      'Generated Financial Statement',
      `Printed income statement for the period ${periodLabel} (Gross Revenue: ${formatNaira(statementData.grossRevenue)}, Net Income: ${formatNaira(statementData.netProfit)}).`
    );
    setIsStatementModalOpen(true);
  };

  const presetBtn = 'px-2.5 py-1.5 rounded-lg bg-[#0d1117] border border-[#30363d] text-[10px] font-bold text-slate-300 hover:bg-[#21262d] hover:text-cyan-300 transition';

  return (
    <div className="p-4 md:p-6 bg-[#0c0e12] min-h-[calc(100vh-140px)] space-y-6 font-sans text-[#e2e8f0]">
      {/* Header & Period Selector */}
      <div className="flex flex-col xl:flex-row items-start xl:items-center justify-between gap-4 bg-[#161b22] p-5 rounded-2xl border border-[#30363d] shadow-sm">
        <div>
          <h2 className="text-xl font-extrabold text-white flex items-center gap-2">
            <FileSpreadsheet className="w-6 h-6 text-cyan-400" />
            Financial Statement & P&L Income Report
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Generate monthly, quarterly, half-yearly or annual financial statements for Joainas Seafoods, Frozen foods and Groceries.
          </p>
        </div>

        {/* Period Mode Toggle */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 bg-[#0d1117] p-1 rounded-xl border border-[#30363d]">
            <button
              onClick={() => setMode('month')}
              className={`px-3 py-1.5 rounded-lg text-[11px] font-black transition ${mode === 'month' ? 'bg-cyan-600 text-white' : 'text-slate-400 hover:text-white'}`}
            >
              <Calendar className="w-3.5 h-3.5 inline-block mr-1" />
              Monthly
            </button>
            <button
              onClick={() => setMode('range')}
              className={`px-3 py-1.5 rounded-lg text-[11px] font-black transition ${mode === 'range' ? 'bg-cyan-600 text-white' : 'text-slate-400 hover:text-white'}`}
            >
              <CalendarRange className="w-3.5 h-3.5 inline-block mr-1" />
              Date Range
            </button>
          </div>
        </div>

        {mode === 'month' ? (
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 bg-[#0d1117] p-1.5 rounded-xl border border-[#30363d]">
              <Calendar className="w-4 h-4 text-slate-400 pl-1" />
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(parseInt(e.target.value))}
                className="bg-transparent text-xs font-bold text-white outline-none cursor-pointer"
              >
                {months.map((m, idx) => (
                  <option key={m} value={idx} className="bg-[#161b22] text-white">{m}</option>
                ))}
              </select>
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(parseInt(e.target.value))}
                className="bg-transparent text-xs font-bold text-white outline-none cursor-pointer"
              >
                {years.map((y) => (
                  <option key={y} value={y} className="bg-[#161b22] text-white">{y}</option>
                ))}
              </select>
            </div>

            <button
              onClick={handlePrintStatement}
              className="py-2.5 px-4 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs uppercase tracking-wider shadow-md shadow-cyan-900/30 transition flex items-center gap-2 border border-cyan-500"
            >
              <Printer className="w-4 h-4" />
              Print Statement
            </button>
          </div>
        ) : (
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <div className="flex items-center gap-2 bg-[#0d1117] p-2 rounded-xl border border-[#30363d]">
              <div className="flex flex-col">
                <span className="text-[9px] font-bold text-slate-500 uppercase">From</span>
                <input
                  type="date"
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                  className="bg-transparent text-xs font-bold text-white outline-none cursor-pointer"
                />
              </div>
              <span className="text-slate-500 font-black">→</span>
              <div className="flex flex-col">
                <span className="text-[9px] font-bold text-slate-500 uppercase">To</span>
                <input
                  type="date"
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                  className="bg-transparent text-xs font-bold text-white outline-none cursor-pointer"
                />
              </div>
            </div>

            <button
              onClick={handlePrintStatement}
              className="py-2.5 px-4 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs uppercase tracking-wider shadow-md shadow-cyan-900/30 transition flex items-center gap-2 border border-cyan-500"
            >
              <Printer className="w-4 h-4" />
              Print Statement
            </button>
          </div>
        )}
      </div>

      {/* Quick Period Presets */}
      {mode === 'range' && (
        <div className="bg-[#161b22] p-4 rounded-2xl border border-[#30363d] shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-black uppercase tracking-wider text-slate-300">Quick Periods (Year: {new Date().getFullYear()})</span>
            <span className="text-[10px] font-bold text-cyan-400">{periodLabel}</span>
          </div>
          <div className="flex flex-wrap gap-2">
            <button className={presetBtn} onClick={() => applyPreset('q1')}>Q1 (Jan–Mar)</button>
            <button className={presetBtn} onClick={() => applyPreset('q2')}>Q2 (Apr–Jun)</button>
            <button className={presetBtn} onClick={() => applyPreset('q3')}>Q3 (Jul–Sep)</button>
            <button className={presetBtn} onClick={() => applyPreset('q4')}>Q4 (Oct–Dec)</button>
            <button className={presetBtn} onClick={() => applyPreset('h1')}>First Half-Year</button>
            <button className={presetBtn} onClick={() => applyPreset('h2')}>Second Half-Year</button>
            <button className={presetBtn} onClick={() => applyPreset('year')}>Full Year</button>
            <button className={presetBtn} onClick={() => applyPreset('all')}>All Records</button>
          </div>
        </div>
      )}

      {/* Financial KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-[#161b22] p-4 rounded-2xl border border-[#30363d] shadow-sm">
          <span className="text-xs font-bold text-slate-400 uppercase block">Gross Sales Revenue</span>
          <div className="text-2xl font-black text-cyan-400 mt-1">
            {formatNaira(statementData.grossRevenue)}
          </div>
          <span className="text-[10px] text-slate-400 mt-1 block">
            From {statementData.transactionCount} completed receipts
          </span>
        </div>

        <div className="bg-[#161b22] p-4 rounded-2xl border border-[#30363d] shadow-sm">
          <span className="text-xs font-bold text-slate-400 uppercase block">Gross Profit</span>
          <div className="text-2xl font-black text-emerald-400 mt-1">
            {formatNaira(statementData.grossProfit)}
          </div>
          <span className="text-[10px] text-emerald-400 font-bold mt-1 block">
            Gross Margin: {statementData.grossMarginPercent.toFixed(1)}%
          </span>
        </div>

        <div className="bg-[#161b22] p-4 rounded-2xl border border-[#30363d] shadow-sm">
          <span className="text-xs font-bold text-slate-400 uppercase block">Total Operating Expenses</span>
          <div className="text-2xl font-black text-amber-400 mt-1">
            {formatNaira(statementData.totalOperatingExpenses)}
          </div>
          <span className="text-[10px] text-slate-400 mt-1 block">Cold room, diesel, packaging, salaries</span>
        </div>

        <div className="bg-[#161b22] p-4 rounded-2xl border border-[#30363d] shadow-sm">
          <span className="text-xs font-bold text-slate-400 uppercase block">Net Operating Income</span>
          <div className={`text-2xl font-black mt-1 ${
            statementData.netProfit >= 0 ? 'text-emerald-400' : 'text-red-400'
          }`}>
            {formatNaira(statementData.netProfit)}
          </div>
          <span className="text-[10px] text-slate-400 font-bold mt-1 block">
            Net Profit Margin: {statementData.netMarginPercent.toFixed(1)}%
          </span>
        </div>
      </div>

      {/* On-screen Financial Statement Paper Document */}
      <div className="bg-[#161b22] rounded-2xl border border-[#30363d] shadow-lg p-6 md:p-8 max-w-4xl mx-auto overflow-x-auto">
        <FinancialStatementPaper
          data={{
            fromDate: periodRange.from,
            toDate: periodRange.to,
            grossRevenue: statementData.grossRevenue,
            totalCOGS: statementData.totalCOGS,
            grossProfit: statementData.grossProfit,
            totalOperatingExpenses: statementData.totalOperatingExpenses,
            expenseByCategory: statementData.expenseByCategory,
            netProfit: statementData.netProfit,
            grossMarginPercent: statementData.grossMarginPercent,
            netMarginPercent: statementData.netMarginPercent,
            transactionCount: statementData.transactionCount,
          }}
          periodLabel={periodLabel}
        />
      </div>

      {/* A4 Print Preview Modal */}
      <FinancialStatementModal
        data={{
          fromDate: periodRange.from,
          toDate: periodRange.to,
          grossRevenue: statementData.grossRevenue,
          totalCOGS: statementData.totalCOGS,
          grossProfit: statementData.grossProfit,
          totalOperatingExpenses: statementData.totalOperatingExpenses,
          expenseByCategory: statementData.expenseByCategory,
          netProfit: statementData.netProfit,
          grossMarginPercent: statementData.grossMarginPercent,
          netMarginPercent: statementData.netMarginPercent,
          transactionCount: statementData.transactionCount,
        }}
        periodLabel={periodLabel}
        isOpen={isStatementModalOpen}
        onClose={() => setIsStatementModalOpen(false)}
      />
    </div>
  );
};