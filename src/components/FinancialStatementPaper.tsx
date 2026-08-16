import React from 'react';
import { formatNaira } from '../utils/storage';

export interface FinancialStatementData {
  fromDate: string;
  toDate: string;
  grossRevenue: number;
  totalCOGS: number;
  grossProfit: number;
  totalOperatingExpenses: number;
  expenseByCategory: Record<string, number>;
  netProfit: number;
  grossMarginPercent: number;
  netMarginPercent: number;
  transactionCount: number;
}

interface FinancialStatementPaperProps {
  data: FinancialStatementData;
  id?: string;
  periodLabel: string;
}

const formatDisplayDate = (iso: string): string => {
  const d = new Date(iso + 'T00:00:00');
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  return `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
};

export const FinancialStatementPaper: React.FC<FinancialStatementPaperProps> = ({ data, id, periodLabel }) => {
  return (
    <div
      id={id}
      data-paper="a4"
      className="bg-white text-black mx-auto"
      style={{
        width: '210mm',
        minHeight: '297mm',
        fontFamily: "'Segoe UI', Arial, Helvetica, sans-serif",
        padding: '18mm 16mm',
        boxSizing: 'border-box',
      }}
    >
      {/* Letterhead */}
      <div className="text-center border-b-2 border-black pb-4 mb-6">
        <h1 className="text-2xl font-black tracking-tight uppercase text-black">Joainas Seafoods, Frozen Foods and Groceries</h1>
        <p className="text-[11px] font-bold text-gray-800 uppercase tracking-wider mt-1">
          Statement of Profit and Loss (Income Statement)
        </p>
        <p className="text-[11px] text-gray-700 mt-1">
          For the Period: <strong>{formatDisplayDate(data.fromDate)}</strong> to <strong>{formatDisplayDate(data.toDate)}</strong>
        </p>
        <p className="text-[10px] text-gray-600 mt-1.5">
          Behind Fire Service, Gimba Road, Jimeta Yola, Adamawa State, Nigeria
        </p>
        <p className="text-[10px] text-gray-600">
          Serviced by Dronebug Technologies • dronebugtechnologies@gmail.com • +2347035716349
        </p>
      </div>

      {/* Revenue & COGS */}
      <h3 className="text-[12px] font-black uppercase tracking-wider text-black border-b border-gray-400 pb-1.5 mb-3">
        1. Revenue &amp; Cost of Goods Sold (COGS)
      </h3>
      <table className="w-full text-[11px] border-collapse mb-5">
        <tbody>
          <tr className="border-b border-gray-300">
            <td className="py-1.5 font-semibold">Gross Sales Revenue</td>
            <td className="py-1.5 text-right font-bold">{formatNaira(data.grossRevenue)}</td>
          </tr>
          <tr className="border-b border-gray-300">
            <td className="py-1.5 text-gray-700">Less: Cost of Goods Sold (COGS)</td>
            <td className="py-1.5 text-right">({formatNaira(data.totalCOGS)})</td>
          </tr>
          <tr className="border-b border-gray-300 bg-gray-100">
            <td className="py-2 font-black">GROSS PROFIT</td>
            <td className="py-2 text-right font-black">{formatNaira(data.grossProfit)}</td>
          </tr>
        </tbody>
      </table>

      {/* OPEX */}
      <h3 className="text-[12px] font-black uppercase tracking-wider text-black border-b border-gray-400 pb-1.5 mb-3">
        2. Operational Expenditures (OPEX)
      </h3>
      <table className="w-full text-[11px] border-collapse mb-5">
        <tbody>
          {Object.keys(data.expenseByCategory).length === 0 ? (
            <tr>
              <td className="py-1.5 italic text-gray-500">No operational expenses recorded for this period.</td>
            </tr>
          ) : (
            Object.entries(data.expenseByCategory).map(([cat, amt]) => (
              <tr key={cat} className="border-b border-gray-300">
                <td className="py-1.5">{cat}</td>
                <td className="py-1.5 text-right font-semibold">{formatNaira(amt as number)}</td>
              </tr>
            ))
          )}
          <tr className="border-t-2 border-gray-700 bg-gray-100">
            <td className="py-2 font-black">TOTAL OPERATIONAL EXPENDITURES</td>
            <td className="py-2 text-right font-black">({formatNaira(data.totalOperatingExpenses)})</td>
          </tr>
        </tbody>
      </table>

      {/* Net Profit */}
      <div className="border-2 border-black rounded p-4 flex justify-between items-center mt-8 bg-gray-50">
        <div>
          <span className="text-[13px] font-black block uppercase text-black">Net Operating Profit / (Loss)</span>
          <span className="text-[10px] text-gray-700">
            Gross Margin: {data.grossMarginPercent.toFixed(2)}% • Net Margin: {data.netMarginPercent.toFixed(2)}%
          </span>
        </div>
        <span className="text-xl font-black text-black">{formatNaira(data.netProfit)}</span>
      </div>

      <p className="text-[10px] text-gray-600 mt-6">
        This statement was generated automatically by the Joainas Mart POS system from {data.transactionCount} completed receipt(s) within the selected period.
      </p>

      {/* Signatures */}
      <div className="mt-10 pt-6 border-t border-dashed border-gray-400 flex justify-between text-[11px] text-gray-800">
        <div>
          <p className="font-bold">Audited By:</p>
          <p className="mt-8 border-t border-dashed border-gray-600 pt-1 w-56">Store Manager / Accountant Signature</p>
        </div>
        <div className="text-right">
          <p className="font-bold">Software Developer Verification:</p>
          <p className="mt-1 font-semibold">Dronebug Technologies and Services</p>
          <p>dronebugtechnologies@gmail.com • +2347035716349</p>
        </div>
      </div>
    </div>
  );
};