import React from 'react';
import { BarChart3, Table, Eye } from 'lucide-react';
import { SaleRecord, Product, Category } from '../../types';
import { ProductRecords } from './ProductRecords';
import { Visualizer } from './Visualizer';

interface Props {
  sales: SaleRecord[];
  products: Product[];
  categories: Category[];
  currentUser: string;
  currentUserRole: any;
}

export const AnalyticsModule: React.FC<Props> = ({ sales, products, categories, currentUser, currentUserRole }) => {
  const [active, setActive] = React.useState<'records' | 'visualizer'>('records');

  return (
    <div className="p-4 md:p-6 bg-[#0c0e12] min-h-[calc(100vh-140px)] space-y-4 font-sans text-[#e2e8f0]">
      <div className="bg-[#161b22] rounded-2xl border border-[#30363d] p-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-xl bg-sky-950 border border-sky-800 text-sky-400">
            <BarChart3 className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-lg font-black text-white flex items-center gap-2">Analytics</h2>
            <p className="text-xs text-slate-400">ADMIN only — product sales history + visual comparison (Bar, Line, Pie, Scatter).</p>
          </div>
        </div>
        <div className="flex items-center gap-2 bg-[#0d1117] p-1.5 rounded-xl border border-[#30363d]">
          <button onClick={() => setActive('records')} className={`px-4 py-2 rounded-lg text-xs font-black flex items-center gap-2 ${active === 'records' ? 'bg-sky-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}>
            <Table className="w-4 h-4" /> Product Records
          </button>
          <button onClick={() => setActive('visualizer')} className={`px-4 py-2 rounded-lg text-xs font-black flex items-center gap-2 ${active === 'visualizer' ? 'bg-sky-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}>
            <Eye className="w-4 h-4" /> Visualizer
          </button>
        </div>
      </div>

      {active === 'records' ? (
        <ProductRecords sales={sales} products={products} currentUser={currentUser} currentUserRole={currentUserRole} />
      ) : (
        <Visualizer sales={sales} products={products} />
      )}
    </div>
  );
};
