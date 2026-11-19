import React from 'react';
import { Users, Plus, Search, Phone, Pencil, Trash2, X, ReceiptText, Wallet, AlertTriangle } from 'lucide-react';
import { Customer, SaleRecord, UserRole, User, CustomerAccountType, InstallmentContract, MicroPayment, DebtEntry } from '../types';
import { formatNaira, recordAuditLog, loadContracts, loadMicroPayments, saveContracts,
  recordMicroPayment, deleteMicroPayment, setMicroRemitted, setContractDownRemitted,
  clearDemoLedgerData, saveCustomers, loadCustomers,
} from '../utils/storage';
import { useCurrency } from '../hooks/useCurrency';
import { can } from '../utils/permissions';
import { useToast } from './Toast';
import { NumberInput } from './NumberInput';

interface CustomerModuleProps {
  customers: Customer[];
  sales: SaleRecord[];
  currentUser: string;
  currentUserRole: UserRole;
  currentUserCapabilities: User['capabilities'];
  onAddCustomer: (customer: Customer) => void;
  onUpdateCustomerBalance: (customerId: string, amountPaid: number) => void;
  onCustomersChanged?: (customers: Customer[]) => void;
  /** v2.0.8 debt notebook */
  debtEntries?: DebtEntry[];
  onAddDebtEntry?: (entry: DebtEntry) => void;
  onSettleCustomerDebt?: (customerId: string, settled: boolean) => void;
}

type FilterChip = 'all' | 'active' | 'completed';

