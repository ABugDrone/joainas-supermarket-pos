import React from 'react';
import { Users, Plus, Search, DollarSign } from 'lucide-react';
import { Customer, SaleRecord, UserRole } from '../types';
import { formatNaira, recordAuditLog } from '../utils/storage';
import { useToast } from './Toast';

interface CustomerModuleProps {
  customers: Customer[];
  sales: SaleRecord[];
  currentUser: string;
  currentUserRole: UserRole;
  onAddCustomer: (customer: Customer) => void;
  onUpdateCustomerBalance: (customerId: string, amountPaid: number) => void;
}

export const CustomerModule: React.FC<CustomerModuleProps> = ({
  customers,
  sales,
  currentUser,
  currentUserRole,
  onAddCustomer,
  onUpdateCustomerBalance,
}) => {
  const { showToast } = useToast();

  const [selectedCustomerId, setSelectedCustomerId] = React.useState<string>(customers[0]?.id || '');
  const [searchQuery, setSearchQuery] = React.useState('');
  const [isNewCustomerModalOpen, setIsNewCustomerModalOpen] = React.useState(false);
  const [isDepositModalOpen, setIsDepositModalOpen] = React.useState(false);

  // Form states for new customer
  const [fullName, setFullName] = React.useState('');
  const [phoneNo, setPhoneNo] = React.useState('');
  const [address, setAddress] = React.useState('');

  // Form state for deposit/payment
  const [paymentAmount, setPaymentAmount] = React.useState<number>(0);

  const selectedCustomer = React.useMemo(() => {
    return customers.find((c) => c.id === selectedCustomerId) || customers[0];
  }, [customers, selectedCustomerId]);

  const filteredCustomers = React.useMemo(() => {
    return customers.filter(
      (c) =>
        c.fullName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.phone.includes(searchQuery) ||
        c.address.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [customers, searchQuery]);

  const customerSales = React.useMemo(() => {
    if (!selectedCustomer) return [];
    return sales.filter((s) => s.customerId === selectedCustomer.id || s.customerPhone === selectedCustomer.phone);
  }, [sales, selectedCustomer]);

  const totalAllBalances = React.useMemo(() => {
    return customers.reduce((sum, c) => sum + c.balance, 0);
  }, [customers]);

  const handleCreateCustomer = (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim() || !phoneNo.trim()) return;

    let newCust: Customer = {
      id: `cust-${Date.now()}`,
      fullName: fullName.trim(),
      phone: phoneNo.trim(),
      address: address.trim() || 'Yola',
      balance: 0,
      points: 0,
      advancePayment: 0,
      createdAt: new Date().toISOString().split('T')[0],
    };

    onAddCustomer(newCust);
    setSelectedCustomerId(newCust.id);

    recordAuditLog(
      currentUser,
      currentUserRole,
      'Added New Customer Account',
      `Registered customer profile for "${newCust.fullName}" (${newCust.phone}).`
    );
    showToast(`Registered new customer profile for "${newCust.fullName}".`, 'success');

    setFullName('');
    setPhoneNo('');
    setAddress('');
    setIsNewCustomerModalOpen(false);
  };

  const handleProcessDeposit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomer || paymentAmount <= 0) return;

    onUpdateCustomerBalance(selectedCustomer.id, paymentAmount);

    recordAuditLog(
      currentUser,
      currentUserRole,
      'Recorded Customer Debt Payment',
      `Received ${formatNaira(paymentAmount)} payment from customer "${selectedCustomer.fullName}".`
    );
    showToast(`Recorded payment of ${formatNaira(paymentAmount)} for ${selectedCustomer.fullName}.`, 'success');

    setPaymentAmount(0);
    setIsDepositModalOpen(false);
  };

  return (
    <div className="p-4 md:p-6 bg-[#0c0e12] min-h-[calc(100vh-140px)] space-y-6 text-[#e2e8f0] font-sans">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-[#161b22] p-5 rounded-2xl border border-[#30363d] shadow-sm">
        <div>
          <h2 className="text-xl font-extrabold text-white flex items-center gap-2">
            <Users className="w-6 h-6 text-cyan-400" />
            Customer Profiles & Account Ledger
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Manage customer credit accounts, advance deposits, loyalty points, and view customer purchase history.
          </p>
        </div>

        <button
          onClick={() => setIsNewCustomerModalOpen(true)}
          className="py-2.5 px-4 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs uppercase tracking-wider shadow-md shadow-cyan-900/30 transition flex items-center gap-2 border border-cyan-500"
        >
          <Plus className="w-4 h-4" />
          Add New Customer
        </button>
      </div>

      {/* Main Split Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* LEFT PANEL */}
        <div className="lg:col-span-5 flex flex-col bg-[#161b22] rounded-2xl border border-[#30363d] shadow-sm overflow-hidden">
          <div className="bg-[#0d1117] p-3 border-b border-[#30363d] flex items-center justify-between">
            <h3 className="font-extrabold text-xs text-slate-200 uppercase tracking-wider">
              Customer Profile List
            </h3>
            <div className="relative w-40">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-2 text-slate-400" />
              <input
                type="text"
                placeholder="Search phone or name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-2 py-1 rounded-md border border-[#30363d] bg-[#161b22] text-[11px] text-white outline-none focus:border-cyan-500"
              />
            </div>
          </div>

          <div className="overflow-x-auto flex-1 min-h-[320px]">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-[#0d1117] text-slate-400 font-bold uppercase text-[10px] tracking-wide border-b border-[#30363d]">
                  <th className="py-2.5 px-3">Full Name</th>
                  <th className="py-2.5 px-3">Phone No</th>
                  <th className="py-2.5 px-3">Address</th>
                  <th className="py-2.5 px-3 text-right">Balance</th>
                  <th className="py-2.5 px-3 text-right">Point</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#30363d]">
                {filteredCustomers.map((c) => {
                  let isSelected = c.id === selectedCustomerId;
                  return (
                    <tr
                      key={c.id}
                      onClick={() => setSelectedCustomerId(c.id)}
                      className={`cursor-pointer transition text-[11px] font-medium ${
                        isSelected
                          ? 'bg-cyan-950/80 text-cyan-300 font-bold border-l-4 border-cyan-400'
                          : 'hover:bg-[#21262d] text-slate-200'
                      }`}
                    >
                      <td className="py-2.5 px-3">{c.fullName}</td>
                      <td className="py-2.5 px-3">{c.phone}</td>
                      <td className="py-2.5 px-3 truncate max-w-[80px] text-slate-400">{c.address}</td>
                      <td className={`py-2.5 px-3 text-right ${
                        isSelected ? 'text-cyan-300' : c.balance > 0 ? 'text-red-400 font-bold' : 'text-emerald-400'
                      }`}>
                        {c.balance.toLocaleString()}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-slate-400">
                        {c.points.toLocaleString()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="bg-[#0d1117] p-3 border-t border-[#30363d] font-black text-sm text-white flex justify-between">
            <span>Total Balance:</span>
            <span className="text-cyan-400">{formatNaira(totalAllBalances)}</span>
          </div>
        </div>

        {/* RIGHT PANEL */}
        <div className="lg:col-span-7 flex flex-col bg-[#161b22] rounded-2xl border border-[#30363d] shadow-sm overflow-hidden">
          <div className="bg-[#0d1117] p-3 border-b border-[#30363d] flex items-center justify-between">
            <div>
              <h3 className="font-extrabold text-xs text-slate-200 uppercase tracking-wider">
                Sales Details: {selectedCustomer?.fullName || 'Select Customer'}
              </h3>
              <p className="text-[10px] text-slate-400">
                Phone: {selectedCustomer?.phone} • Points: {selectedCustomer?.points.toLocaleString()}
              </p>
            </div>

            {selectedCustomer && (
              <button
                onClick={() => setIsDepositModalOpen(true)}
                className="py-1.5 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition flex items-center gap-1 border border-emerald-500 shadow-md"
              >
                <DollarSign className="w-3.5 h-3.5" />
                Pay Due / Add Deposit
              </button>
            )}
          </div>

          <div className="overflow-x-auto flex-1 min-h-[320px]">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-[#0d1117] text-slate-400 font-bold uppercase text-[10px] border-b border-[#30363d]">
                  <th className="py-2.5 px-3">Sales ID</th>
                  <th className="py-2.5 px-3 text-right">Amount (₦)</th>
                  <th className="py-2.5 px-3 text-right">Advance (₦)</th>
                  <th className="py-2.5 px-3 text-right">Balance (₦)</th>
                  <th className="py-2.5 px-3 text-right">Point</th>
                  <th className="py-2.5 px-3 text-center">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#30363d]">
                {customerSales.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-slate-500">
                      No sales records found for this customer.
                    </td>
                  </tr>
                ) : (
                  customerSales.map((s) => (
                    <tr key={s.id} className="hover:bg-[#21262d] transition font-medium text-slate-200">
                      <td className="py-2.5 px-3 font-bold text-cyan-400">{s.receiptNo}</td>
                      <td className="py-2.5 px-3 text-right font-extrabold text-white">{s.totalAmount.toLocaleString()}</td>
                      <td className="py-2.5 px-3 text-right text-emerald-400 font-semibold">{s.advancePayment.toLocaleString()}</td>
                      <td className="py-2.5 px-3 text-right text-red-400 font-bold">{s.balanceDue.toLocaleString()}</td>
                      <td className="py-2.5 px-3 text-right font-mono text-slate-400">+{s.pointsEarned}</td>
                      <td className="py-2.5 px-3 text-center text-slate-400 text-[11px]">{s.date}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* New Customer Modal */}
      {isNewCustomerModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm bg-[#161b22] border border-[#30363d] rounded-xl shadow-2xl p-5 text-slate-200">
            <div className="bg-[#0d1117] -mx-5 -mt-5 p-3 rounded-t-xl text-center border-b border-[#30363d] font-extrabold text-sm uppercase text-white">
              New Customer Profile
            </div>

            <form onSubmit={handleCreateCustomer} className="space-y-3 mt-4 text-xs font-bold">
              <div>
                <label className="block text-slate-300 mb-1">Full Name:</label>
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full rounded border border-[#30363d] px-2.5 py-1.5 bg-[#0d1117] text-white outline-none focus:border-cyan-500"
                />
              </div>

              <div>
                <label className="block text-slate-300 mb-1">Phone No:</label>
                <input
                  type="text"
                  required
                  value={phoneNo}
                  onChange={(e) => setPhoneNo(e.target.value)}
                  className="w-full rounded border border-[#30363d] px-2.5 py-1.5 bg-[#0d1117] text-white outline-none focus:border-cyan-500"
                />
              </div>

              <div>
                <label className="block text-slate-300 mb-1">Address:</label>
                <input
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="w-full rounded border border-[#30363d] px-2.5 py-1.5 bg-[#0d1117] text-white outline-none focus:border-cyan-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setIsNewCustomerModalOpen(false)}
                  className="py-2 bg-[#21262d] border border-[#30363d] hover:bg-[#30363d] text-slate-300 font-extrabold rounded text-xs transition uppercase"
                >
                  Close
                </button>
                <button
                  type="submit"
                  className="py-2 bg-cyan-600 hover:bg-cyan-500 text-white font-extrabold rounded text-xs transition uppercase shadow-md border border-cyan-500"
                >
                  Submit
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Deposit Modal */}
      {isDepositModalOpen && selectedCustomer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm bg-[#161b22] border border-[#30363d] rounded-xl shadow-2xl p-5 text-slate-200">
            <h3 className="font-bold text-sm text-white mb-2">
              Receive Payment for {selectedCustomer.fullName}
            </h3>
            <p className="text-xs text-slate-400 mb-4">
              Current Due Balance: <strong className="text-red-400">{formatNaira(selectedCustomer.balance)}</strong>
            </p>

            <form onSubmit={handleProcessDeposit} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-300 mb-1">
                  Payment Amount Received (₦):
                </label>
                <input
                  type="number"
                  min="1"
                  required
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(parseFloat(e.target.value) || 0)}
                  className="w-full rounded border border-[#30363d] px-3 py-2 bg-[#0d1117] font-black text-sm text-cyan-400 outline-none focus:border-cyan-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsDepositModalOpen(false)}
                  className="py-2 px-4 bg-[#21262d] border border-[#30363d] text-slate-300 font-bold rounded text-xs hover:bg-[#30363d] transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="py-2 px-4 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded text-xs shadow border border-emerald-500 transition"
                >
                  Record Payment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
