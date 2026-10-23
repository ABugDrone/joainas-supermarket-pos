import React from 'react';
import { Search, Calendar, BarChart3, Eye } from 'lucide-react';
import { SaleRecord, Product } from '../../types';
import { formatNaira, recordAuditLog, todayLocal } from '../../utils/storage';
import { bucketSalesByPeriod, aggregateProductTotals, addDays, getWeekStart } from './analytics.utils';

interface Props {
  sales: SaleRecord[];
  products: Product[];
  currentUser: string;
  currentUserRole: any;
}

export const ProductRecords: React.FC<Props> = ({ sales, products, currentUser, currentUserRole }) => {
  const [selectedProduct, setSelectedProduct] = React.useState<string>('all');
  const [compareProduct, setCompareProduct] = React.useState<string>('');
  const [periodMode, setPeriodMode] = React.useState<'daily' | 'weekly' | 'monthly' | 'custom'>('monthly');
  const [singleDate, setSingleDate] = React.useState<string>(todayLocal());
  const [selectedMonth, setSelectedMonth] = React.useState<number>(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = React.useState<number>(new Date().getFullYear());
  const [fromDate, setFromDate] = React.useState<string>(todayLocal());
  const [toDate, setToDate] = React.useState<string>(todayLocal());
  const [search, setSearch] = React.useState('');

  const periodRange = React.useMemo(() => {
    if (periodMode === 'daily') return { from: singleDate, to: singleDate, label: singleDate };
    if (periodMode === 'weekly') {
      const start = getWeekStart(singleDate);
      const end = addDays(start, 6);
      return { from: start, to: end, label: `${start} to ${end}` };
    }
    if (periodMode === 'monthly') {
      const from = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-01`;
      const to = new Date(selectedYear, selectedMonth, 0).toISOString().slice(0, 10);
      return { from, to, label: `${selectedYear}-${String(selectedMonth).padStart(2, '0')}` };
    }
    return { from: fromDate, to: toDate, label: `${fromDate} to ${toDate}` };
  }, [periodMode, singleDate, selectedMonth, selectedYear, fromDate, toDate]);

  const filtered = React.useMemo(() => {
    const rows: any[] = [];
    for (const s of sales) {
      if (s.date < periodRange.from || s.date > periodRange.to) continue;
      for (const it of s.items) {
        if (selectedProduct !== 'all' && it.product.id !== selectedProduct) continue;
        if (search.trim()) {
          const q = search.toLowerCase();
          if (!it.product.name.toLowerCase().includes(q) && !s.receiptNo.toLowerCase().includes(q)) continue;
        }
        rows.push({ ...it, date: s.date, time: s.time, receiptNo: s.receiptNo, cashier: s.cashier, customerName: s.customerName });
      }
    }
    return rows;
  }, [sales, periodRange, selectedProduct, search]);

  const compareFiltered = React.useMemo(() => {
    if (!compareProduct) return [];
    const rows: any[] = [];
    for (const s of sales) {
      if (s.date < periodRange.from || s.date > periodRange.to) continue;
      for (const it of s.items) {
        if (it.product.id !== compareProduct) continue;
        rows.push({ ...it, date: s.date, receiptNo: s.receiptNo });
      }
    }
    return rows;
  }, [sales, periodRange, compareProduct]);

  const totals = React.useMemo(() => {
    const qty = filtered.reduce((sum, r) => sum + r.quantity, 0);
    const rev = filtered.reduce((sum, r) => sum + r.amount, 0);
    return { qty, rev, count: filtered.length };
  }, [filtered]);

  const totalsCompare = React.useMemo(() => {
    const qty = compareFiltered.reduce((sum, r) => sum + r.quantity, 0);
    const rev = compareFiltered.reduce((sum, r) => sum + r.amount, 0);
    return { qty, rev, count: compareFiltered.length };
  }, [compareFiltered]);

  const dailyBuckets = React.useMemo(() => bucketSalesByPeriod(sales, selectedProduct, periodRange.from, periodRange.to, 'day'), [sales, selectedProduct, periodRange]);

  const view = () => {
    recordAuditLog(currentUser, currentUserRole, 'Viewed Product Records', `Product ${selectedProduct} ${periodRange.label} ${filtered.length} rows`);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <BarChart3 className="w-5 h-5 text-sky-400" />
        <h3 className="font-black text-sm text-white">Product Records</h3>
        <span className="text-xs text-slate-400">{periodRange.label} • {totals.count} records</span>
      </div>

      {/* Filters */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 bg-[#161b22] p-4 rounded-xl border border-[#30363d]">
        <div>
          <label className="text-[11px] font-black text-slate-300 uppercase">Product</label>
          <select value={selectedProduct} onChange={(e) => setSelectedProduct(e.target.value)} className="mt-1 w-full rounded-lg border border-[#30363d] bg-[#0d1117] px-3 py-2 text-xs font-bold text-white outline-none">
            <option value="all">All Products</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>{p.name} ({p.category})</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-[11px] font-black text-slate-300 uppercase">Compare With (optional)</label>
          <select value={compareProduct} onChange={(e) => setCompareProduct(e.target.value)} className="mt-1 w-full rounded-lg border border-[#30363d] bg-[#0d1117] px-3 py-2 text-xs font-bold text-white outline-none">
            <option value="">— No Compare —</option>
            {products.filter((p) => p.id !== selectedProduct).map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-[11px] font-black text-slate-300 uppercase">Search</label>
          <div className="relative mt-1">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Product or receipt..." className="w-full pl-9 pr-3 py-2 rounded-lg border border-[#30363d] bg-[#0d1117] text-xs text-white outline-none" />
          </div>
        </div>
      </div>

      {/* Period */}
      <div className="flex flex-wrap items-center gap-2 bg-[#161b22] p-3 rounded-xl border border-[#30363d]">
        {(['daily', 'weekly', 'monthly', 'custom'] as const).map((m) => (
          <button key={m} onClick={() => setPeriodMode(m)} className={`px-3 py-1.5 rounded-lg text-xs font-black capitalize border ${periodMode === m ? 'bg-sky-600 text-white border-sky-500' : 'bg-[#0d1117] text-slate-300 border-[#30363d]'}`}>
            {m}
          </button>
        ))}
        <div className="flex items-center gap-2 ml-2">
          {periodMode === 'daily' && <input type="date" value={singleDate} onChange={(e) => setSingleDate(e.target.value)} className="rounded-lg border border-[#30363d] bg-[#0d1117] px-2 py-1 text-xs text-white" />}
          {periodMode === 'weekly' && <input type="date" value={singleDate} onChange={(e) => setSingleDate(e.target.value)} className="rounded-lg border border-[#30363d] bg-[#0d1117] px-2 py-1 text-xs text-white" />}
          {periodMode === 'monthly' && (
            <>
              <select value={selectedMonth} onChange={(e) => setSelectedMonth(parseInt(e.target.value))} className="rounded-lg border border-[#30363d] bg-[#0d1117] px-2 py-1 text-xs text-white">
                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                  <option key={m} value={m}>{String(m).padStart(2, '0')}</option>
                ))}
              </select>
              <select value={selectedYear} onChange={(e) => setSelectedYear(parseInt(e.target.value))} className="rounded-lg border border-[#30363d] bg-[#0d1117] px-2 py-1 text-xs text-white">
                {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 2 + i).map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </>
          )}
          {periodMode === 'custom' && (
            <>
              <span className="text-xs text-slate-400">From</span>
              <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="rounded-lg border border-[#30363d] bg-[#0d1117] px-2 py-1 text-xs text-white" />
              <span className="text-xs text-slate-400">To</span>
              <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="rounded-lg border border-[#30363d] bg-[#0d1117] px-2 py-1 text-xs text-white" />
            </>
          )}
          <button onClick={view} className="ml-2 px-3 py-1 rounded-lg bg-sky-600 text-white text-xs font-bold flex items-center gap-1">
            <Eye className="w-3 h-3" /> Refresh
          </button>
        </div>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-4">
          <div className="text-[10px] font-black uppercase text-slate-400">Qty Sold</div>
          <div className="text-xl font-black text-white">{totals.qty}</div>
          {compareProduct && <div className="text-xs text-sky-300">vs {totalsCompare.qty} ({totalsCompare.qty ? Math.round((totals.qty / totalsCompare.qty) * 100) : 0}%)</div>}
        </div>
        <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-4">
          <div className="text-[10px] font-black uppercase text-slate-400">Revenue</div>
          <div className="text-xl font-black text-emerald-400">{formatNaira(totals.rev)}</div>
          {compareProduct && <div className="text-xs text-sky-300">vs {formatNaira(totalsCompare.rev)}</div>}
        </div>
        <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-4">
          <div className="text-[10px] font-black uppercase text-slate-400">Records</div>
          <div className="text-xl font-black text-white">{totals.count}</div>
        </div>
        <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-4">
          <div className="text-[10px] font-black uppercase text-slate-400">Avg Daily</div>
          <div className="text-xl font-black text-white">{dailyBuckets.length ? (totals.qty / dailyBuckets.length).toFixed(1) : 0}</div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-[#161b22] rounded-xl border border-[#30363d] overflow-hidden">
        <div className="max-h-[380px] overflow-y-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="sticky top-0 bg-[#0d1117] text-slate-400 font-black uppercase text-[10px] tracking-wider">
              <tr>
                <th className="py-2 px-3">Date</th>
                <th className="py-2 px-3">Product</th>
                <th className="py-2 px-3 text-center">Qty</th>
                <th className="py-2 px-3 text-right">Rate</th>
                <th className="py-2 px-3 text-right">Amount</th>
                <th className="py-2 px-3">Receipt</th>
                <th className="py-2 px-3">Cashier</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#30363d]">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-500">No records for selection.</td>
                </tr>
              ) : (
                filtered.slice(0, 200).map((r, idx) => (
                  <tr key={idx} className="hover:bg-[#21262d] text-slate-200">
                    <td className="py-2 px-3 font-mono text-[11px]">{r.date} {r.time}</td>
                    <td className="py-2 px-3 font-bold text-white">{r.product.name} <span className="text-[10px] text-slate-400">({r.product.category})</span></td>
                    <td className="py-2 px-3 text-center font-black">{r.quantity}</td>
                    <td className="py-2 px-3 text-right">{formatNaira(r.rate)}</td>
                    <td className="py-2 px-3 text-right font-black text-sky-300">{formatNaira(r.amount)}</td>
                    <td className="py-2 px-3 font-mono text-[11px] text-cyan-400">{r.receiptNo}</td>
                    <td className="py-2 px-3 text-[11px]">{r.cashier}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {filtered.length > 200 && <div className="px-3 py-2 text-xs text-slate-500 text-center border-t border-[#30363d]">Showing 200 of {filtered.length} — refine period or search.</div>}
      </div>

      {/* Daily spark */}
      <div className="bg-[#161b22] rounded-xl border border-[#30363d] p-4">
        <div className="text-xs font-black uppercase text-slate-400 mb-2">Daily History (period)</div>
        <div className="grid grid-cols-7 gap-1">
          {dailyBuckets.slice(0, 14).map((b) => (
            <div key={b.label} className="bg-[#0d1117] border border-[#30363d] rounded p-2 text-center">
              <div className="text-[10px] text-slate-400">{b.label.slice(5)}</div>
              <div className="text-xs font-black text-white">{b.qty}</div>
              <div className="text-[10px] text-emerald-400">{formatNaira(b.revenue).slice(0, 8)}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