export const CustomerModule: React.FC<CustomerModuleProps> = ({
  customers,
  sales,
  currentUser,
  currentUserRole,
  currentUserCapabilities,
  onAddCustomer,
  onUpdateCustomerBalance,
  onCustomersChanged,
  debtEntries = [],
  onAddDebtEntry,
  onSettleCustomerDebt,
}) => {
  const { showToast } = useToast();
  const { symbol: curSym } = useCurrency();

  const [contracts, setContracts] = React.useState<InstallmentContract[]>(() => loadContracts() as InstallmentContract[]);
  const [payments, setPayments] = React.useState<MicroPayment[]>(() => loadMicroPayments() as MicroPayment[]);
  const refreshLedger = React.useCallback(() => {
    setContracts(loadContracts() as InstallmentContract[]);
    setPayments(loadMicroPayments() as MicroPayment[]);
  }, []);
  React.useEffect(() => {
    refreshLedger();
    const h = () => refreshLedger();
    window.addEventListener('ledger-changed', h);
    window.addEventListener('storage-ready', h);
    return () => { window.removeEventListener('ledger-changed', h); window.removeEventListener('storage-ready', h); };
  }, [refreshLedger]);
  const emitLedger = () => window.dispatchEvent(new Event('ledger-changed'));

  const [searchQuery, setSearchQuery] = React.useState('');
  const [chip, setChip] = React.useState<FilterChip>('all');
  const [drawerCustomerId, setDrawerCustomerId] = React.useState<string | null>(null);
  const [isNewCustomerModalOpen, setIsNewCustomerModalOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Customer | null>(null);
  const [showClearConfirm, setShowClearConfirm] = React.useState(false);

  // customer form
  const [fullName, setFullName] = React.useState('');
  const [accountType, setAccountType] = React.useState<CustomerAccountType>('individual');
  const [phoneNo, setPhoneNo] = React.useState('');
  const [address, setAddress] = React.useState('');
  const [nin, setNin] = React.useState('');
  const [bvn, setBvn] = React.useState('');

  // contract form
  const [showContractModal, setShowContractModal] = React.useState(false);
  const [contractCustomerId, setContractCustomerId] = React.useState('');
  const [productLabel, setProductLabel] = React.useState('');
  const [totalPrice, setTotalPrice] = React.useState(0);
  const [downPayment, setDownPayment] = React.useState(0);
  const [dueDate, setDueDate] = React.useState('');

  // cash collection
  const [collectContractId, setCollectContractId] = React.useState<string | null>(null);
  const [collectAmount, setCollectAmount] = React.useState(0);
  const [collectNote, setCollectNote] = React.useState('');
  const [collectRemitted, setCollectRemitted] = React.useState(false);

  // v2.0.8 debt notebook form
  const [showDebtModal, setShowDebtModal] = React.useState(false);
  const [debtCustomerId, setDebtCustomerId] = React.useState('');
  const [debtKind, setDebtKind] = React.useState<'charge' | 'payment'>('charge');
  const [debtSource, setDebtSource] = React.useState<'sale' | 'cash' | 'manual'>('manual');
  const [debtAmount, setDebtAmount] = React.useState(0);
  const [debtNote, setDebtNote] = React.useState('');
  const [debtSettlementDate, setDebtSettlementDate] = React.useState('');
  const [previewCustomerId, setPreviewCustomerId] = React.useState<string | null>(null);

  const isViewerAdmin = can({ capabilities: currentUserCapabilities }, 'admin');
  const canAccessCustomer = (c: Customer): boolean => {
    if (isViewerAdmin) return true;
    if (c.assignedCashier === currentUser) return true;
    return sales.some((s) => s.customerId === c.id && s.cashier === currentUser);
  };
  const visibleCustomers = React.useMemo(() => customers.filter(canAccessCustomer), [customers, sales, isViewerAdmin, currentUser]);

  const contractsByCustomer = React.useMemo(() => {
    const m = new Map<string, InstallmentContract[]>();
    contracts.forEach((c) => {
      const l = m.get(c.customerId) || [];
      l.push(c);
      m.set(c.customerId, l);
    });
    return m;
  }, [contracts]);
  const paymentsByContract = React.useMemo(() => {
    const m = new Map<string, MicroPayment[]>();
    payments.forEach((p) => {
      const l = m.get(p.contractId) || [];
      l.push(p);
      m.set(p.contractId, l);
    });
    m.forEach((l) => l.sort((a, b) => a.collectedAt - b.collectedAt));
    return m;
  }, [payments]);

  const customerStatus = (id: string): 'none' | 'INSTALLMENT_ACTIVE' | 'COMPLETED' => {
    const list = contractsByCustomer.get(id) || [];
    if (!list.length) return 'none';
    if (list.every((c) => c.status === 'COMPLETED')) return 'COMPLETED';
    return 'INSTALLMENT_ACTIVE';
  };

  const filtered = React.useMemo(() => {
    const q = searchQuery.toLowerCase();
    return visibleCustomers.filter((c) => {
      const matchQ = !q || c.fullName.toLowerCase().includes(q) || (c.phone || '').toLowerCase().includes(q);
      if (!matchQ) return false;
      if (chip === 'all') return true;
      const st = customerStatus(c.id);
      return chip === 'active' ? st === 'INSTALLMENT_ACTIVE' : st === 'COMPLETED';
    });
  }, [visibleCustomers, searchQuery, chip, contracts]);

  const totals = (id: string) => {
    const list = contractsByCustomer.get(id) || [];
    const totalContract = list.reduce((s, c) => s + (c.totalPrice || 0), 0);
    const totalPaid = list.reduce((s, c) => s + (c.totalPaid || 0), 0);
    const pending = list.reduce((s, c) => s + (c.pendingBalance || 0), 0);
    return { totalContract, totalPaid, pending, count: list.length };
  };

  const debtEntriesByCustomer = React.useMemo(() => {
    const m = new Map<string, DebtEntry[]>();
    debtEntries.forEach((e) => {
      const l = m.get(e.customerId) || [];
      l.push(e);
      m.set(e.customerId, l);
    });
    m.forEach((l) => l.sort((a, b) => a.timestamp - b.timestamp));
    return m;
  }, [debtEntries]);

  const customersWithDebt = React.useMemo(
    () => visibleCustomers.filter((c) => c.balance > 0.005),
    [visibleCustomers]
  );

  const openDebtModal = (kind: 'charge' | 'payment', customerId?: string) => {
    setDebtKind(kind);
    setDebtCustomerId(customerId || previewCustomerId || visibleCustomers[0]?.id || '');
    setDebtSource(kind === 'payment' ? 'cash' : 'manual');
    setDebtAmount(0);
    setDebtNote('');
    setDebtSettlementDate('');
    setShowDebtModal(true);
  };

  const handleSaveDebtEntry = (e: React.FormEvent) => {
    e.preventDefault();
    if (!onAddDebtEntry) { showToast('Debt notebook is unavailable.', 'error'); return; }
    if (!debtCustomerId) { showToast('Select a customer.', 'error'); return; }
    if (debtAmount <= 0) { showToast('Enter an amount greater than zero.', 'error'); return; }
    const now = new Date();
    const entry: DebtEntry = {
      id: `debt-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      customerId: debtCustomerId,
      kind: debtKind,
      amount: debtAmount,
      source: debtSource,
      note: debtNote.trim() || undefined,
      date: now.toLocaleDateString('en-CA'),
      time: now.toLocaleTimeString('en-GB'),
      timestamp: now.getTime(),
      settlementDate: debtSettlementDate || undefined,
      settled: false,
      createdBy: currentUser,
    };
    onAddDebtEntry(entry);
    recordAuditLog(
      currentUser,
      currentUserRole,
      debtKind === 'charge' ? 'Added Customer Debt' : 'Recorded Debt Payment',
      `${debtKind === 'charge' ? 'Charged' : 'Collected'} ${formatNaira(debtAmount)} (${debtSource}) for ${visibleCustomers.find((c) => c.id === debtCustomerId)?.fullName}.`
    );
    showToast(debtKind === 'charge' ? 'Debt added (red +).' : 'Payment recorded (green −).', 'success');
    setShowDebtModal(false);
  };

  const handleSettle = (c: Customer) => {
    if (!onSettleCustomerDebt) return;
    if (!window.confirm(`Mark ALL outstanding debt for "${c.fullName}" as settled? This clears their debt reminder.`)) return;
    onSettleCustomerDebt(c.id, true);
    recordAuditLog(currentUser, currentUserRole, 'Settled Customer Debt', `${c.fullName} — balance ${formatNaira(c.balance)} settled (crossed off).`);
    showToast(`Debt for ${c.fullName} crossed off.`, 'success');
  };

  const openNew = () => {
    setEditing(null); setFullName(''); setAccountType('individual'); setPhoneNo(''); setAddress(''); setNin(''); setBvn('');
    setIsNewCustomerModalOpen(true);
  };
  const openEdit = (c: Customer) => {
    if (c.isGeneral || c.id === 'cust-general') {
      showToast('GENERAL CUSTOMER is the built-in walk-in account and cannot be renamed.', 'error');
      return;
    }
    setEditing(c); setFullName(c.fullName); setAccountType(c.accountType); setPhoneNo(c.phone || ''); setAddress(c.address); setNin(c.nin || ''); setBvn(c.bvn || '');
    setIsNewCustomerModalOpen(true);
  };

  const handleSaveCustomer = (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim()) { showToast('Please enter the customer name.', 'error'); return; }
    if (editing) {
      const updated = customers.map((c) => c.id === editing.id ? { ...c, fullName: fullName.trim(), accountType, phone: phoneNo.trim() || undefined, address: address.trim() || 'Yola', nin: nin.trim() || undefined, bvn: bvn.trim() || undefined } : c);
      saveCustomers(updated);
      onCustomersChanged?.(updated);
      recordAuditLog(currentUser, currentUserRole, 'Edited Customer Profile', `Updated profile for "${fullName.trim()}".`);
      showToast('Customer profile updated.', 'success');
    } else {
      const nc: Customer = { id: `cust-${Date.now()}`, fullName: fullName.trim(), accountType, phone: phoneNo.trim() || undefined, address: address.trim() || 'Yola', nin: nin.trim() || undefined, bvn: bvn.trim() || undefined, balance: 0, points: 0, advancePayment: 0, assignedCashier: currentUser, createdAt: new Date().toISOString().split('T')[0] };
      onAddCustomer(nc);
      recordAuditLog(currentUser, currentUserRole, 'Added New Customer Account', `Registered "${nc.fullName}".`);
      showToast(`Registered "${nc.fullName}".`, 'success');
    }
    setIsNewCustomerModalOpen(false);
  };

  const handleDeleteCustomer = (c: Customer) => {
    if (c.isGeneral || c.id === 'cust-general') {
      showToast('GENERAL CUSTOMER is the built-in walk-in account and cannot be deleted.', 'error');
      return;
    }
    if (!window.confirm(`Delete customer "${c.fullName}" and their contracts? This cannot be undone.`)) return;
    const updated = customers.filter((x) => x.id !== c.id);
    saveCustomers(updated);
    onCustomersChanged?.(updated);
    const keptContracts = contracts.filter((x) => x.customerId !== c.id);
    saveContracts(keptContracts);
    refreshLedger(); emitLedger();
    recordAuditLog(currentUser, currentUserRole, 'Deleted Customer Profile', `Deleted "${c.fullName}".`);
    showToast('Customer deleted.', 'success');
    if (drawerCustomerId === c.id) setDrawerCustomerId(null);
  };

  const handleClearDemo = async () => {
    setShowClearConfirm(false);
    await clearDemoLedgerData();
    try {
      const fresh = loadCustomers();
      onCustomersChanged?.(fresh);
    } catch {}
    refreshLedger(); emitLedger();
    showToast('Demo ledger data cleared. Ready for real customers.', 'success');
  };

  const openContractModal = (customerId: string) => {
    setContractCustomerId(customerId); setProductLabel(''); setTotalPrice(0); setDownPayment(0); setDueDate('');
    setShowContractModal(true);
  };
  const handleSaveContract = (e: React.FormEvent) => {
    e.preventDefault();
    if (!contractCustomerId || !productLabel.trim() || totalPrice <= 0) { showToast('Enter product/service, total price.', 'error'); return; }
    if (downPayment < 0 || downPayment > totalPrice) { showToast('Down payment must be 0..total.', 'error'); return; }
    const pending = Math.max(0, totalPrice - downPayment);
    const nc: InstallmentContract = {
      id: `ctr-${Date.now()}`, customerId: contractCustomerId,
      contractCode: `CTR-${new Date().getFullYear()}-${String(contracts.length + 1).padStart(4, '0')}`,
      productLabel: productLabel.trim(), purchaseDate: new Date().toISOString().split('T')[0],
      totalPrice, downPayment, totalPaid: downPayment, pendingBalance: pending,
      status: pending <= 0.005 ? 'COMPLETED' : 'INSTALLMENT_ACTIVE',
      dueDate: dueDate || undefined, downRemitted: false, createdBy: currentUser,
      createdAt: new Date().toISOString(),
    };
    const next = [nc, ...contracts];
    setContracts(next); saveContracts(next);
    // legacy balance mirror for old reports
    onUpdateCustomerBalance(contractCustomerId, -pending);
    try { const fresh = loadCustomers(); onCustomersChanged?.(fresh); } catch {}
    refreshLedger(); emitLedger();
    recordAuditLog(currentUser, currentUserRole, 'Created Installment Contract', `${nc.contractCode} for ${nc.productLabel} @ ${formatNaira(totalPrice)}.`);
    showToast(`Contract ${nc.contractCode} created.`, 'success');
    setShowContractModal(false);
  };

  const handleCollect = async (e: React.FormEvent) => {
    e.preventDefault();
    const ctr = contracts.find((c) => c.id === collectContractId);
    if (!ctr || collectAmount <= 0) return;
    if (collectAmount > ctr.pendingBalance + 0.005) { showToast(`Amount exceeds pending ${formatNaira(ctr.pendingBalance)}.`, 'error'); return; }
    await recordMicroPayment({ contractId: ctr.id, customerId: ctr.customerId, amount: collectAmount, receiptNote: collectNote.trim() || undefined, remitted: collectRemitted, createdBy: currentUser });
    // keep legacy customer balance in sync (App state)
    onUpdateCustomerBalance(ctr.customerId, collectAmount);
    try { const fresh = loadCustomers(); onCustomersChanged?.(fresh); } catch {}
    refreshLedger(); emitLedger();
    recordAuditLog(currentUser, currentUserRole, 'Recorded Micro-Cash Collection', `${formatNaira(collectAmount)} for ${ctr.contractCode}.`);
    showToast(`Recorded ${formatNaira(collectAmount)}. Balance recalculated.`, 'success');
    setCollectContractId(null); setCollectAmount(0); setCollectNote(''); setCollectRemitted(false);
  };

  const handleDeletePayment = async (p: MicroPayment) => {
    if (!window.confirm(`Delete this ${formatNaira(p.amount)} collection? Balance will be refunded (increased).`)) return;
    await deleteMicroPayment(p.id);
    // refund legacy balance mirror
    onUpdateCustomerBalance(p.customerId, -p.amount);
    try { const fresh = loadCustomers(); onCustomersChanged?.(fresh); } catch {}
    refreshLedger(); emitLedger();
    recordAuditLog(currentUser, currentUserRole, 'Voided Micro-Payment', `Refunded ${formatNaira(p.amount)} (${p.id}).`);
    showToast('Payment deleted and balance refunded.', 'success');
  };

  const drawerCustomer = visibleCustomers.find((c) => c.id === drawerCustomerId) || null;
  const drawerContracts = drawerCustomer ? (contractsByCustomer.get(drawerCustomer.id) || []) : [];

  return (
    <div className="p-4 md:p-6 bg-[#0c0e12] min-h-[calc(100vh-140px)] space-y-5 text-[#e2e8f0]">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-[#161b22] p-5 rounded-2xl border border-[#30363d]">
        <div>
          <h2 className="text-xl font-extrabold text-white flex items-center gap-2"><Users className="w-6 h-6 text-cyan-400" />Customer Ledger &amp; Micro-Cash Tally</h2>
          <p className="text-xs text-slate-400 mt-1">Contracts in exact currency — Total Contract / Total Paid / Pending. Tap a card for the ledger drawer.</p>
          <div className="flex gap-2 mt-3 overflow-x-auto pb-1">
            {([['all', 'All Customers'], ['active', 'Active Installments'], ['completed', 'Completed Contracts']] as [FilterChip, string][]).map(([v, label]) => (
              <button key={v} onClick={() => setChip(v)} className={`px-3 py-1.5 rounded-full text-[11px] font-black border whitespace-nowrap ${chip === v ? 'bg-cyan-600 text-white border-cyan-400' : 'bg-[#0d1117] text-slate-300 border-[#30363d]'}`}>{label}</button>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setShowClearConfirm(true)} className="py-2.5 px-4 rounded-xl bg-[#21262d] border border-[#30363d] text-slate-300 font-bold text-xs uppercase hover:bg-[#30363d]">Clear All Demo Data</button>
          <button onClick={openNew} className="py-2.5 px-4 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs uppercase border border-cyan-500 flex items-center gap-2"><Plus className="w-4 h-4" />Add Customer</button>
        </div>
      </div>

      <div className="flex items-center gap-2 bg-[#161b22] border border-[#30363d] rounded-xl px-3 py-2">
        <Search className="w-4 h-4 text-slate-400" />
        <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Quick-search name or phone..." className="flex-1 bg-transparent outline-none text-sm text-white placeholder:text-slate-500" />
      </div>

      {/* v2.0.8 — DEBT NOTE (notebook-style credit ledger) */}
      <section className="bg-[#161b22] border border-[#30363d] rounded-2xl overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-b border-[#30363d]">
          <div>
            <h3 className="text-base font-extrabold text-white flex items-center gap-2">
              <Wallet className="w-5 h-5 text-amber-400" /> Debt Note
            </h3>
            <p className="text-[11px] text-slate-400 mt-1">
              Each line is a customer. <span className="text-emerald-400 font-bold">Green −</span> = paying off debt (cross off when full).{' '}
              <span className="text-red-400 font-bold">Red +</span> = debt added (sale or cash).
            </p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => openDebtModal('payment')} className="px-3 py-2 rounded-lg bg-emerald-950/50 border border-emerald-700/60 text-emerald-300 text-xs font-bold hover:bg-emerald-900/50">− Record Payment</button>
            <button onClick={() => openDebtModal('charge')} className="px-3 py-2 rounded-lg bg-red-950/50 border border-red-700/60 text-red-300 text-xs font-bold hover:bg-red-900/50">+ Add Debt</button>
          </div>
        </div>

        {/* Ledger banner — overdue / due-today settlements stay red until settled */}
        {(() => {
          const today = new Date().toLocaleDateString('en-CA');
          const due = customersWithDebt.filter((c) => c.settlementDate && c.settlementDate <= today);
          if (due.length === 0) return null;
          return (
            <div className="mx-4 mt-3 rounded-lg border border-red-700/60 bg-red-950/30 px-4 py-2.5 flex items-center gap-2 text-red-300 text-xs font-bold">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>
                {due.length} customer{due.length > 1 ? 's' : ''} due for collection:{' '}
                {due.map((c) => c.fullName).join(', ')}. Settlement date reached — collect or cross off.
              </span>
            </div>
          );
        })()}

        <div className="divide-y divide-[#21262d]">
          {customersWithDebt.length === 0 && (
            <div className="px-5 py-8 text-center text-slate-500 text-sm">
              No outstanding debts. Everyone is clear. 🎉
            </div>
          )}
          {customersWithDebt.map((c) => {
            const entries = debtEntriesByCustomer.get(c.id) || [];
            const today = new Date().toLocaleDateString('en-CA');
            const isDue = !!c.settlementDate && c.settlementDate <= today;
            const isPreview = previewCustomerId === c.id;
            return (
              <div key={c.id}>
                <div className="px-4 py-3 flex items-center gap-3 hover:bg-[#1c2128] transition">
                  <button
                    onClick={() => setPreviewCustomerId(isPreview ? null : c.id)}
                    className="min-w-0 flex-1 text-left"
                    title="Preview this customer's debt payments & receipts"
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-white truncate">{c.fullName}</span>
                      {c.isGeneral && <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-slate-700 text-slate-300">WALK-IN</span>}
                      {isDue && <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-red-900 text-red-200 animate-pulse">DUE</span>}
                    </div>
                    <div className="text-[10px] text-slate-400">
                      Outstanding balance: <span className="text-red-400 font-black">{formatNaira(c.balance)}</span>
                      {c.settlementDate ? ` · Settle by ${c.settlementDate}` : ''} · {entries.length} note line(s) {isPreview ? '▴' : '▾'}
                    </div>
                  </button>
                  <button
                    onClick={() => openDebtModal('payment', c.id)}
                    className="shrink-0 w-8 h-8 rounded-full bg-emerald-950/60 border border-emerald-600/60 text-emerald-400 font-black text-lg hover:bg-emerald-900/60"
                    title="Green − : this customer is paying off their debt"
                  >−</button>
                  <button
                    onClick={() => openDebtModal('charge', c.id)}
                    className="shrink-0 w-8 h-8 rounded-full bg-red-950/60 border border-red-600/60 text-red-400 font-black text-lg hover:bg-red-900/60"
                    title="Red + : add a new debt (sale or cash)"
                  >+</button>
                  <button
                    onClick={() => handleSettle(c)}
                    className="shrink-0 px-2 py-1 rounded border border-slate-600 text-slate-300 text-[10px] font-bold hover:border-emerald-500 hover:text-emerald-400"
                    title="Cross off — full payment, debt settled"
                  >Cross off</button>
                </div>
                {isPreview && (
                  <div className="px-4 pb-3">
                    <div className="rounded-lg bg-[#0d1117] border border-[#30363d] p-3">
                      <div className="text-[10px] font-black uppercase tracking-wide text-slate-400 mb-2">
                        Debt payments & receipts — {c.fullName}
                      </div>
                      {entries.length === 0 ? (
                        <div className="text-[11px] text-slate-500 text-center py-3">No debt lines recorded yet.</div>
                      ) : (
                        <div className="space-y-1.5 max-h-56 overflow-y-auto">
                          {entries.map((e) => (
                            <div key={e.id} className="flex items-center justify-between gap-2 text-[11px] border-b border-[#21262d] last:border-0 pb-1.5">
                              <div className="min-w-0">
                                <span className={e.kind === 'payment' ? 'text-emerald-400 font-black' : 'text-red-400 font-black'}>
                                  {e.kind === 'payment' ? '−' : '+'} {formatNaira(e.amount)}
                                </span>
                                <span className="text-slate-400 ml-2">
                                  {e.date} {e.time} · {e.source}
                                  {e.receiptNo ? ` · ${e.receiptNo}` : ''}
                                  {e.note ? ` · ${e.note}` : ''}
                                </span>
                                {e.settlementDate && (
                                  <span className="block text-[10px] text-amber-400">Settlement date: {e.settlementDate}</span>
                                )}
                              </div>
                              {e.kind === 'charge' && (
                                <span className={`shrink-0 text-[9px] font-black px-1.5 py-0.5 rounded ${e.settled ? 'bg-emerald-950 text-emerald-300' : 'bg-red-950 text-red-300'}`}>
                                  {e.settled ? 'SETTLED' : 'OPEN'}
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {filtered.map((c) => {
          const t = totals(c.id);
          const st = customerStatus(c.id);
          return (
            <button key={c.id} onClick={() => setDrawerCustomerId(c.id)} className="text-left bg-[#161b22] border border-[#30363d] hover:border-cyan-600 rounded-2xl p-4 transition shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-extrabold text-white truncate">{c.fullName}</div>
                  <div className="text-[11px] text-slate-400 truncate">{c.phone || 'No phone'} • {c.address}</div>
                  {(c.nin || c.bvn) && <div className="text-[10px] text-slate-500">NIN: {c.nin || '—'} • BVN: {c.bvn || '—'}</div>}
                </div>
                {st !== 'none' && (
                  <span className={`text-[9px] font-black px-2 py-1 rounded-full border whitespace-nowrap ${st === 'COMPLETED' ? 'bg-emerald-950 text-emerald-300 border-emerald-800' : 'bg-amber-950 text-amber-300 border-amber-800'}`}>{st}</span>
                )}
              </div>
              <div className="grid grid-cols-3 gap-2 mt-3 text-center">
                <div className="bg-[#0d1117] rounded-lg p-2 border border-[#30363d]"><div className="text-[9px] text-slate-500 font-bold uppercase">Total Contract</div><div className="text-xs font-black text-white">{t.totalContract.toLocaleString()}</div></div>
                <div className="bg-[#0d1117] rounded-lg p-2 border border-[#30363d]"><div className="text-[9px] text-slate-500 font-bold uppercase">Total Paid</div><div className="text-xs font-black text-cyan-300">{t.totalPaid.toLocaleString()}</div></div>
                <div className="bg-[#0d1117] rounded-lg p-2 border border-[#30363d]"><div className="text-[9px] text-slate-500 font-bold uppercase">Pending</div><div className={`text-xs font-black ${t.pending > 0 ? 'text-red-400' : 'text-emerald-400'}`}>{t.pending.toLocaleString()}</div></div>
              </div>
              <div className="text-[10px] text-slate-500 mt-2">{t.count} contract(s) • {curSym} exact • tap for ledger</div>
            </button>
          );
        })}
        {filtered.length === 0 && <div className="col-span-full text-center text-slate-500 py-12 text-sm">No customers found.</div>}
      </div>

      {/* Ledger drawer (bottom sheet) */}
      {drawerCustomer && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70" onClick={() => setDrawerCustomerId(null)}>
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-3xl max-h-[88vh] overflow-y-auto bg-[#161b22] border border-[#30363d] rounded-t-2xl p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-extrabold text-white text-lg">{drawerCustomer.fullName}</h3>
                <p className="text-xs text-slate-400">{drawerCustomer.phone || 'No phone'} • {drawerCustomer.address}</p>
                <p className="text-[11px] text-slate-500">NIN: {drawerCustomer.nin || '—'} • BVN: {drawerCustomer.bvn || '—'}</p>
              </div>
              <button onClick={() => setDrawerCustomerId(null)} className="p-2 rounded-lg bg-[#0d1117] border border-[#30363d] text-slate-300"><X className="w-4 h-4" /></button>
            </div>
            <div className="flex flex-wrap gap-2 mt-3">
              {drawerCustomer.phone && <a href={`tel:${drawerCustomer.phone}`} className="px-3 py-1.5 rounded-lg bg-cyan-950 border border-cyan-800 text-cyan-300 text-xs font-bold flex items-center gap-1"><Phone className="w-3.5 h-3.5" />Call</a>}
              <button onClick={() => { openEdit(drawerCustomer); }} className="px-3 py-1.5 rounded-lg bg-[#0d1117] border border-[#30363d] text-slate-200 text-xs font-bold flex items-center gap-1"><Pencil className="w-3.5 h-3.5" />Edit</button>
              <button onClick={() => handleDeleteCustomer(drawerCustomer)} className="px-3 py-1.5 rounded-lg bg-red-950/40 border border-red-800/50 text-red-300 text-xs font-bold flex items-center gap-1"><Trash2 className="w-3.5 h-3.5" />Delete</button>
              <button onClick={() => openContractModal(drawerCustomer.id)} className="px-3 py-1.5 rounded-lg bg-cyan-600 text-white text-xs font-bold flex items-center gap-1"><ReceiptText className="w-3.5 h-3.5" />New Contract / Sale</button>
            </div>

            <div className="space-y-4 mt-4">
              {drawerContracts.length === 0 && <div className="text-xs text-slate-500 bg-[#0d1117] border border-dashed border-[#30363d] rounded-xl p-4 text-center">No contracts yet — create one to start the installment tally.</div>}
              {drawerContracts.map((ctr) => {
                const list = paymentsByContract.get(ctr.id) || [];
                return (
                  <div key={ctr.id} className="bg-[#0d1117] border border-[#30363d] rounded-xl p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <div className="font-black text-white text-sm">{ctr.contractCode} • {ctr.productLabel}</div>
                        <div className="text-[11px] text-slate-400">Purchased {ctr.purchaseDate}{ctr.dueDate ? ` • Due ${ctr.dueDate}` : ''}</div>
                      </div>
                      <span className={`text-[10px] font-black px-2 py-1 rounded-full border ${ctr.status === 'COMPLETED' ? 'bg-emerald-950 text-emerald-300 border-emerald-800' : 'bg-amber-950 text-amber-300 border-amber-800'}`}>{ctr.status}</span>
                    </div>
                    <div className="grid grid-cols-3 gap-2 mt-3 text-center">
                      <div className="bg-[#161b22] rounded-lg p-2 border border-[#30363d]"><div className="text-[9px] text-slate-500 font-bold uppercase">Total Contract</div><div className="text-sm font-black text-white">{ctr.totalPrice.toLocaleString()}</div></div>
                      <div className="bg-[#161b22] rounded-lg p-2 border border-[#30363d]"><div className="text-[9px] text-slate-500 font-bold uppercase">Total Paid</div><div className="text-sm font-black text-cyan-300">{ctr.totalPaid.toLocaleString()}</div></div>
                      <div className="bg-[#161b22] rounded-lg p-2 border border-[#30363d]"><div className="text-[9px] text-slate-500 font-bold uppercase">Pending</div><div className={`text-sm font-black ${ctr.pendingBalance > 0 ? 'text-red-400' : 'text-emerald-400'}`}>{ctr.pendingBalance.toLocaleString()}</div></div>
                    </div>
                    <label className="flex items-center gap-2 mt-2 text-[11px] text-slate-300">
                      <input type="checkbox" checked={!!ctr.downRemitted} onChange={async (e) => { await setContractDownRemitted(ctr.id, e.target.checked); refreshLedger(); emitLedger(); }} className="w-4 h-4 accent-cyan-500" />
                      Down payment {formatNaira(ctr.downPayment)}: {ctr.downRemitted ? 'Remitted to Office' : 'Pending Office Transfer'}
                    </label>
                    <button onClick={() => { setCollectContractId(ctr.id); setCollectAmount(0); setCollectNote(''); setCollectRemitted(false); }} className="mt-3 w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black uppercase flex items-center justify-center gap-2"><Wallet className="w-4 h-4" />Record Daily Cash Collection</button>
                    <div className="mt-3 space-y-2">
                      {list.map((p) => (
                        <div key={p.id} className="flex items-center justify-between gap-2 bg-[#161b22] border border-[#30363d] rounded-lg px-3 py-2">
                          <div className="min-w-0">
                            <div className="text-xs font-black text-white">{p.amount.toLocaleString()} {curSym}</div>
                            <div className="text-[10px] text-slate-500">{new Date(p.collectedAt).toLocaleString()}{p.receiptNote ? ` • ${p.receiptNote}` : ''}</div>
                          </div>
                          <div className="flex items-center gap-2">
                            <button onClick={async () => { await setMicroRemitted(p.id, !p.remitted); refreshLedger(); emitLedger(); }} title="Toggle remittance" className={`text-[10px] font-black px-2 py-1 rounded-full border ${p.remitted ? 'bg-emerald-950 text-emerald-300 border-emerald-800' : 'bg-amber-950 text-amber-300 border-amber-800'}`}>{p.remitted ? 'Remitted' : 'Pending'}</button>
                            <button onClick={() => handleDeletePayment(p)} title="Delete + refund balance" className="p-1.5 rounded-lg bg-red-950/40 border border-red-800/50 text-red-300"><Trash2 className="w-3.5 h-3.5" /></button>
                          </div>
                        </div>
                      ))}
                      {list.length === 0 && <div className="text-[11px] text-slate-500">No micro-payments yet.</div>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Customer modal */}
      {isNewCustomerModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
          <div className="w-full max-w-sm bg-[#161b22] border border-[#30363d] rounded-xl p-5 max-h-[90vh] overflow-y-auto">
            <h3 className="font-extrabold text-sm uppercase text-white text-center">{editing ? 'Edit Customer' : 'New Customer Profile'}</h3>
            <form onSubmit={handleSaveCustomer} className="space-y-3 mt-4 text-xs font-bold">
              <div><label className="block text-slate-300 mb-1">Full Name:</label><input required value={fullName} onChange={(e) => setFullName(e.target.value)} className="w-full rounded border border-[#30363d] px-2.5 py-1.5 bg-[#0d1117] text-white outline-none" /></div>
              <div><label className="block text-slate-300 mb-1">Phone (optional):</label><input value={phoneNo} onChange={(e) => setPhoneNo(e.target.value)} className="w-full rounded border border-[#30363d] px-2.5 py-1.5 bg-[#0d1117] text-white outline-none" /></div>
              <div><label className="block text-slate-300 mb-1">Address:</label><input value={address} onChange={(e) => setAddress(e.target.value)} className="w-full rounded border border-[#30363d] px-2.5 py-1.5 bg-[#0d1117] text-white outline-none" /></div>
              <div className="grid grid-cols-2 gap-2">
                <div><label className="block text-slate-300 mb-1">NIN (optional):</label><input value={nin} onChange={(e) => setNin(e.target.value)} className="w-full rounded border border-[#30363d] px-2.5 py-1.5 bg-[#0d1117] text-white outline-none" /></div>
                <div><label className="block text-slate-300 mb-1">BVN (optional):</label><input value={bvn} onChange={(e) => setBvn(e.target.value)} className="w-full rounded border border-[#30363d] px-2.5 py-1.5 bg-[#0d1117] text-white outline-none" /></div>
              </div>
              <div className="grid grid-cols-2 gap-3 pt-2">
                <button type="button" onClick={() => setIsNewCustomerModalOpen(false)} className="py-2 bg-[#21262d] border border-[#30363d] text-slate-300 font-extrabold rounded text-xs uppercase">Close</button>
                <button type="submit" className="py-2 bg-cyan-600 text-white font-extrabold rounded text-xs uppercase border border-cyan-500">Submit</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Contract modal */}
      {showContractModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
          <div className="w-full max-w-sm bg-[#161b22] border border-[#30363d] rounded-xl p-5">
            <h3 className="font-extrabold text-sm uppercase text-white text-center">New Contract / Sale</h3>
            <form onSubmit={handleSaveContract} className="space-y-3 mt-4 text-xs font-bold">
              <div><label className="block text-slate-300 mb-1">Product / Service:</label><input required value={productLabel} onChange={(e) => setProductLabel(e.target.value)} placeholder="e.g. iPhone 13, Ankara sewing job" className="w-full rounded border border-[#30363d] px-2.5 py-1.5 bg-[#0d1117] text-white outline-none" /></div>
              <div><label className="block text-slate-300 mb-1">Total Contract Price ({curSym}):</label><NumberInput required min={1} value={totalPrice} onValueChange={setTotalPrice} className="w-full rounded border border-[#30363d] px-2.5 py-1.5 bg-[#0d1117] text-cyan-300 font-black outline-none" /></div>
              <div><label className="block text-slate-300 mb-1">Down Payment ({curSym}):</label><NumberInput min={0} value={downPayment} onValueChange={setDownPayment} className="w-full rounded border border-[#30363d] px-2.5 py-1.5 bg-[#0d1117] text-white outline-none" /></div>
              <div><label className="block text-slate-300 mb-1">Due Date (optional):</label><input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="w-full rounded border border-[#30363d] px-2.5 py-1.5 bg-[#0d1117] text-white outline-none" /></div>
              <div className="grid grid-cols-2 gap-3 pt-2">
                <button type="button" onClick={() => setShowContractModal(false)} className="py-2 bg-[#21262d] border border-[#30363d] text-slate-300 font-extrabold rounded text-xs uppercase">Close</button>
                <button type="submit" className="py-2 bg-cyan-600 text-white font-extrabold rounded text-xs uppercase">Create</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Collect modal */}
      {collectContractId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
          <div className="w-full max-w-sm bg-[#161b22] border border-[#30363d] rounded-xl p-5">
            <h3 className="font-bold text-sm text-white">Record Daily Cash Collection</h3>
            <form onSubmit={handleCollect} className="space-y-3 mt-3 text-xs">
              <div><label className="block font-bold text-slate-300 mb-1">Cash Amount ({curSym}):</label><NumberInput required min={1} value={collectAmount} onValueChange={setCollectAmount} className="w-full rounded border border-[#30363d] px-3 py-2 bg-[#0d1117] font-black text-cyan-300 outline-none" /></div>
              <div><label className="block font-bold text-slate-300 mb-1">Receipt / Notes:</label><input value={collectNote} onChange={(e) => setCollectNote(e.target.value)} placeholder="Receipt no / note" className="w-full rounded border border-[#30363d] px-3 py-2 bg-[#0d1117] text-white outline-none" /></div>
              <label className="flex items-center gap-2 text-slate-300 font-bold"><input type="checkbox" checked={collectRemitted} onChange={(e) => setCollectRemitted(e.target.checked)} className="w-4 h-4 accent-emerald-500" />Remitted to Office (else Pending Transfer)</label>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setCollectContractId(null)} className="py-2 px-4 bg-[#21262d] border border-[#30363d] text-slate-300 font-bold rounded text-xs">Cancel</button>
                <button type="submit" className="py-2 px-4 bg-emerald-600 text-white font-bold rounded text-xs border border-emerald-500">Record Payment</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* v2.0.8 — Debt note entry modal (charge / payment) */}
      {showDebtModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
          <div className="w-full max-w-sm bg-[#161b22] border border-[#30363d] rounded-xl p-5 max-h-[92vh] overflow-y-auto">
            <h3 className={`font-extrabold text-sm uppercase text-center ${debtKind === 'charge' ? 'text-red-400' : 'text-emerald-400'}`}>
              {debtKind === 'charge' ? '+ Add Debt (Red)' : '− Record Payment (Green)'}
            </h3>
            <form onSubmit={handleSaveDebtEntry} className="space-y-3 mt-4 text-xs font-bold">
              <div>
                <label className="block text-slate-300 mb-1">Customer:</label>
                <select value={debtCustomerId} onChange={(e) => setDebtCustomerId(e.target.value)} className="w-full rounded border border-[#30363d] px-2.5 py-1.5 bg-[#0d1117] text-white outline-none">
                  {visibleCustomers.map((c) => (
                    <option key={c.id} value={c.id} className="bg-[#161b22]">{c.fullName}{c.balance > 0 ? ` — owes ${formatNaira(c.balance)}` : ''}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-slate-300 mb-1">Type:</label>
                  <select value={debtKind} onChange={(e) => setDebtKind(e.target.value as 'charge' | 'payment')} className="w-full rounded border border-[#30363d] px-2.5 py-1.5 bg-[#0d1117] text-white outline-none">
                    <option value="charge" className="bg-[#161b22]">Debt added (red +)</option>
                    <option value="payment" className="bg-[#161b22]">Payment off debt (green −)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-slate-300 mb-1">Via:</label>
                  <select value={debtSource} onChange={(e) => setDebtSource(e.target.value as 'sale' | 'cash' | 'manual')} className="w-full rounded border border-[#30363d] px-2.5 py-1.5 bg-[#0d1117] text-white outline-none">
                    <option value="manual" className="bg-[#161b22]">Manual / other</option>
                    <option value="cash" className="bg-[#161b22]">Cash</option>
                    <option value="sale" className="bg-[#161b22]">Sale (credit)</option>
                  </select>
                </div>
              </div>
              <div><label className="block text-slate-300 mb-1">Amount ({curSym}):</label><NumberInput required min={1} value={debtAmount} onValueChange={setDebtAmount} className="w-full rounded border border-[#30363d] px-2.5 py-1.5 bg-[#0d1117] text-white outline-none" /></div>
              <div><label className="block text-slate-300 mb-1">Settlement date (optional — reminder starts the day before):</label><input type="date" value={debtSettlementDate} onChange={(e) => setDebtSettlementDate(e.target.value)} className="w-full rounded border border-[#30363d] px-2.5 py-1.5 bg-[#0d1117] text-white outline-none" /></div>
              <div><label className="block text-slate-300 mb-1">Note / receipt no. (optional):</label><input value={debtNote} onChange={(e) => setDebtNote(e.target.value)} placeholder="e.g. Transport advance, Receipt #RCT-…" className="w-full rounded border border-[#30363d] px-2.5 py-1.5 bg-[#0d1117] text-white outline-none" /></div>
              <div className="grid grid-cols-2 gap-3 pt-2">
                <button type="button" onClick={() => setShowDebtModal(false)} className="py-2 bg-[#21262d] border border-[#30363d] text-slate-300 font-extrabold rounded text-xs uppercase">Close</button>
                <button type="submit" className={`py-2 font-extrabold rounded text-xs uppercase border ${debtKind === 'charge' ? 'bg-red-600 border-red-500' : 'bg-emerald-600 border-emerald-500'} text-white`}>Save Line</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showClearConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
          <div className="w-full max-w-sm bg-[#161b22] border border-red-800/50 rounded-xl p-5 text-center">
            <h3 className="font-black text-white">Clear All Demo Data?</h3>
            <p className="text-xs text-slate-400 mt-1">Removes all contracts + micro-payments so you can start fresh with real customers.</p>
            <div className="grid grid-cols-2 gap-3 mt-4">
              <button onClick={() => setShowClearConfirm(false)} className="py-2 bg-[#21262d] border border-[#30363d] text-slate-300 font-bold rounded text-xs uppercase">Cancel</button>
              <button onClick={handleClearDemo} className="py-2 bg-red-600 text-white font-bold rounded text-xs uppercase">Clear All</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
