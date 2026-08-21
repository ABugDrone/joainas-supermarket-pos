import React from 'react';
import { Users, Plus, Search, DollarSign, Lock, Building2, User as UserIcon, Globe } from 'lucide-react';
import { Customer, SaleRecord, UserRole, User, CustomerAccountType } from '../types';
import { formatNaira, recordAuditLog } from '../utils/storage';
import { can } from '../utils/permissions';
import { useToast } from './Toast';

interface CustomerModuleProps {
  customers: Customer[];
  sales: SaleRecord[];
  currentUser: string;
  currentUserRole: UserRole;
  currentUserCapabilities: User['capabilities'];
  onAddCustomer: (customer: Customer) => void;
  onUpdateCustomerBalance: (customerId: string, amountPaid: number) => void;
}

const ACCOUNT_TYPE_LABELS: Record<CustomerAccountType, { label: string; icon: React.ElementType; color: string }> = {
  individual: { label: 'Individual', icon: UserIcon, color: 'bg-cyan-950 text-cyan-400 border-cyan-800' },
  company: { label: 'Company', icon: Building2, color: 'bg-blue-950 text-blue-400 border-blue-800' },
  ngo: { label: 'NGO', icon: Globe, color: 'bg-emerald-950 text-emerald-400 border-emerald-800' },
  government: { label: 'Government', icon: Building2, color: 'bg-amber-950 text-amber-400 border-amber-800' },
};

