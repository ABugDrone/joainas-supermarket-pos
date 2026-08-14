import React from 'react';
import { FileText, Printer, TrendingUp, DollarSign, ShoppingBag, Search, Lock, LockOpen } from 'lucide-react';
import { SaleRecord, UserRole, User } from '../types';
import { formatNaira, recordAuditLog } from '../utils/storage';
import { can } from '../utils/permissions';
import { useToast } from './Toast';

interface SalesRecordsProps {
  sales: SaleRecord[];
  currentUser: string;
  currentUserRole: UserRole;
  currentUserCapabilities: User['capabilities'];
  onReprintReceipt: (sale: SaleRecord) => void;
}

export const SalesRecords: React.FC<SalesRecordsProps> = ({
  sales,
  currentUser,
  currentUserRole,
  currentUserCapabilities,
  onReprintReceipt,
}) => {
  const { showToast } = useToast();

  const [filterMode, setFilterMode] = React.useState<'today' | 'date' | 'range' | 'all'>('today');
  const [singleDate, setSingleDate] = React.useState<string>(new Date().toISOString().split('T')[0]);
  const [fromDate, setFromDate] = React.useState<string>(new Date().toISOString().split('T')[0]);
  const [toDate, setToDate] = React.useState<string>(new Date().toISOString().split('T')[0]);
  const [searchQuery, setSearchQuery] = React.useState('');

  const todayStr = new Date().toISOString().split('T')[0];

  // A cashier (or any non-admin) may only see the sales they attended to.
  // Admins and users with the admin capability can see every transaction.
  const isViewerAdmin = can({ capabilities: currentUserCapabilities }, 'admin');

  const filteredSales = React.useMemo(() => {
    return sales.filter((sale) => {
      if (!isViewerAdmin && sale.cashier !== currentUser) return false;

      if (filterMode === 'today' && sale.date !== todayStr) return false;
      if (filterMode === 'date' && sale.date !== singleDate) return false;
      if (filterMode === 'range') {
        if (sale.date < fromDate || sale.date > toDate) return false;
      }

      if (searchQuery.trim()) {
        let q = searchQuery.toLowerCase();
        let matchReceipt = sale.receiptNo.toLowerCase().includes(q);
        let matchCustomer = sale.customerName?.toLowerCase().includes(q);
        let matchItem = sale.items.some((i) => i.product.name.toLowerCase().includes(q));
        return matchReceipt || matchCustomer || matchItem;
      }

      return true;
    });
  }, [sales, isViewerAdmin, currentUser, filterMode, todayStr, singleDate, fromDate, toDate, searchQuery]);

  const totalRevenue = React.useMemo(() => {
    return filteredSales.reduce((sum, s) => sum + s.totalAmount, 0);
  }, [filteredSales]);

  const totalAdvancePaid = React.useMemo(() => {
    return filteredSales.reduce((sum, s) => sum + s.advancePayment, 0);
  }, [filteredSales]);

  const totalOutstanding = React.useMemo(() => {
    return filteredSales.reduce((sum, s) => sum + s.balanceDue, 0);
  }, [filteredSales]);

  const canAccessSale = (sale: SaleRecord): boolean =>
    isViewerAdmin || sale.cashier === currentUser;

  const handlePrintAction = (sale: SaleRecord) => {
    if (!canAccessSale(sale)) {
      showToast('This receipt belongs to another staff member. Only the cashier who served them (or the Admin) can reprint it.', 'error');
      return;
    }
    recordAuditLog(
      currentUser,
      currentUserRole,
      'Reprinted Thermal Receipt',
      `Reprinted receipt ${sale.receiptNo} for customer ${sale.customerName || 'General Customer'} (Total: ${formatNaira(sale.totalAmount)}).`
    );
    onReprintReceipt(sale);
    showToast(`Thermal receipt ${sale.receiptNo} opened for printing.`, 'info');
  };

  return (
    <div className="p-4 md:p-6 bg-[#0c0e12] min-h-[calc(100vh-140px)] space-y-6 text-[#e2e8f0] font-sans">
      {/* Header & KPI Summary */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 bg-[#161b22] p-5 rounded-2xl border border-[#30363d] shadow-sm">
        <div>
          <h2 className="text-xl font-extrabold text-white flex items-center gap-2">
            <FileText className="w-6 h-6 text-cyan-400" />
            Sales Report & Daily Transaction Logs
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Real-time track daily revenue, transaction receipts, pricing breakdown, and customer advances.
          </p>
        </div>

        {/* Date Filter Tabs */}
        <div className="flex flex-wrap items-center gap-2 bg-[#0d1117] p-1.5 rounded-xl border border-[#30363d]">
          <label className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg cursor-pointer transition text-slate-200">
            <input
              type="radio"
              name="saleFilter"
              checked={filterMode === 'today'}
              onChange={() => setFilterMode('today')}
              className="accent-cyan-400"
            />
            Today
          </label>

          <label className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg cursor-pointer transition text-slate-200">
            <input
              type="radio"
              name="saleFilter"
              checked={filterMode === 'date'}
              onChange={() => setFilterMode('date')}
              className="accent-cyan-400"
            />
            Select Date
          </label>

          <label className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg cursor-pointer transition text-slate-200">
            <input
              type="radio"
              name="saleFilter"
              checked={filterMode === 'range'}
              onChange={() => setFilterMode('range')}
              className="accent-cyan-400"
            />
            Date Range
          </label>

          <label className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg cursor-pointer transition text-slate-200">
            <input
              type="radio"
              name="saleFilter"
              checked={filterMode === 'all'}
              onChange={() => setFilterMode('all')}
              className="accent-cyan-400"
            />
            All History
          </label>
        </div>
      </div>

      {/* Date Pickers if selected */}
      {filterMode === 'date' && (
        <div className="flex items-center gap-3 bg-[#161b22] p-3 rounded-xl border border-[#30363d]">
          <span className="text-xs font-bold text-slate-300">Choose Date:</span>
          <input
            type="date"
            value={singleDate}
            onChange={(e) => setSingleDate(e.target.value)}
            className="rounded-lg border border-[#30363d] bg-[#0d1117] px-3 py-1.5 text-xs font-bold text-white outline-none focus:border-cyan-500"
          />
        </div>
      )}

      {filterMode === 'range' && (
        <div className="flex items-center gap-3 bg-[#161b22] p-3 rounded-xl border border-[#30363d]">
          <span className="text-xs font-bold text-slate-300">From:</span>
          <input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="rounded-lg border border-[#30363d] bg-[#0d1117] px-3 py-1.5 text-xs font-bold text-white outline-none focus:border-cyan-500"
          />
          <span className="text-xs font-bold text-slate-300">To:</span>
          <input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className="rounded-lg border border-[#30363d] bg-[#0d1117] px-3 py-1.5 text-xs font-bold text-white outline-none focus:border-cyan-500"
          />
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-[#161b22] p-4 rounded-xl border border-[#30363d] shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-400 uppercase">Total Sales Revenue</span>
            <div className="p-2 bg-cyan-950/60 text-cyan-400 border border-cyan-800/40 rounded-lg">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-cyan-400 mt-2">
            {formatNaira(totalRevenue)}
          </div>
          <span className="text-[10px] text-slate-400 mt-1 block">Filtered sales total</span>
        </div>

        <div className="bg-[#161b22] p-4 rounded-xl border border-[#30363d] shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-400 uppercase">Total Cash / POS Collected</span>
            <div className="p-2 bg-emerald-950/60 text-emerald-400 border border-emerald-800/40 rounded-lg">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-emerald-400 mt-2">
            {formatNaira(totalAdvancePaid)}
          </div>
          <span className="text-[10px] text-slate-400 mt-1 block">Instant liquidity received</span>
        </div>

        <div className="bg-[#161b22] p-4 rounded-xl border border-[#30363d] shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-400 uppercase">Total Transactions</span>
            <div className="p-2 bg-orange-950/60 text-orange-400 border border-orange-800/40 rounded-lg">
              <ShoppingBag className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-white mt-2">
            {filteredSales.length} Receipts
          </div>
          <span className="text-[10px] text-slate-400 mt-1 block">Completed POS checkouts</span>
        </div>

        <div className="bg-[#161b22] p-4 rounded-xl border border-[#30363d] shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-400 uppercase">Credit / Unpaid Due</span>
            <div className="p-2 bg-red-950/60 text-red-400 border border-red-800/40 rounded-lg">
              <FileText className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-red-400 mt-2">
            {formatNaira(totalOutstanding)}
          </div>
          <span className="text-[10px] text-slate-400 mt-1 block">Customer balance due</span>
        </div>
      </div>

      {/* Main Table */}
      <div className="bg-[#161b22] rounded-2xl border border-[#30363d] shadow-sm overflow-hidden">
        <div className="p-4 border-b border-[#30363d] flex flex-col sm:flex-row items-center justify-between gap-3">
          <h3 className="font-bold text-sm text-white uppercase tracking-wider">
            Sales Report Breakdown
          </h3>

          <div className="relative w-full sm:w-64">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search receipt, item, customer..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 rounded-lg border border-[#30363d] bg-[#0d1117] text-xs font-medium text-white focus:border-cyan-500 outline-none"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-[#0d1117] text-slate-400 font-bold uppercase text-[10px] tracking-wide border-b border-[#30363d]">
                <th className="py-3 px-4">Receipt No & Date</th>
                <th className="py-3 px-4">Customer</th>
                <th className="py-3 px-4">Product Breakdown</th>
                <th className="py-3 px-4 text-center">Qty</th>
                <th className="py-3 px-4 text-right">Rate (₦)</th>
                <th className="py-3 px-4 text-right">Total Amount (₦)</th>
                <th className="py-3 px-4 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#30363d]">
              {filteredSales.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-500">
                    No sales records found matching selected filter.
                  </td>
                </tr>
              ) : (
                filteredSales.map((sale) => (
                  <tr
                    key={sale.id}
                    className="hover:bg-[#21262d] transition font-medium text-slate-200"
                  >
                    <td className="py-3 px-4 font-bold">
                      <span className="text-cyan-400 block">{sale.receiptNo}</span>
                      <span className="text-[10px] text-slate-400 font-normal">{sale.date} {sale.time}</span>
                    </td>
                    <td className="py-3 px-4">
                      <span className="font-bold text-white">{sale.customerName || 'General Customer'}</span>
                      <span className="block text-[10px] text-slate-400">{sale.paymentMethod}</span>
                    </td>
                    <td className="py-3 px-4">
                      <div className="space-y-0.5">
                        {sale.items.map((it, idx) => (
                          <div key={idx} className="text-[11px] flex justify-between gap-2 max-w-xs">
                            <span className="truncate text-slate-300">{it.product.name}</span>
                            <span className="font-mono text-slate-400">x{it.quantity}</span>
                          </div>
                        ))}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-center font-bold text-white">
                      {sale.items.reduce((s, i) => s + i.quantity, 0)}
                    </td>
                    <td className="py-3 px-4 text-right text-slate-300">
                      {sale.items[0]?.rate.toLocaleString()}
                    </td>
                    <td className="py-3 px-4 text-right font-black text-cyan-400 text-sm">
                      {formatNaira(sale.totalAmount)}
                    </td>
                    <td className="py-3 px-4 text-center">
                      {canAccessSale(sale) ? (
                        <button
                          onClick={() => handlePrintAction(sale)}
                          className="inline-flex items-center gap-1 py-1 px-2.5 rounded-md bg-cyan-950 border border-cyan-800/50 text-cyan-400 font-bold hover:bg-cyan-900/60 transition"
                        >
                          <Printer className="w-3.5 h-3.5" />
                          Print
                        </button>
                      ) : (
                        <span
                          className="inline-flex items-center gap-1.5 py-1 px-2.5 rounded-md bg-[#21262d] border border-[#30363d] text-slate-500 font-bold cursor-not-allowed"
                          title="This sale was served by another staff member. Only the serving cashier or the Admin can reprint it."
                        >
                          <Lock className="w-3.5 h-3.5" />
                          Locked
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="bg-[#0d1117] p-4 border-t border-[#30363d] flex items-center justify-between">
          <span className="text-xs font-bold text-slate-400">
            Report Summary (Joainas Supermarket POS Engine)
          </span>
          <div className="text-lg font-black text-white">
            Total: <span className="text-cyan-400">{formatNaira(totalRevenue)}</span>
          </div>
        </div>
      </div>
    </div>
  );
};
