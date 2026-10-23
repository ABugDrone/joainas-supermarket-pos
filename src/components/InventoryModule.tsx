import React from 'react';
import { Package, Plus, Search, AlertTriangle, Edit3, Trash2, FolderPlus, PackagePlus } from 'lucide-react';
import { Product, UserRole, Category, PriceTier, GOODS_UNITS, SERVICE_UNITS, EDIBLE_UNITS, isUncountedKind } from '../types';
import { formatNaira, recordAuditLog, loadCategories, saveCategories } from '../utils/storage';
import { formatMoney } from '../utils/currency';
import { formatRange } from '../utils/pricing';
import { useCurrency } from '../hooks/useCurrency';
import { InventoryDraft } from '../utils/workspace';
import { useToast } from './Toast';
import { NumberInput } from './NumberInput';
import { StockAdjustModal } from './StockAdjustModal';

interface InventoryModuleProps {
  products: Product[];
  categories?: Category[];
  currentUser: string;
  currentUserRole: UserRole;
  onAddProduct: (product: Product) => void;
  onUpdateProduct: (product: Product) => void;
  onDeleteProduct: (id: string) => void;
  // Per-user workspace continuity: restore this account's unsent draft.
  initialDraft?: InventoryDraft | null;
  onDraftChange?: (d: InventoryDraft) => void;
}

