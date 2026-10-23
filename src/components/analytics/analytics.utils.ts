import { SaleRecord, Product } from '../../types';

export const toISO = (d: Date) => d.toISOString().slice(0, 10);
export const parseISO = (s: string) => new Date(s + 'T00:00:00Z');

export function addDays(iso: string, n: number): string {
  const d = parseISO(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return toISO(d);
}
export function getWeekStart(iso: string): string {
  const d = parseISO(iso);
  const day = d.getUTCDay(); // 0 Sun - 6 Sat, make Monday start
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return toISO(d);
}
export function getMonthStart(iso: string): string {
  return iso.slice(0, 7) + '-01';
}
export function lastDayOfMonth(year: number, month1to12: number): string {
  const d = new Date(Date.UTC(year, month1to12, 0));
  return toISO(d);
}

export interface TimeBucket {
  label: string; // e.g. 2026-08-11 or 2026-W33 or 2026-08
  start: string; // ISO date
  end: string; // ISO date inclusive
  qty: number;
  revenue: number;
  count: number; // number of sale items matching
}

export function bucketSalesByPeriod(
  sales: SaleRecord[],
  productId: string | null, // null = all products
  from: string,
  to: string,
  granularity: 'day' | 'week' | 'month'
): TimeBucket[] {
  const buckets = new Map<string, TimeBucket>();

  const ensure = (label: string, start: string, end: string) => {
    if (!buckets.has(label)) buckets.set(label, { label, start, end, qty: 0, revenue: 0, count: 0 });
    return buckets.get(label)!;
  };

  if (from > to) return [];
  // Pre-create empty buckets for full range so chart shows gaps — safety cap 500 iterations
  if (granularity === 'day') {
    let cur = from;
    let guard = 0;
    while (cur <= to && guard++ < 500) {
      ensure(cur, cur, cur);
      cur = addDays(cur, 1);
    }
  } else if (granularity === 'week') {
    let cur = getWeekStart(from);
    let guard = 0;
    while (cur <= to && guard++ < 500) {
      const end = addDays(cur, 6);
      const label = `${cur} to ${end > to ? to : end}`;
      ensure(label, cur, end > to ? to : end);
      cur = addDays(cur, 7);
    }
  } else if (granularity === 'month') {
    let cur = getMonthStart(from);
    let guard = 0;
    while (cur <= to && guard++ < 500) {
      const y = parseInt(cur.slice(0, 4), 10);
      const m = parseInt(cur.slice(5, 7), 10);
      const end = lastDayOfMonth(y, m);
      const label = cur.slice(0, 7);
      ensure(label, cur, end > to ? to : end);
      const next = addDays(end, 1);
      if (next > to) break;
      cur = next;
    }
  }

  for (const s of sales) {
    if (s.date < from || s.date > to) continue;
    for (const it of s.items) {
      if (productId && productId !== 'all' && it.product.id !== productId) continue;
      let label = s.date;
      let start = s.date, end = s.date;
      if (granularity === 'week') {
        start = getWeekStart(s.date);
        end = addDays(start, 6);
        label = `${start} to ${end > to ? to : end}`;
      } else if (granularity === 'month') {
        label = s.date.slice(0, 7);
        start = label + '-01';
        end = lastDayOfMonth(parseInt(label.slice(0, 4), 10), parseInt(label.slice(5, 7), 10));
      }
      const b = ensure(label, start, end);
      b.qty += it.quantity;
      b.revenue += it.amount;
      b.count += 1;
    }
  }

  // Return sorted by start
  return Array.from(buckets.values()).sort((a, b) => a.start.localeCompare(b.start));
}

export function getProductTimeSeries(
  sales: SaleRecord[],
  productIds: string[], // empty or ['all'] = all
  from: string,
  to: string,
  granularity: 'day' | 'week' | 'month',
  metric: 'qty' | 'revenue' | 'count'
): { labels: string[]; series: { productId: string; name: string; data: number[] }[] } {
  const allIds = productIds.filter((id) => id !== 'all');
  const useAll = allIds.length === 0;
  // Build labels from one product's buckets (all buckets share same labels)
  const template = bucketSalesByPeriod(sales, null, from, to, granularity);
  const labels = template.map((b) => b.label);

  const productList: { id: string; name: string }[] = useAll
    ? [{ id: 'all', name: 'All Products' }]
    : allIds.map((id) => ({ id, name: id })); // name resolved outside

  const series = productList.map((p) => {
    const buckets = bucketSalesByPeriod(sales, p.id, from, to, granularity);
    const map = new Map(buckets.map((b) => [b.label, b]));
    const data = labels.map((lab) => {
      const b = map.get(lab);
      if (!b) return 0;
      if (metric === 'qty') return b.qty;
      if (metric === 'revenue') return b.revenue;
      return b.count;
    });
    return { productId: p.id, name: p.name, data };
  });

  return { labels, series };
}

export function aggregateProductTotals(
  sales: SaleRecord[],
  from: string,
  to: string
): { productId: string; productName: string; category: string; qty: number; revenue: number; count: number }[] {
  const map = new Map<string, { productId: string; productName: string; category: string; qty: number; revenue: number; count: number }>();
  for (const s of sales) {
    if (s.date < from || s.date > to) continue;
    for (const it of s.items) {
      const key = it.product.id;
      if (!map.has(key)) {
        map.set(key, { productId: key, productName: it.product.name, category: it.product.category, qty: 0, revenue: 0, count: 0 });
      }
      const rec = map.get(key)!;
      rec.qty += it.quantity;
      rec.revenue += it.amount;
      rec.count += 1;
    }
  }
  return Array.from(map.values()).sort((a, b) => b.revenue - a.revenue);
}
