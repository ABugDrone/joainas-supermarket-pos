import React from 'react';
import { Bar, Line, Pie, Scatter } from 'react-chartjs-2';
import { SaleRecord, Product } from '../../types';
import { getWeekStart, addDays } from './analytics.utils';
import { todayLocal } from '../../utils/storage';
import { useCurrency } from '../../hooks/useCurrency';
import './chartConfig';

interface Props {
  sales: SaleRecord[];
  products: Product[];
}

export const Visualizer: React.FC<Props> = ({ sales, products }) => {
  const { symbol: curSym } = useCurrency();
  const [productX, setProductX] = React.useState<string>(products[0]?.id || 'all');
  const [productY, setProductY] = React.useState<string>('');
  const [metric, setMetric] = React.useState<'qty' | 'revenue'>('revenue');
  const [chartType, setChartType] = React.useState<'bar' | 'line' | 'pie' | 'scatter'>('bar');
  const [from, setFrom] = React.useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toLocaleDateString('en-CA');
  });
  const [to, setTo] = React.useState<string>(() => todayLocal());
  const [granularity, setGranularity] = React.useState<'day' | 'week' | 'month'>('day');

  // Chart.js paints to a <canvas>, so it cannot inherit CSS variables. Read the
  // live theme tokens and re-read them when <html> changes (class/style), so
  // switching to STOREBOX WHITE while this page is open recolours the chart.
  const readToken = (name: string, fallback: string) => {
    if (typeof window === 'undefined') return fallback;
    const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return value || fallback;
  };
  const readPalette = () => ({
    text: readToken('--text-primary', '#e2e8f0'),
    muted: readToken('--text-secondary', '#94a3b8'),
    grid: readToken('--border-color', '#30363d'),
  });
  const [chartPalette, setChartPalette] = React.useState(readPalette);

  React.useEffect(() => {
    const root = document.documentElement;
    const sync = () => setChartPalette(readPalette());
    const observer = new MutationObserver(sync);
    observer.observe(root, { attributes: true, attributeFilter: ['class', 'style'] });
    sync();
    return () => observer.disconnect();
  }, []);

  // Keep productX valid when products load async (368 items)
  React.useEffect(() => {
    if (products.length > 0 && productX !== 'all' && !products.find((p) => p.id === productX)) {
      setProductX(products[0].id);
    }
    if (products.length > 0 && !products.find((p) => p.id === productY) && productY) {
      setProductY('');
    }
  }, [products, productX, productY]);

  const isInvalidRange = from > to;
  const hasData = sales.length > 0 && products.length > 0;

  const getBuckets = (pid: string) => {
    const buckets = new Map<string, { qty: number; revenue: number }>();
    // create empty buckets
    let cur = from;
    if (granularity === 'day') {
      while (cur <= to) {
        buckets.set(cur, { qty: 0, revenue: 0 });
        cur = addDays(cur, 1);
      }
    } else if (granularity === 'week') {
      let c = getWeekStart(from);
      while (c <= to) {
        const end = addDays(c, 6);
        const label = c;
        buckets.set(label, { qty: 0, revenue: 0 });
        c = addDays(c, 7);
      }
    } else {
      // month
      let c = from.slice(0, 7) + '-01';
      while (c <= to) {
        const label = c.slice(0, 7);
        buckets.set(label, { qty: 0, revenue: 0 });
        const y = parseInt(c.slice(0, 4), 10);
        const m = parseInt(c.slice(5, 7), 10);
        const end = new Date(y, m, 0).toISOString().slice(0, 10);
        c = addDays(end, 1);
      }
    }

    for (const s of sales) {
      if (s.date < from || s.date > to) continue;
      for (const it of s.items) {
        if (pid !== 'all' && it.product.id !== pid) continue;
        let key = s.date;
        if (granularity === 'week') key = getWeekStart(s.date);
        else if (granularity === 'month') key = s.date.slice(0, 7) + '-01';
        // for week case key is week start, but buckets uses week start
        if (granularity === 'month') key = key.slice(0, 7);
        // normalize
        if (granularity === 'month') {
          // bucket key is YYYY-MM
          const lab = s.date.slice(0, 7);
          const b = buckets.get(lab) || buckets.get(lab + '-01');
          const k = lab;
          const bucket = buckets.get(k);
          if (bucket) {
            bucket.qty += it.quantity;
            bucket.revenue += it.amount;
          }
        } else {
          const b = buckets.get(key);
          if (b) {
            b.qty += it.quantity;
            b.revenue += it.amount;
          }
        }
      }
    }
    return buckets;
  };

  const labels = React.useMemo(() => {
    const b = getBuckets(productX);
    return Array.from(b.keys()).sort();
  }, [productX, from, to, granularity, sales]);

  const dataX = React.useMemo(() => {
    const b = getBuckets(productX);
    return labels.map((l) => {
      const v = b.get(l) || b.get(l.slice(0, 7)) || { qty: 0, revenue: 0 };
      return metric === 'qty' ? v.qty : v.revenue;
    });
  }, [productX, labels, metric, from, to, granularity, sales]);

  const dataY = React.useMemo(() => {
    if (!productY) return [];
    const b = getBuckets(productY);
    return labels.map((l) => {
      const v = b.get(l) || { qty: 0, revenue: 0 };
      return metric === 'qty' ? v.qty : v.revenue;
    });
  }, [productY, labels, metric, from, to, granularity, sales]);

  const pieData = React.useMemo(() => {
    // aggregate product totals in range for pie
    const map = new Map<string, number>();
    for (const s of sales) {
      if (s.date < from || s.date > to) continue;
      for (const it of s.items) {
        const key = it.product.name;
        map.set(key, (map.get(key) || 0) + (metric === 'qty' ? it.quantity : it.amount));
      }
    }
    const entries = Array.from(map.entries()).sort((a, b) => b[1] - a[1]).slice(0, 8);
    return entries;
  }, [sales, from, to, metric]);

  const scatterData = React.useMemo(() => {
    if (!productY) return [];
    const bx = getBuckets(productX);
    const by = getBuckets(productY);
    return labels.map((l) => ({
      x: (bx.get(l) || { qty: 0, revenue: 0 })[metric === 'qty' ? 'qty' : 'revenue'],
      y: (by.get(l) || { qty: 0, revenue: 0 })[metric === 'qty' ? 'qty' : 'revenue'],
    }));
  }, [productX, productY, labels, metric, from, to, granularity, sales]);

  const productName = (id: string) => (id === 'all' ? 'All Products' : products.find((p) => p.id === id)?.name || id);
  const colors = ['#0ea5e9', '#f97316', '#8b5cf6', '#10b981', '#eab308', '#ec4899', '#06b6d4', '#ef4444'];

  const barData = {
    labels,
    datasets: [
      { label: productName(productX), data: dataX, backgroundColor: colors[0], borderColor: colors[0], borderWidth: 1 },
      ...(productY ? [{ label: productName(productY), data: dataY, backgroundColor: colors[1], borderColor: colors[1], borderWidth: 1 }] : []),
    ],
  };
  const lineData = {
    labels,
    datasets: [
      { label: productName(productX), data: dataX, borderColor: colors[0], backgroundColor: colors[0] + '33', tension: 0.3, fill: false, pointRadius: 2 },
      ...(productY ? [{ label: productName(productY), data: dataY, borderColor: colors[1], backgroundColor: colors[1] + '33', tension: 0.3, fill: false, pointRadius: 2 }] : []),
    ],
  };
  const pieChartData = {
    labels: pieData.map(([n]) => n),
    datasets: [{ data: pieData.map(([, v]) => v), backgroundColor: pieData.map((_, i) => colors[i % colors.length]), borderWidth: 0 }],
  };
  const scatterChartData = {
    datasets: [
      {
        label: `${productName(productX)} vs ${productName(productY)}`,
        data: scatterData,
        backgroundColor: colors[0],
      },
    ],
  };

  const options: any = {
    responsive: true,
    plugins: {
      legend: { labels: { color: chartPalette.text } },
      title: { display: true, text: `${productName(productX)}${productY ? ' vs ' + productName(productY) : ''} — ${metric} • ${granularity}`, color: chartPalette.text },
    },
    scales:
      chartType === 'pie'
        ? undefined
        : {
            x: { ticks: { color: chartPalette.muted, maxRotation: 45 }, grid: { color: chartPalette.grid }, title: { display: chartType === 'scatter', text: productName(productX), color: chartPalette.muted } },
            y: { ticks: { color: chartPalette.muted }, grid: { color: chartPalette.grid }, title: { display: chartType === 'scatter', text: productY ? productName(productY) : metric, color: chartPalette.muted } },
          },
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 bg-[#161b22] p-4 rounded-xl border border-[#30363d]">
        <div>
          <label className="text-[11px] font-black uppercase text-slate-300">Product X</label>
          <select value={productX} onChange={(e) => setProductX(e.target.value)} className="mt-1 w-full rounded-lg border border-[#30363d] bg-[#0d1117] px-3 py-2 text-xs font-bold text-white">
            <option value="all">All Products</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-[11px] font-black uppercase text-slate-300">Product Y (compare)</label>
          <select value={productY} onChange={(e) => setProductY(e.target.value)} className="mt-1 w-full rounded-lg border border-[#30363d] bg-[#0d1117] px-3 py-2 text-xs font-bold text-white">
            <option value="">— None —</option>
            {products.filter((p) => p.id !== productX).map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-[11px] font-black uppercase text-slate-300">Metric</label>
          <select value={metric} onChange={(e) => setMetric(e.target.value as any)} className="mt-1 w-full rounded-lg border border-[#30363d] bg-[#0d1117] px-3 py-2 text-xs font-bold text-white">
            <option value="revenue">Revenue ({curSym})</option>
            <option value="qty">Quantity</option>
          </select>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 bg-[#161b22] p-3 rounded-xl border border-[#30363d]">
        <div className="flex items-center gap-1">
          {(['bar', 'line', 'pie', 'scatter'] as const).map((t) => (
            <button key={t} onClick={() => setChartType(t)} className={`px-3 py-1.5 rounded-lg text-xs font-black capitalize border ${chartType === t ? 'bg-sky-600 text-white border-sky-500' : 'bg-[#0d1117] text-slate-300 border-[#30363d]'}`}>
              {t}
            </button>
          ))}
        </div>
        <div className="h-6 w-px bg-[#30363d] mx-2" />
        <div className="flex items-center gap-1">
          {(['day', 'week', 'month'] as const).map((g) => (
            <button key={g} onClick={() => setGranularity(g)} className={`px-3 py-1.5 rounded-lg text-xs font-black capitalize border ${granularity === g ? 'bg-emerald-600 text-white border-emerald-500' : 'bg-[#0d1117] text-slate-300 border-[#30363d]'}`}>
              {g}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 ml-auto">
          <span className="text-xs text-slate-400">From</span>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded-lg border border-[#30363d] bg-[#0d1117] px-2 py-1 text-xs text-white" />
          <span className="text-xs text-slate-400">To</span>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="rounded-lg border border-[#30363d] bg-[#0d1117] px-2 py-1 text-xs text-white" />
        </div>
      </div>

      <div className="bg-[#161b22] rounded-xl border border-[#30363d] p-4 md:p-6">
        {isInvalidRange ? (
          <div className="py-12 text-center text-sm text-amber-400 font-bold">Invalid date range — “From” is after “To”. Please adjust dates.</div>
        ) : !hasData ? (
          <div className="py-12 text-center text-sm text-slate-400">No sales or products yet — add inventory and make a sale to see charts.</div>
        ) : (
          <div className="min-h-[320px]">
            {chartType === 'bar' && <Bar data={barData} options={options} />}
            {chartType === 'line' && <Line data={lineData} options={options} />}
            {chartType === 'pie' && <div className="max-w-[480px] mx-auto"><Pie data={pieChartData} options={options} /></div>}
            {chartType === 'scatter' && (productY ? <Scatter data={scatterChartData as any} options={options} /> : <div className="py-12 text-center text-sm text-slate-400">Select Product Y for scatter (X vs Y per period).</div>)}
          </div>
        )}
        <p className="text-[11px] text-slate-500 mt-3 text-center">Tip: Use Product X vs Y with weekly/monthly granularity for meaningful Bar/Line; Pie shows top 8 products by {metric}; Scatter shows correlation per {granularity}.</p>
      </div>
    </div>
  );
};