export const InventoryModule: React.FC<InventoryModuleProps> = ({
  products,
  categories: categoriesProp,
  currentUser,
  currentUserRole,
  onAddProduct,
  onUpdateProduct,
  onDeleteProduct,
  initialDraft,
  onDraftChange,
}) => {
  const { showToast } = useToast();
  const { symbol: curSym } = useCurrency();

  const [searchQuery, setSearchQuery] = React.useState('');
  const [selectedCategory, setSelectedCategory] = React.useState<string>('All');
  const [isModalOpen, setIsModalOpen] = React.useState(false);
  const [editingProduct, setEditingProduct] = React.useState<Product | null>(null);
  const [restockProduct, setRestockProduct] = React.useState<Product | null>(null);

  const [storeCategories, setStoreCategories] = React.useState<Category[]>(
    () => categoriesProp ?? loadCategories()
  );
  React.useEffect(() => {
    if (categoriesProp) setStoreCategories(categoriesProp);
  }, [categoriesProp]);

  // Form states (declared before workspace effects that reference them).
  const [formData, setFormData] = React.useState<Partial<Product>>({
    barcode: '',
    name: '',
    category: 'Groceries',
    unit: 'pack',
    costPrice: 0,
    retailPrice: 0,
    minPrice: 0,
    wholesalePrice: 0,
    priceTiers: [],
    stockQty: 0,
    reorderLevel: 5,
  });

  // Restore this account's unsent inventory draft once per mount.
  const draftAppliedRef = React.useRef(false);
  React.useEffect(() => {
    if (draftAppliedRef.current || !initialDraft) return;
    draftAppliedRef.current = true;
    const d = initialDraft;
    if (d.formData) {
      setFormData((prev) => ({ ...prev, ...d.formData }));
    }
    if (d.modalOpen) {
      if (d.editingProductId) {
        // Editing draft re-attaches when the product still exists; the
        // submit path falls back to add-mode if it vanished.
        setEditingProduct({ id: d.editingProductId } as Product);
      }
      setIsModalOpen(true);
      showToast('Your unsent inventory draft was restored.', 'success');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Report draft changes up so logout/sleep can snapshot them.
  React.useEffect(() => {
    if (!onDraftChange) return;
    onDraftChange({
      modalOpen: isModalOpen,
      editingProductId: editingProduct?.id ?? null,
      formData: {
        barcode: formData.barcode,
        name: formData.name,
        category: formData.category,
        unit: formData.unit,
        costPrice: formData.costPrice,
        retailPrice: formData.retailPrice,
        minPrice: formData.minPrice,
        wholesalePrice: formData.wholesalePrice,
        priceTiers: formData.priceTiers as PriceTier[] | undefined,
        stockQty: formData.stockQty,
        reorderLevel: formData.reorderLevel,
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData, isModalOpen, editingProduct]);

  const categoryNames = React.useMemo(() => {
    const list = ['All', ...storeCategories.map((c) => c.name)];
    products.forEach((p) => {
      if (p.category && !list.includes(p.category)) {
        list.push(p.category);
      }
    });
    return Array.from(new Set(list));
  }, [storeCategories, products]);

  const filteredProducts = React.useMemo(() => {
    return products.filter((p) => {
      let matchCat = selectedCategory === 'All' || p.category === selectedCategory;
      let matchQuery =
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.barcode.includes(searchQuery) ||
        p.category.toLowerCase().includes(searchQuery.toLowerCase());
      return matchCat && matchQuery;
    });
  }, [products, selectedCategory, searchQuery]);

  const lowStockCount = React.useMemo(() => {
    return products.filter((p) => !isUncountedKind(p) && p.stockQty <= p.reorderLevel).length;
  }, [products]);

  // Total stock asset value = units in stock × HIGHEST price of the range.
  // Products: retail (max) price × stockQty.
  // Services & edibles are not tangible, so they are counted once at their highest
  // price (× 1) — they still contribute to the figure instead of showing 0.
  const totalInventoryValue = React.useMemo(() => {
    return products.reduce((sum, p) => sum + (p.retailPrice > 0 ? p.retailPrice : p.minPrice || 0) * (isUncountedKind(p) ? 1 : p.stockQty), 0);
  }, [products]);

  const handleOpenAddModal = () => {
    setEditingProduct(null);
    setFormData({
      barcode: `200${Math.floor(1000 + Math.random() * 9000)}`,
      name: '',
      category: storeCategories[0]?.name || 'Groceries',
      unit: 'pack',
      costPrice: 0,
      retailPrice: 0,
      minPrice: 0,
      wholesalePrice: 0,
      priceTiers: [],
      stockQty: 10,
      reorderLevel: 5,
    });
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (p: Product) => {
    setEditingProduct(p);
    // Preserve an explicit min; never invent one from the max.
    setFormData({ ...p, minPrice: p.minPrice && p.minPrice > 0 ? p.minPrice : 0, priceTiers: p.priceTiers ? [...p.priceTiers] : [] });
    setIsModalOpen(true);
  };

  const addTier = () => {
    const tiers = (formData.priceTiers as PriceTier[]) || [];
    const next: PriceTier = {
      id: `tier-${Date.now()}-${Math.floor(Math.random()*1000)}`,
      minQty: tiers.length > 0 ? (tiers[tiers.length-1].maxQty ? (tiers[tiers.length-1].maxQty as number)+1 : tiers[tiers.length-1].minQty + 10) : 1,
      maxQty: null,
      ceiling: formData.retailPrice || 0,
    };
    setFormData({ ...formData, priceTiers: [...tiers, next] });
  };

  const updateTier = (idx: number, patch: Partial<PriceTier>) => {
    const tiers = [...((formData.priceTiers as PriceTier[]) || [])];
    tiers[idx] = { ...tiers[idx], ...patch };
    setFormData({ ...formData, priceTiers: tiers });
  };

  const removeTier = (idx: number) => {
    const tiers = [...((formData.priceTiers as PriceTier[]) || [])];
    tiers.splice(idx,1);
    setFormData({ ...formData, priceTiers: tiers });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.barcode) return;
    const minP = formData.minPrice ?? 0;
    const maxP = formData.retailPrice ?? 0;
    if (maxP <= 0 && minP <= 0) {
      showToast('Set a Max Selling Price, a Min Selling Price, or both.', 'error');
      return;
    }
    if (minP > 0 && maxP > 0 && minP > maxP) {
      showToast('Min Selling Price cannot exceed Max Selling Price.', 'error');
      return;
    }
    const tiers = (formData.priceTiers as PriceTier[]) || [];
    for (let i=0;i<tiers.length;i++) {
      const t = tiers[i];
      if (!t.minQty || t.minQty < 1) { showToast(`Tier ${i+1}: Min Qty must be at least 1.`, 'error'); return; }
      if (t.maxQty !== null && t.maxQty !== undefined && t.maxQty < t.minQty) { showToast(`Tier ${i+1}: Max Qty cannot be less than Min Qty.`, 'error'); return; }
      if (!t.ceiling || t.ceiling <= 0) { showToast(`Tier ${i+1}: Max Price must be greater than 0.`, 'error'); return; }
      if (t.ceiling > maxP && maxP > 0) { showToast(`Tier ${i+1}: Max Price cannot exceed overall Max Selling Price (${formatMoney(maxP)}).`, 'error'); return; }
      if (t.floor !== undefined && t.floor !== null && t.floor > t.ceiling) { showToast(`Tier ${i+1}: Min Price cannot exceed Max Price.`, 'error'); return; }
    }
    // check overlapping qty
    for (let i=0;i<tiers.length;i++) {
      for (let j=i+1;j<tiers.length;j++) {
        const a = tiers[i], b = tiers[j];
        const aMax = a.maxQty === null || a.maxQty === undefined ? Infinity : a.maxQty;
        const bMax = b.maxQty === null || b.maxQty === undefined ? Infinity : b.maxQty;
        const overlap = !(aMax < b.minQty || bMax < a.minQty);
        if (overlap) { showToast(`Tier ${i+1} and Tier ${j+1} quantity ranges overlap.`, 'error'); return; }
      }
    }
    const sortedTiers = [...tiers].sort((a,b)=>a.minQty-b.minQty);

    const payload: Product = {
      // If the restored editing stub no longer matches a live product,
      // fall back to add-mode instead of silently updating nothing.
      id: editingProduct && products.some((p) => p.id === editingProduct.id)
        ? editingProduct.id
        : `prod-${Date.now()}`,
      barcode: formData.barcode as string,
      name: formData.name as string,
      category: formData.category as string,
      // Persist the kind explicitly so services/edibles keep their treatment
      // even when they sit in a custom sub-category (not just the roots).
      // An explicit kind always wins over the category name (legacy backups
      // may contain Products that live in a category called "Services").
      kind: (formData as any).kind === 'service' || (formData as any).kind === 'edible' || (formData as any).kind === 'product'
        ? (formData as any).kind
        : ((formData.category || '').toLowerCase() === 'services'
          ? 'service'
          : ((formData.category || '').toLowerCase() === 'edibles' ? 'edible' : 'product')),
      unit: formData.unit as any,
      costPrice: formData.costPrice ?? 0,
      retailPrice: maxP,
      wholesalePrice: formData.wholesalePrice && formData.wholesalePrice > 0 ? formData.wholesalePrice : maxP > 0 ? maxP : minP,
      minPrice: minP > 0 ? minP : undefined,
      priceTiers: sortedTiers.length ? sortedTiers : undefined,
      stockQty: formData.stockQty ?? 0,
      reorderLevel: formData.reorderLevel ?? 5,
    };

    const isUpdate = !!editingProduct && products.some((p) => p.id === payload.id);

    // The Edibles root row must exist for pills, grid colors and Admin to see
    // it — create it once the first time anything lands in that category.
    if ((payload.category || '').toLowerCase() === 'edibles' && !storeCategories.some((c) => c.name.toLowerCase() === 'edibles')) {
      const edibleCat: Category = {
        id: 'cat-edibles',
        name: 'Edibles',
        color: '#f59e0b',
        description: 'Food & servings sold per plate — treated like services',
        kind: 'edible',
        parentRoot: 'Edibles',
        createdAt: new Date().toISOString().split('T')[0],
      };
      const nextCats = [...storeCategories, edibleCat];
      setStoreCategories(nextCats);
      saveCategories(nextCats);
    }

    if (isUpdate) {
      onUpdateProduct(payload);
      recordAuditLog(
        currentUser,
        currentUserRole,
        'Updated Inventory Item',
        `Updated details/pricing for item "${payload.name}" (Barcode: ${payload.barcode}) — Max ${formatMoney(payload.retailPrice)}${payload.minPrice ? `, Min ${formatMoney(payload.minPrice)}`:''}${sortedTiers.length?`, ${sortedTiers.length} quantity tiers`:''}.`
      );
      showToast(`Updated product "${payload.name}" catalog details.`, 'success');
    } else {
      onAddProduct(payload);
      recordAuditLog(
        currentUser,
        currentUserRole,
        'Added New Inventory Stock',
        `Added new catalog item "${payload.name}" (${payload.category}) with Max ${formatMoney(payload.retailPrice)}${payload.minPrice?` / Min ${formatMoney(payload.minPrice)}`:''} and stock ${payload.stockQty} ${payload.unit}.`
      );
      showToast(`New product "${payload.name}" added to stock inventory.`, 'success');
    }
    setIsModalOpen(false);
  };

  const handleDeleteWithAudit = (id: string, name: string) => {
    onDeleteProduct(id);
    recordAuditLog(
      currentUser,
      currentUserRole,
      'Deleted Inventory Item',
      `Removed product "${name}" (ID: ${id}) from store catalog.`
    );
    showToast(`Deleted product "${name}" from store catalog.`, 'info');
  };

  const renderPriceRange = (prod: Product) => {
    if (prod.priceTiers && prod.priceTiers.length > 0) {
      return <span className="inline-flex flex-col items-end gap-0.5">
        <span className="px-2 py-0.5 rounded bg-cyan-950/60 border border-cyan-800/40 text-cyan-300 text-[10px] font-black">{prod.priceTiers.length} tiers</span>
        <span className="text-[10px] text-slate-500">Max {formatMoney(prod.retailPrice || prod.minPrice || 0)}</span>
      </span>;
    }
    return <span className="text-cyan-400 font-extrabold">{formatRange(prod)}</span>;
  };

  const handleRestockSave = (newQty: number, added: number) => {
    if (!restockProduct) return;
    const before = restockProduct.stockQty;
    const updated = { ...restockProduct, stockQty: newQty };
    onUpdateProduct(updated);
    recordAuditLog(
      currentUser,
      currentUserRole,
      'Added Inventory Stock',
      `Added ${added} ${restockProduct.unit} to "${restockProduct.name}" — stock ${before} → ${newQty}.`
    );
    showToast(`Stock for "${restockProduct.name}" updated to ${newQty}.`, 'success');
    setRestockProduct(null);
  };

  return (
    <div className="p-4 md:p-6 bg-[#0c0e12] min-h-[calc(100vh-140px)] space-y-6 text-[#e2e8f0]">
      {/* Top Banner */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 bg-[#161b22] p-5 rounded-2xl border border-[#30363d] shadow-sm">
        <div>
          <h2 className="text-xl font-extrabold text-white flex items-center gap-2">
            <Package className="w-6 h-6 text-cyan-400" />
            Inventory Stock & Product Catalog
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Set price ranges for each product — the selling price entered at checkout must stay within the preset max.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="bg-[#0d1117] border border-[#30363d] px-3.5 py-1.5 rounded-xl text-right" title="Products: units in stock × highest price. Services: highest price × 1 (uncounted).">
            <span className="text-[10px] font-bold text-slate-400 block uppercase">Total Stock Asset Value</span>
            <span className="text-sm font-black text-cyan-400">{formatNaira(totalInventoryValue)}</span>
          </div>

          <button
            onClick={handleOpenAddModal}
            className="py-2.5 px-4 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs uppercase tracking-wider shadow-md shadow-cyan-900/30 transition flex items-center gap-2 border border-cyan-500"
          >
            <Plus className="w-4 h-4" />
            Add New Product
          </button>
        </div>
      </div>

      {lowStockCount > 0 && (
        <div className="flex items-center justify-between bg-amber-950/30 border border-amber-500/40 p-3 rounded-xl text-amber-200 text-xs font-bold">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-400" />
            <span>Low Stock Alert: {lowStockCount} items are running below reorder threshold!</span>
          </div>
          <button
            onClick={() => {
              setSelectedCategory('All');
              setSearchQuery('');
            }}
            className="text-amber-300 underline font-black text-[11px]"
          >
            View Low Stock
          </button>
        </div>
      )}

      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-[#161b22] p-4 rounded-xl border border-[#30363d] shadow-sm">
        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          {categoryNames.map((cat) => {
            const catColor =
              cat === 'All'
                ? undefined
                : storeCategories.find((c) => c.name.toLowerCase() === cat.toLowerCase())?.color;
            return (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`py-1.5 px-3 rounded-lg text-xs font-bold transition border flex items-center gap-1.5 ${
                  selectedCategory === cat
                    ? 'bg-cyan-600 text-white border-cyan-500 shadow-md shadow-cyan-900/30'
                    : 'bg-[#0d1117] text-slate-300 border-[#30363d] hover:bg-[#21262d]'
                }`}
              >
                {catColor && (
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: catColor }}
                  ></span>
                )}
                {cat}
              </button>
            );
          })}
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
          <input
            type="text"
            placeholder="Search catalog or barcode..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 rounded-lg border border-[#30363d] bg-[#0d1117] text-xs font-medium text-white focus:border-cyan-500 outline-none"
          />
        </div>
      </div>

      <div className="bg-[#161b22] rounded-2xl border border-[#30363d] shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-[#0d1117] text-slate-400 font-bold uppercase text-[10px] tracking-wide border-b border-[#30363d]">
                <th className="py-3 px-4">Barcode</th>
                <th className="py-3 px-4">Product Name</th>
                <th className="py-3 px-4">Category</th>
                <th className="py-3 px-4 text-right">Cost ({curSym})</th>
                <th className="py-3 px-4 text-right">Selling Price Range</th>
                <th className="py-3 px-4 text-center">Stock Level</th>
                <th className="py-3 px-4 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#30363d]">
              {filteredProducts.map((prod) => {
                const isNegative = prod.stockQty < 0;
                const isLow = !isNegative && prod.stockQty <= prod.reorderLevel;
                return (
                  <tr
                    key={prod.id}
                    className="hover:bg-slate-800/40 transition font-medium text-slate-200"
                  >
                    <td className="py-3 px-4 font-mono font-bold text-slate-400">{prod.barcode}</td>
                    <td className="py-3 px-4 font-bold text-white">
                      {prod.name}
                      <span className="block text-[10px] text-slate-400 font-normal">Unit: {prod.unit}</span>
                    </td>
                    <td className="py-3 px-4">
                      <span className="px-2 py-0.5 rounded bg-[#0d1117] border border-[#30363d] text-[10px] font-bold text-slate-300">
                        {prod.category}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right text-slate-400">{prod.costPrice.toLocaleString()}</td>
                    <td className="py-3 px-4 text-right">
                      {renderPriceRange(prod)}
                    </td>
                    <td className="py-3 px-4 text-center font-bold">
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs ${
                          isNegative
                            ? 'bg-red-900/80 border border-red-400 text-red-200 font-black'
                            : isLow
                              ? 'bg-red-950/60 border border-red-500/40 text-red-400 font-black animate-pulse'
                              : 'bg-emerald-950/60 border border-emerald-500/40 text-emerald-400'
                        }`}
                      >
                        {prod.stockQty} {prod.unit} {isNegative ? 'OWED' : isLow && '⚠️'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center space-x-2">
                      <button
                        onClick={() => setRestockProduct(prod)}
                        className="p-1 text-emerald-400 hover:bg-emerald-950/50 rounded transition"
                        title="Add Stock"
                      >
                        <PackagePlus className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleOpenEditModal(prod)}
                        className="p-1 text-cyan-400 hover:bg-cyan-950/50 rounded transition"
                        title="Edit Product"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteWithAudit(prod.id, prod.name)}
                        className="p-1 text-red-400 hover:bg-red-950/50 rounded transition"
                        title="Delete Product"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
          <div className="w-full max-w-2xl bg-[#161b22] border border-[#30363d] rounded-2xl shadow-2xl p-6 text-slate-200 my-8 overflow-y-auto max-h-[92vh]">
            <h3 className="font-bold text-lg text-white mb-4 border-b pb-2 border-[#30363d]">
              {editingProduct ? 'Edit Product Details' : 'Add New Inventory Product'}
            </h3>

            <form onSubmit={handleSubmit} className="space-y-4 text-xs font-bold">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 mb-1">Barcode:</label>
                  <input
                    type="text"
                    required
                    value={formData.barcode}
                    onChange={(e) => setFormData({ ...formData, barcode: e.target.value })}
                    className="w-full rounded border border-[#30363d] px-2.5 py-1.5 bg-[#0d1117] text-white font-mono font-bold outline-none focus:border-cyan-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 mb-1">Category:</label>
                  <div className="flex items-center gap-2">
                    <select
                      value={formData.category}
                      onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                      className="w-full rounded border border-[#30363d] px-2.5 py-1.5 bg-[#0d1117] text-white outline-none focus:border-cyan-500 font-bold"
                    >
                      {categoryNames.filter((c) => c !== 'All').map((cat) => (
                        <option key={cat} value={cat} className="bg-[#161b22]">
                          {cat}
                        </option>
                      ))}
                    </select>
                    <span
                      className="w-4 h-4 rounded-full border border-white/20 shrink-0"
                      style={{
                        backgroundColor:
                          storeCategories.find(
                            (c) => c.name.toLowerCase() === (formData.category || '').toLowerCase()
                          )?.color || '#6366f1',
                      }}
                      title="Category color"
                    ></span>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-slate-300 mb-1">Product Name:</label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full rounded border border-[#30363d] px-2.5 py-1.5 bg-[#0d1117] text-white text-sm outline-none focus:border-cyan-500"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-slate-300 mb-1">Cost Price ({curSym}) <span className="text-slate-500 font-normal normal-case">(optional)</span>:</label>
                  <NumberInput
                    placeholder="0"
                    value={formData.costPrice ?? 0}
                    onValueChange={(n) => setFormData({ ...formData, costPrice: n })}
                    className="w-full rounded border border-[#30363d] px-2 py-1.5 bg-[#0d1117] text-white outline-none focus:border-cyan-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 mb-1">Min Selling Price ({curSym}) <span className="text-slate-500 font-normal">(optional)</span>:</label>
                  <NumberInput
                    placeholder="0 — lowest allowed"
                    value={formData.minPrice ?? 0}
                    onValueChange={(n) => setFormData({ ...formData, minPrice: Math.max(0,n) })}
                    className="w-full rounded border border-[#30363d] px-2 py-1.5 bg-[#0d1117] text-emerald-400 font-bold outline-none focus:border-cyan-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 mb-1">Max Selling Price ({curSym}) <span className="text-rose-400">*</span>:</label>
                  <NumberInput
                    required
                    placeholder="0"
                    value={formData.retailPrice ?? 0}
                    onValueChange={(n) => setFormData({ ...formData, retailPrice: n })}
                    className="w-full rounded border border-[#30363d] px-2 py-1.5 bg-[#0d1117] text-cyan-400 font-extrabold outline-none focus:border-cyan-500"
                  />
                  <span className="text-[10px] text-slate-500 font-normal">Price at checkout cannot exceed this.</span>
                </div>
              </div>

              {/* Quantity Price Tiers */}
              <div className="bg-[#0d1117] border border-[#30363d] rounded-xl p-3 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-slate-200 font-black text-xs">Quantity Price Tiers <span className="text-slate-500 font-normal">(optional)</span></span>
                    <p className="text-[11px] text-slate-500 font-normal">Example: 1 pc → Max {formatMoney(1500)} | 10 pcs → Max {formatMoney(1000)} | 100 pcs → Max {formatMoney(500)}. Selling price must stay within tier max.</p>
                  </div>
                  <button type="button" onClick={addTier} className="px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-[11px] font-black flex items-center gap-1.5 border border-cyan-500"><Plus className="w-3.5 h-3.5"/> Add Tier</button>
                </div>
                {(!formData.priceTiers || (formData.priceTiers as PriceTier[]).length===0) ? (
                  <div className="text-[11px] text-slate-500 bg-[#161b22] border border-dashed border-[#30363d] rounded-lg p-3 text-center">No tiers — single range mode. Add tiers to set different max prices by quantity (e.g. wholesale vs retail).</div>
                ) : (
                  <div className="space-y-2">
                    {(formData.priceTiers as PriceTier[]).map((tier, idx)=>(
                      <div key={tier.id} className="grid grid-cols-12 gap-2 items-end bg-[#161b22] border border-[#30363d] rounded-lg p-2">
                        <div className="col-span-3">
                          <label className="block text-[10px] text-slate-400 mb-1">Min Qty</label>
                          <NumberInput integer min={1} value={tier.minQty} onValueChange={(n)=>updateTier(idx,{minQty: Math.max(1, Math.trunc(n))})} className="w-full rounded border border-[#30363d] px-2 py-1.5 bg-[#0d1117] text-white text-xs outline-none focus:border-cyan-500"/>
                        </div>
                        <div className="col-span-3">
                          <label className="block text-[10px] text-slate-400 mb-1">Max Qty (blank=∞)</label>
                          <input type="text" placeholder="∞" value={tier.maxQty===null||tier.maxQty===undefined?'':String(tier.maxQty)} onChange={(e)=>{
                            const v=e.target.value.trim();
                            if(v==='') updateTier(idx,{maxQty:null});
                            else { const num=Number(v); if(!isNaN(num)) updateTier(idx,{maxQty: Math.max(tier.minQty, Math.trunc(num))}); }
                          }} className="w-full rounded border border-[#30363d] px-2 py-1.5 bg-[#0d1117] text-white text-xs outline-none focus:border-cyan-500"/>
                        </div>
                        <div className="col-span-4">
                          <label className="block text-[10px] text-slate-400 mb-1">Max Price for tier ({curSym})</label>
                          <NumberInput value={tier.ceiling} onValueChange={(n)=>updateTier(idx,{ceiling: Math.max(0,n)})} className="w-full rounded border border-[#30363d] px-2 py-1.5 bg-[#0d1117] text-cyan-300 text-xs font-bold outline-none focus:border-cyan-500"/>
                        </div>
                        <div className="col-span-2 flex justify-end">
                          <button type="button" onClick={()=>removeTier(idx)} className="p-2 rounded-lg bg-red-950/40 border border-red-800/40 text-red-400 hover:bg-red-900/60"><Trash2 className="w-4 h-4"/></button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-slate-300 mb-1">Type:</label>
                  <select
                    value={(formData as any).kind || ((formData.category || '').toLowerCase() === 'services' ? 'service' : (formData.category || '').toLowerCase() === 'edibles' ? 'edible' : 'product')}
                    onChange={(e) => {
                      const kind = e.target.value as 'product' | 'service' | 'edible';
                      const defUnit = kind === 'service' ? 'job' : kind === 'edible' ? 'plate' : 'piece';
                      setFormData({ ...formData, kind, unit: defUnit as any, category: kind === 'service' ? 'Services' : kind === 'edible' ? 'Edibles' : (formData.category === 'Services' || formData.category === 'Edibles' ? 'Products' : formData.category), stockQty: kind === 'edible' ? 1 : formData.stockQty } as any);
                    }}
                    className="w-full rounded border border-[#30363d] px-2 py-1.5 bg-[#0d1117] text-white outline-none focus:border-cyan-500"
                  >
                    <option value="product" className="bg-[#161b22]">Product (stock-tracked)</option>
                    <option value="service" className="bg-[#161b22]">Service (never out of stock)</option>
                    <option value="edible" className="bg-[#161b22]">Edible (per plate, never out of stock)</option>
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="block text-slate-300 mb-1">Unit Type:</label>
                  <select
                    value={formData.unit}
                    onChange={(e) => setFormData({ ...formData, unit: e.target.value as any })}
                    className="w-full rounded border border-[#30363d] px-2 py-1.5 bg-[#0d1117] text-white outline-none focus:border-cyan-500"
                  >
                    <optgroup label="Goods">
                      {GOODS_UNITS.map((u) => (<option key={u} value={u} className="bg-[#161b22]">{u}</option>))}
                    </optgroup>
                    <optgroup label="Services">
                      {SERVICE_UNITS.map((u) => (<option key={u} value={u} className="bg-[#161b22]">{u}</option>))}
                    </optgroup>
                    <optgroup label="Edibles">
                      {EDIBLE_UNITS.map((u) => (<option key={u} value={u} className="bg-[#161b22]">{u}</option>))}
                    </optgroup>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 mb-1">Stock Quantity:{isUncountedKind({ kind: (formData as any).kind, category: formData.category }) ? ' (services & edibles: uncounted)' : ''}</label>
                  <NumberInput
                    required
                    integer
                    placeholder="0"
                    value={formData.stockQty ?? 0}
                    onValueChange={(n) => setFormData({ ...formData, stockQty: Math.trunc(n) })}
                    className="w-full rounded border border-[#30363d] px-2 py-1.5 bg-[#0d1117] text-white outline-none focus:border-cyan-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 mb-1">Reorder Alert Level:</label>
                  <NumberInput
                    required
                    integer
                    placeholder="5"
                    value={formData.reorderLevel ?? 5}
                    onValueChange={(n) => setFormData({ ...formData, reorderLevel: Math.max(0, Math.trunc(n)) })}
                    className="w-full rounded border border-[#30363d] px-2 py-1.5 bg-[#0d1117] text-white outline-none focus:border-cyan-500"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-[#30363d]">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="py-2 px-4 bg-[#21262d] border border-[#30363d] text-slate-300 font-bold rounded-lg text-xs hover:bg-[#30363d] transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="py-2 px-6 bg-cyan-600 hover:bg-cyan-500 text-white font-bold rounded-lg text-xs shadow-md border border-cyan-500 transition"
                >
                  Save Product
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <StockAdjustModal
        product={restockProduct}
        onClose={() => setRestockProduct(null)}
        onSave={handleRestockSave}
      />
    </div>
  );
};
