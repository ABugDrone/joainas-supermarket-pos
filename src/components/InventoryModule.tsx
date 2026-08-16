import React from 'react';
import { Package, Plus, Search, AlertTriangle, Edit3, Trash2, FolderPlus } from 'lucide-react';
import { Product, UserRole, Category } from '../types';
import { formatNaira, recordAuditLog, loadCategories, saveCategories } from '../utils/storage';
import { useToast } from './Toast';

interface InventoryModuleProps {
  products: Product[];
  categories?: Category[];
  currentUser: string;
  currentUserRole: UserRole;
  onAddProduct: (product: Product) => void;
  onUpdateProduct: (product: Product) => void;
  onDeleteProduct: (id: string) => void;
}

export const InventoryModule: React.FC<InventoryModuleProps> = ({
  products,
  categories: categoriesProp,
  currentUser,
  currentUserRole,
  onAddProduct,
  onUpdateProduct,
  onDeleteProduct,
}) => {
  const { showToast } = useToast();

  const [searchQuery, setSearchQuery] = React.useState('');
  const [selectedCategory, setSelectedCategory] = React.useState<string>('All');
  const [isModalOpen, setIsModalOpen] = React.useState(false);
  const [editingProduct, setEditingProduct] = React.useState<Product | null>(null);

  // Dynamic Categories state — prefers the App-level source of truth so the
  // dropdown keeps in sync with the POS grid, with a local fallback.
  const [storeCategories, setStoreCategories] = React.useState<Category[]>(
    () => categoriesProp ?? loadCategories()
  );
  const [newCategoryInput, setNewCategoryInput] = React.useState('');
  const [isAddingCategory, setIsAddingCategory] = React.useState(false);

  // Form states
  const [formData, setFormData] = React.useState<Partial<Product>>({
    barcode: '',
    name: '',
    category: 'Groceries',
    unit: 'pack',
    costPrice: 0,
    retailPrice: 0,
    stockQty: 0,
    reorderLevel: 5,
  });

  const categoryNames = React.useMemo(() => {
    const list = ['All', ...storeCategories.map((c) => c.name)];
    // Also include any categories present on existing products that might not be in the categories list
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
    return products.filter((p) => p.stockQty <= p.reorderLevel).length;
  }, [products]);

  const totalInventoryValue = React.useMemo(() => {
    return products.reduce((sum, p) => sum + p.costPrice * p.stockQty, 0);
  }, [products]);

  const handleOpenAddModal = () => {
    setEditingProduct(null);
    setFormData({
      barcode: `200${Math.floor(1000 + Math.random() * 9000)}`,
      name: '',
      category: 'Groceries',
      unit: 'pack',
      costPrice: 0,
      retailPrice: 0,
      stockQty: 10,
      reorderLevel: 5,
    });
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (p: Product) => {
    setEditingProduct(p);
    setFormData({ ...p });
    setIsModalOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.barcode) return;

    if (editingProduct) {
      let updatedProd = {
        ...editingProduct,
        ...(formData as Product),
      };
      onUpdateProduct(updatedProd);

      recordAuditLog(
        currentUser,
        currentUserRole,
        'Updated Inventory Item',
        `Updated details/pricing for item "${updatedProd.name}" (Barcode: ${updatedProd.barcode}).`
      );
      showToast(`Updated product "${updatedProd.name}" catalog details.`, 'success');
    } else {
      let newProd: Product = {
        id: `prod-${Date.now()}`,
        ...(formData as Product),
      };
      onAddProduct(newProd);

      recordAuditLog(
        currentUser,
        currentUserRole,
        'Added New Inventory Stock',
        `Added new catalog item "${newProd.name}" (${newProd.category}) with initial stock of ${newProd.stockQty} ${newProd.unit}.`
      );
      showToast(`New product "${newProd.name}" added to stock inventory.`, 'success');
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
            Manage Seafood, Frozen Foods, Groceries catalog, set retail rates, and track low stock reorder alerts.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="bg-[#0d1117] border border-[#30363d] px-3.5 py-1.5 rounded-xl text-right">
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

      {/* Low Stock Warning Banner if applicable */}
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

      {/* Filter and Search Bar */}
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

      {/* Inventory Table */}
      <div className="bg-[#161b22] rounded-2xl border border-[#30363d] shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-[#0d1117] text-slate-400 font-bold uppercase text-[10px] tracking-wide border-b border-[#30363d]">
                <th className="py-3 px-4">Barcode</th>
                <th className="py-3 px-4">Product Name</th>
                <th className="py-3 px-4">Category</th>
                <th className="py-3 px-4 text-right">Cost Price (₦)</th>
                <th className="py-3 px-4 text-right">Retail Price (₦)</th>
                <th className="py-3 px-4 text-center">Stock Level</th>
                <th className="py-3 px-4 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#30363d]">
              {filteredProducts.map((prod) => {
                let isLow = prod.stockQty <= prod.reorderLevel;
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
                    <td className="py-3 px-4 text-right font-extrabold text-cyan-400">
                      {prod.retailPrice.toLocaleString()}
                    </td>
                    <td className="py-3 px-4 text-center font-bold">
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs ${
                          isLow
                            ? 'bg-red-950/60 border border-red-500/40 text-red-400 font-black animate-pulse'
                            : 'bg-emerald-950/60 border border-emerald-500/40 text-emerald-400'
                        }`}
                      >
                        {prod.stockQty} {prod.unit} {isLow && '⚠️'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center space-x-2">
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

      {/* Modal Add / Edit Product */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg bg-[#161b22] border border-[#30363d] rounded-2xl shadow-2xl p-6 text-slate-200 my-8 overflow-y-auto max-h-[90vh]">
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

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 mb-1">Cost Price (₦):</label>
                  <input
                    type="number"
                    required
                    value={formData.costPrice}
                    onChange={(e) => setFormData({ ...formData, costPrice: parseFloat(e.target.value) || 0 })}
                    className="w-full rounded border border-[#30363d] px-2 py-1.5 bg-[#0d1117] text-white outline-none focus:border-cyan-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 mb-1">Retail Price (₦):</label>
                  <input
                    type="number"
                    required
                    value={formData.retailPrice}
                    onChange={(e) => setFormData({ ...formData, retailPrice: parseFloat(e.target.value) || 0 })}
                    className="w-full rounded border border-[#30363d] px-2 py-1.5 bg-[#0d1117] text-cyan-400 font-extrabold outline-none focus:border-cyan-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-slate-300 mb-1">Unit Type:</label>
                  <select
                    value={formData.unit}
                    onChange={(e) => setFormData({ ...formData, unit: e.target.value as any })}
                    className="w-full rounded border border-[#30363d] px-2 py-1.5 bg-[#0d1117] text-white outline-none focus:border-cyan-500"
                  >
                    <option value="pack" className="bg-[#161b22]">Pack</option>
                    <option value="kg" className="bg-[#161b22]">Kg</option>
                    <option value="carton" className="bg-[#161b22]">Carton</option>
                    <option value="bottle" className="bg-[#161b22]">Bottle</option>
                    <option value="piece" className="bg-[#161b22]">Piece</option>
                    <option value="bag" className="bg-[#161b22]">Bag</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-300 mb-1">Stock Quantity:</label>
                  <input
                    type="number"
                    required
                    value={formData.stockQty}
                    onChange={(e) => setFormData({ ...formData, stockQty: parseInt(e.target.value) || 0 })}
                    className="w-full rounded border border-[#30363d] px-2 py-1.5 bg-[#0d1117] text-white outline-none focus:border-cyan-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 mb-1">Reorder Alert Level:</label>
                  <input
                    type="number"
                    required
                    value={formData.reorderLevel}
                    onChange={(e) => setFormData({ ...formData, reorderLevel: parseInt(e.target.value) || 0 })}
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
    </div>
  );
};
