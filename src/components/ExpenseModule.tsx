import React from 'react';
import { DollarSign, Trash2 } from 'lucide-react';
import { Expenditure, UserRole } from '../types';
import { formatNaira, recordAuditLog } from '../utils/storage';
import { useToast } from './Toast';
import { NumberInput } from './NumberInput';

interface ExpenseModuleProps {
  expenditures: Expenditure[];
  currentUser: string;
  currentUserRole: UserRole;
  onAddExpenditure: (exp: Expenditure) => void;
  onDeleteExpenditure: (id: string) => void;
}

export const ExpenseModule: React.FC<ExpenseModuleProps> = ({
  expenditures,
  currentUser,
  currentUserRole,
  onAddExpenditure,
  onDeleteExpenditure,
}) => {
  const { showToast } = useToast();

  const [description, setDescription] = React.useState('');
  const [amount, setAmount] = React.useState<number>(0);
  const [category, setCategory] = React.useState<Expenditure['category']>('Cold Room & Power');

  const [fromDate, setFromDate] = React.useState<string>('2026-08-01');
  const [toDate, setToDate] = React.useState<string>(new Date().toISOString().split('T')[0]);

  const filteredExpenses = React.useMemo(() => {
    return expenditures.filter((exp) => exp.date >= fromDate && exp.date <= toDate);
  }, [expenditures, fromDate, toDate]);

  const totalExpenseAmount = React.useMemo(() => {
    return filteredExpenses.reduce((sum, exp) => sum + exp.amount, 0);
  }, [filteredExpenses]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!description.trim() || amount <= 0) return;

    let newExp: Expenditure = {
      id: `exp-${Date.now()}`,
      description: description.trim(),
      category,
      amount,
      date: new Date().toISOString().split('T')[0],
      createdBy: currentUser,
    };

    onAddExpenditure(newExp);

    recordAuditLog(
      currentUser,
      currentUserRole,
      'Added Operational Expense',
      `Logged expenditure "${newExp.description}" under category "${newExp.category}" (${formatNaira(newExp.amount)}).`
    );
    showToast(`Logged expenditure "${newExp.description}" (${formatNaira(newExp.amount)}).`, 'success');

    setDescription('');
    setAmount(0);
  };

  const handleDeleteExpense = (id: string, desc: string, amt: number) => {
    onDeleteExpenditure(id);
    recordAuditLog(
      currentUser,
      currentUserRole,
      'Deleted Operational Expense',
      `Deleted expense record "${desc}" (${formatNaira(amt)}).`
    );
    showToast(`Deleted expense entry "${desc}".`, 'info');
  };

  return (
    <div className="p-4 md:p-6 bg-[#0c0e12] min-h-[calc(100vh-140px)] space-y-6 text-[#e2e8f0] font-sans">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-[#161b22] p-5 rounded-2xl border border-[#30363d] shadow-sm">
        <div>
          <h2 className="text-xl font-extrabold text-white flex items-center gap-2">
            <DollarSign className="w-6 h-6 text-emerald-400" />
            Operational Expenditures & Expense Tracker
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Log store overhead expenses, diesel generator fueling, cold room refrigeration maintenance, packaging, and staff logistics.
          </p>
        </div>

        <div className="bg-[#0d1117] border border-[#30363d] px-4 py-2 rounded-xl text-right">
          <span className="text-[10px] font-extrabold text-emerald-400 block uppercase">
            Total Expenditures (Filtered)
          </span>
          <span className="text-lg font-black text-emerald-300">
            {formatNaira(totalExpenseAmount)}
          </span>
        </div>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* LEFT PANEL */}
        <div className="lg:col-span-4 bg-[#161b22] rounded-2xl border border-[#30363d] p-5 shadow-sm space-y-4">
          <div className="bg-[#0d1117] -mx-5 -mt-5 p-3 rounded-t-2xl border-b border-[#30363d]">
            <h3 className="font-extrabold text-xs text-slate-200 uppercase tracking-wider text-center">
              Add New Expenditure
            </h3>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4 text-xs font-bold">
            <div>
              <label className="block text-slate-300 mb-1">
                Expend Description:
              </label>
              <textarea
                rows={3}
                required
                placeholder="e.g., Cold Room diesel top-up or thermal paper purchase..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full rounded-lg border border-[#30363d] p-2.5 bg-[#0d1117] text-white outline-none focus:border-cyan-500 font-normal"
              />
            </div>

            <div>
              <label className="block text-slate-300 mb-1">
                Category:
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as any)}
                className="w-full rounded-lg border border-[#30363d] p-2.5 bg-[#0d1117] text-white outline-none focus:border-cyan-500"
              >
                <option value="Cold Room & Power" className="bg-[#161b22]">Cold Room & Power (Diesel/NEPA)</option>
                <option value="Packaging & Bags" className="bg-[#161b22]">Packaging & Bags</option>
                <option value="Maintenance" className="bg-[#161b22]">Freezer & Equipment Maintenance</option>
                <option value="Transport & Freight" className="bg-[#161b22]">Transport & Freight</option>
                <option value="Salaries & Staff" className="bg-[#161b22]">Salaries & Staff Logistics</option>
                <option value="Miscellaneous" className="bg-[#161b22]">Miscellaneous</option>
              </select>
            </div>

            <div>
              <label className="block text-slate-300 mb-1">
                Amount (₦):
              </label>
              <NumberInput
                min={1}
                required
                placeholder="0"
                value={amount}
                onValueChange={(n) => setAmount(n)}
                className="w-full rounded-lg border border-[#30363d] p-2.5 bg-[#0d1117] text-emerald-400 text-sm font-black outline-none focus:border-cyan-500"
              />
            </div>

            <button
              type="submit"
              className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold rounded-xl text-xs uppercase tracking-wider transition shadow-md border border-emerald-500 active:scale-98"
            >
              Submit Expenditure
            </button>
          </form>
        </div>

        {/* RIGHT PANEL */}
        <div className="lg:col-span-8 flex flex-col bg-[#161b22] rounded-2xl border border-[#30363d] shadow-sm overflow-hidden">
          <div className="bg-[#0d1117] p-3 border-b border-[#30363d] flex flex-col sm:flex-row items-center justify-between gap-3">
            <h3 className="font-extrabold text-xs text-slate-200 uppercase tracking-wider">
              Expenditure Report
            </h3>

            <div className="flex items-center gap-2 text-xs font-bold text-slate-300">
              <span>From:</span>
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="rounded border border-[#30363d] bg-[#161b22] px-2 py-1 text-white text-xs"
              />
              <span>To:</span>
              <input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="rounded border border-[#30363d] bg-[#161b22] px-2 py-1 text-white text-xs"
              />
            </div>
          </div>

          <div className="overflow-x-auto flex-1 min-h-[320px]">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-[#0d1117] text-slate-400 font-bold uppercase text-[10px] border-b border-[#30363d]">
                  <th className="py-2.5 px-4">Description</th>
                  <th className="py-2.5 px-4">Category</th>
                  <th className="py-2.5 px-4 text-right">Amount (₦)</th>
                  <th className="py-2.5 px-4 text-center">Date</th>
                  <th className="py-2.5 px-4 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#30363d]">
                {filteredExpenses.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-12 text-center text-slate-500">
                      No expenditures logged for selected date range.
                    </td>
                  </tr>
                ) : (
                  filteredExpenses.map((exp) => (
                    <tr key={exp.id} className="hover:bg-[#21262d] transition font-medium">
                      <td className="py-3 px-4 font-semibold text-white max-w-xs truncate">
                        {exp.description}
                      </td>
                      <td className="py-3 px-4">
                        <span className="bg-[#0d1117] border border-[#30363d] text-slate-300 px-2 py-0.5 rounded text-[10px] font-bold">
                          {exp.category}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right font-black text-emerald-400 text-sm">
                        {exp.amount.toLocaleString()}
                      </td>
                      <td className="py-3 px-4 text-center text-slate-400 font-mono text-[11px]">{exp.date}</td>
                      <td className="py-3 px-4 text-center">
                        <button
                          onClick={() => handleDeleteExpense(exp.id, exp.description, exp.amount)}
                          className="p-1 text-red-400 hover:bg-red-950/50 rounded transition"
                          title="Delete Expenditure"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="bg-[#0d1117] p-3 border-t border-[#30363d] font-black text-sm text-white flex justify-between items-center">
            <span>Total Expenditure:</span>
            <span className="text-emerald-400 text-base">
              {formatNaira(totalExpenseAmount)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
