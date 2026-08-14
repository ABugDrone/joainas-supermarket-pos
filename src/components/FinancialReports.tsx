import React from 'react';
import { FileSpreadsheet, Printer, Calendar } from 'lucide-react';
import { SaleRecord, Expenditure, Product, UserRole } from '../types';
import { formatNaira, recordAuditLog } from '../utils/storage';
import { useToast } from './Toast';

interface FinancialReportsProps {
  sales: SaleRecord[];
  expenditures: Expenditure[];
  products: Product[];
  currentUser: string;
  currentUserRole: UserRole;
}

export const FinancialReports: React.FC<FinancialReportsProps> = ({
  sales,
  expenditures,
  products,
  currentUser,
  currentUserRole,
}) => {
  const { showToast } = useToast();

  const [selectedMonth, setSelectedMonth] = React.useState<number>(new Date().getMonth());
  const [selectedYear, setSelectedYear] = React.useState<number>(new Date().getFullYear());

  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const years = [2026, 2025, 2024];

  // Calculate Monthly Financial Metrics
  const statementData = React.useMemo(() => {
    let monthlySales = sales.filter((s) => {
      let d = new Date(s.date);
      return d.getMonth() === selectedMonth && d.getFullYear() === selectedYear;
    });

    let monthlyExpenses = expenditures.filter((e) => {
      let d = new Date(e.date);
      return d.getMonth() === selectedMonth && d.getFullYear() === selectedYear;
    });

    let grossRevenue = monthlySales.reduce((sum, s) => sum + s.totalAmount, 0);

    let totalCOGS = 0;
    monthlySales.forEach((s) => {
      s.items.forEach((item) => {
        totalCOGS += (item.product.costPrice || item.rate * 0.75) * item.quantity;
      });
    });

    let grossProfit = grossRevenue - totalCOGS;

    let totalOperatingExpenses = monthlyExpenses.reduce((sum, e) => sum + e.amount, 0);

    let expenseByCategory: Record<string, number> = {};
    monthlyExpenses.forEach((e) => {
      expenseByCategory[e.category] = (expenseByCategory[e.category] || 0) + e.amount;
    });

    let netProfit = grossProfit - totalOperatingExpenses;

    let grossMarginPercent = grossRevenue > 0 ? (grossProfit / grossRevenue) * 100 : 0;
    let netMarginPercent = grossRevenue > 0 ? (netProfit / grossRevenue) * 100 : 0;

    return {
      monthlySales,
      monthlyExpenses,
      grossRevenue,
      totalCOGS,
      grossProfit,
      totalOperatingExpenses,
      expenseByCategory,
      netProfit,
      grossMarginPercent,
      netMarginPercent,
      transactionCount: monthlySales.length,
    };
  }, [sales, expenditures, selectedMonth, selectedYear]);

  const handlePrintStatement = () => {
    recordAuditLog(
      currentUser,
      currentUserRole,
      'Generated Monthly Financial Statement',
      `Printed monthly income statement for ${months[selectedMonth]} ${selectedYear} (Gross Revenue: ${formatNaira(statementData.grossRevenue)}, Net Income: ${formatNaira(statementData.netProfit)}).`
    );
    showToast(`Monthly financial statement for ${months[selectedMonth]} ${selectedYear} sent to print.`, 'info');
    window.print();
  };

  return (
    <div className="p-4 md:p-6 bg-[#0c0e12] min-h-[calc(100vh-140px)] space-y-6 font-sans text-[#e2e8f0]">
      {/* Header & Month Selector */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 bg-[#161b22] p-5 rounded-2xl border border-[#30363d] shadow-sm">
        <div>
          <h2 className="text-xl font-extrabold text-white flex items-center gap-2">
            <FileSpreadsheet className="w-6 h-6 text-cyan-400" />
            Monthly Financial Statement & P&L Income Report
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Official monthly financial statement generator for Joainas Seafoods, Frozen foods and Groceries.
          </p>
        </div>

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
      </div>

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

      {/* Printable Financial Statement Paper Document */}
      <div className="bg-[#161b22] rounded-2xl border border-[#30363d] shadow-lg p-6 md:p-8 space-y-6 max-w-4xl mx-auto" id="printable-financial-statement">
        <div className="flex flex-col sm:flex-row justify-between items-start border-b-2 border-cyan-500 pb-6 gap-4">
          <div>
            <h1 className="text-2xl font-black text-white uppercase tracking-tight">
              JOAINAS SEAFOODS, FROZEN FOODS AND GROCERIES
            </h1>
            <p className="text-xs font-bold text-orange-400 uppercase tracking-wider mt-0.5">
              Statement of Profit and Loss (Income Statement)
            </p>
            <p className="text-xs text-slate-400 mt-1">
              For the Period: <strong>{months[selectedMonth]} 1, {selectedYear}</strong> to <strong>{months[selectedMonth]} 31, {selectedYear}</strong>
            </p>
          </div>

          <div className="text-right text-xs text-slate-400 space-y-0.5">
            <div className="font-bold text-white">JOAINAS MART POS SYSTEM</div>
            <div className="text-[11px] text-cyan-400 font-medium">Behind Fire Service, Gimba Road, Jimeta Yola. Adamawa State.</div>
            <div>Serviced by Dronebug Technologies</div>
            <div>dronebugtechnologies@gmail.com</div>
            <div>+2347035716349</div>
          </div>
        </div>

        <div className="space-y-4">
          <h3 className="font-extrabold text-sm text-white uppercase tracking-wider border-b border-[#30363d] pb-2">
            1. Revenue & Cost of Goods Sold (COGS)
          </h3>

          <div className="space-y-2 text-xs font-medium text-slate-200 pl-2">
            <div className="flex justify-between py-1 border-b border-[#30363d]">
              <span className="font-semibold">Gross Sales Revenue</span>
              <span className="font-bold text-cyan-400">{formatNaira(statementData.grossRevenue)}</span>
            </div>

            <div className="flex justify-between py-1 border-b border-[#30363d] text-slate-400">
              <span>Less: Cost of Goods Sold (COGS)</span>
              <span className="font-mono">({formatNaira(statementData.totalCOGS)})</span>
            </div>

            <div className="flex justify-between py-2 border-t-2 border-[#30363d] font-extrabold text-sm text-emerald-400">
              <span>GROSS PROFIT</span>
              <span>{formatNaira(statementData.grossProfit)}</span>
            </div>
          </div>

          <h3 className="font-extrabold text-sm text-white uppercase tracking-wider border-b border-[#30363d] pb-2 pt-4">
            2. Operational Expenditures (OPEX)
          </h3>

          <div className="space-y-1.5 text-xs text-slate-300 pl-2">
            {Object.keys(statementData.expenseByCategory).length === 0 ? (
              <div className="text-slate-400 italic py-1">No operational expenses recorded for this month.</div>
            ) : (
              Object.entries(statementData.expenseByCategory).map(([cat, amt]) => (
                <div key={cat} className="flex justify-between py-1 border-b border-[#30363d]">
                  <span>{cat}</span>
                  <span className="font-semibold">{formatNaira(amt as number)}</span>
                </div>
              ))
            )}

            <div className="flex justify-between py-2 border-t border-[#30363d] font-bold text-xs text-amber-400">
              <span>TOTAL OPERATIONAL EXPENDITURES</span>
              <span>({formatNaira(statementData.totalOperatingExpenses)})</span>
            </div>
          </div>

          <div className="p-4 bg-[#0d1117] rounded-xl border-2 border-cyan-500 flex justify-between items-center text-white mt-6">
            <div>
              <span className="font-black text-base block uppercase">NET OPERATING PROFIT / (LOSS)</span>
              <span className="text-xs text-slate-400">Net Profit Margin: {statementData.netMarginPercent.toFixed(2)}%</span>
            </div>

            <div className={`text-2xl font-black ${
              statementData.netProfit >= 0 ? 'text-emerald-400' : 'text-red-400'
            }`}>
              {formatNaira(statementData.netProfit)}
            </div>
          </div>
        </div>

        <div className="border-t border-[#30363d] pt-6 flex flex-col sm:flex-row justify-between text-[11px] text-slate-400 gap-4">
          <div>
            <p className="font-bold text-slate-300">Audited By:</p>
            <p className="mt-4 border-t border-dashed border-slate-600 pt-1 w-48">Store Manager / Accountant Sign</p>
          </div>

          <div className="text-right">
            <p className="font-bold text-slate-300">Software Developer Verification:</p>
            <p className="mt-1 font-semibold text-cyan-400">Dronebug Technologies and services</p>
            <p>dronebugtechnologies@gmail.com • +2347035716349</p>
          </div>
        </div>
      </div>
    </div>
  );
};