export const CustomerModule: React.FC<CustomerModuleProps> = ({
  customers,
  sales,
  currentUser,
  currentUserRole,
  currentUserCapabilities,
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
  const [accountType, setAccountType] = React.useState<CustomerAccountType>('individual');
  const [phoneNo, setPhoneNo] = React.useState('');
  const [address, setAddress] = React.useState('');

  // Form state for deposit/payment
  const [paymentAmount, setPaymentAmount] = React.useState<number>(0);

  // A non-admin may only see customers they registered or served.
  const isViewerAdmin = can({ capabilities: currentUserCapabilities }, 'admin');
  const canAccessCustomer = (c: Customer): boolean => {
    if (isViewerAdmin) return true;
    if (c.assignedCashier === currentUser) return true;
    return sales.some((s) => s.customerId === c.id && s.cashier === currentUser);
  };

  const visibleCustomers = React.useMemo(
    () => customers.filter(canAccessCustomer),
    [customers, sales, isViewerAdmin, currentUser]
  );

  const selectedCustomer = React.useMemo(() => {
    return visibleCustomers.find((c) => c.id === selectedCustomerId) || visibleCustomers[0];
  }, [visibleCustomers, selectedCustomerId]);

  const filteredCustomers = React.useMemo(() => {
    return visibleCustomers.filter(
      (c) =>
        c.fullName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (c.phone || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.address.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [visibleCustomers, searchQuery]);

  const customerSales = React.useMemo(() => {
    if (!selectedCustomer) return [];
    return sales.filter(
      (s) => s.customerId === selectedCustomer.id || (selectedCustomer.phone && s.customerPhone === selectedCustomer.phone)
    );
  }, [sales, selectedCustomer]);

  const totalAllBalances = React.useMemo(() => {
    return visibleCustomers.reduce((sum, c) => sum + c.balance, 0);
  }, [visibleCustomers]);

  const handleCreateCustomer = (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim()) {
      showToast('Please enter the customer / company name.', 'error');
      return;
    }

    let newCust: Customer = {
      id: `cust-${Date.now()}`,
      fullName: fullName.trim(),
      accountType,
      phone: phoneNo.trim() || undefined, // phone is optional (security friendly)
      address: address.trim() || 'Yola',
      balance: 0,
      points: 0,
      advancePayment: 0,
      assignedCashier: currentUser,
      createdAt: new Date().toISOString().split('T')[0],
    };

    onAddCustomer(newCust);
    setSelectedCustomerId(newCust.id);

    recordAuditLog(
      currentUser,
      currentUserRole,
      'Added New Customer Account',
      `Registered ${ACCOUNT_TYPE_LABELS[accountType].label} profile for "${newCust.fullName}"${newCust.phone ? ` (${newCust.phone})` : ''}.`
    );
    showToast(`Registered new customer profile for "${newCust.fullName}".`, 'success');

    setFullName('');
    setAccountType('individual');
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
            Manage customer credit accounts and advance deposits, and view customer purchase history.
            {!isViewerAdmin && ' You can only view the customers you registered or served.'}
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
                  <th className="py-2.5 px-3 text-center">Owner</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#30363d]">
                {filteredCustomers.map((c) => {
                  let isSelected = c.id === selectedCustomerId;
                  const typeInfo = ACCOUNT_TYPE_LABELS[c.accountType] || ACCOUNT_TYPE_LABELS.individual;
                  const owned = canAccessCustomer(c);
                  return (
                    <tr
                      key={c.id}
                      onClick={() => {
                        if (owned) setSelectedCustomerId(c.id);
                        else showToast('This customer belongs to another staff member.', 'error');
                      }}
                      className={`cursor-pointer transition text-[11px] font-medium ${
                        isSelected
                          ? 'bg-cyan-950/80 text-cyan-300 font-bold border-l-4 border-cyan-400'
                          : 'hover:bg-[#21262d] text-slate-200'
                      }`}
                    >
                      <td className="py-2.5 px-3">
                        <span className="flex items-center gap-1.5">
                          {!owned && !isViewerAdmin && <Lock className="w-3 h-3 text-slate-500" />}
                          {c.fullName}
                        </span>
                        <span className={`inline-flex items-center gap-0.5 mt-0.5 px-1.5 py-0.5 rounded border text-[8px] font-black uppercase tracking-wide ${typeInfo.color}`}>
                          <typeInfo.icon className="w-2.5 h-2.5" />
                          {typeInfo.label}
                        </span>
                      </td>
                      <td className="py-2.5 px-3">{c.phone || '—'}</td>
                      <td className="py-2.5 px-3 truncate max-w-[80px] text-slate-400">{c.address}</td>
                      <td className={`py-2.5 px-3 text-right ${
                        isSelected ? 'text-cyan-300' : c.balance > 0 ? 'text-red-400 font-bold' : 'text-emerald-400'
                      }`}>
                        {c.balance.toLocaleString()}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        {owned ? (
                          <span className="text-[9px] font-bold text-slate-500">{isViewerAdmin ? 'All' : 'Mine'}</span>
                        ) : (
                          <Lock className="w-3.5 h-3.5 text-slate-500 inline-block" />
                        )}
                      </td>
                    </tr>
                  );
                })}
                {filteredCustomers.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-12 text-center text-slate-500">
                      No customers found.
                    </td>
                  </tr>
                )}
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
                Phone: {selectedCustomer?.phone || 'N/A'}
              </p>
            </div>

            {selectedCustomer && canAccessCustomer(selectedCustomer) && (
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
                  <th className="py-2.5 px-3 text-center">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#30363d]">
                {customerSales.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-12 text-center text-slate-500">
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
                <label className="block text-slate-300 mb-1">Account Type:</label>
                <select
                  value={accountType}
                  onChange={(e) => setAccountType(e.target.value as CustomerAccountType)}
                  className="w-full rounded border border-[#30363d] px-2.5 py-1.5 bg-[#0d1117] text-white outline-none focus:border-cyan-500"
                >
                  <option value="individual">Individual Person</option>
                  <option value="company">Company / Business</option>
                  <option value="ngo">NGO / Non-Profit</option>
                  <option value="government">Government / MDA</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-300 mb-1">
                  {accountType === 'individual' ? 'Full Name:' : 'Company / Organisation Name:'}
                </label>
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full rounded border border-[#30363d] px-2.5 py-1.5 bg-[#0d1117] text-white outline-none focus:border-cyan-500"
                />
              </div>

              <div>
                <label className="block text-slate-300 mb-1">
                  Phone No: <span className="text-slate-500 font-normal">(optional)</span>
                </label>
                <input
                  type="text"
                  value={phoneNo}
                  onChange={(e) => setPhoneNo(e.target.value)}
                  placeholder="Optional — can be left blank"
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
