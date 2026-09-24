import { useState } from "react";
import { PlusCircle } from "lucide-react";
const TransactionForm = ({
  onAddTransaction
}) => {
  const [type, setType] = useState("INCOME");
  const [amount, setAmount] = useState("");
  const [remark, setRemark] = useState("");
  const handleSubmit = e => {
    e.preventDefault();
    if (!amount || !remark) return;
    onAddTransaction({
      type,
      amount,
      remark
    });
    setAmount("");
    setRemark("");
  };
  return <div className="bg-white p-6 rounded-xl shadow-lg mb-8">
      <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
        <PlusCircle size={20} />
        Add New Transaction
      </h2>
      <form onSubmit={handleSubmit} className="flex flex-col md:flex-row gap-4 items-end">
        <div className="flex-1 w-full">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Type
          </label>
          <select value={type} onChange={e => setType(e.target.value)} className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition">
            <option value="INCOME">Income</option>
            <option value="OUTCOME">Outcome</option>
          </select>
        </div>

        <div className="flex-1 w-full">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Amount
          </label>
          <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition" min="0" step="0.01" />
        </div>

        <div className="flex-[2] w-full">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Remark
          </label>
          <input type="text" value={remark} onChange={e => setRemark(e.target.value)} placeholder="e.g. Salary, Rent, Groceries" className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition" />
        </div>

        <button type="submit" className={`px-6 py-2 rounded-lg font-medium text-white transition shadow-md w-full md:w-auto ${type === "INCOME" ? "bg-emerald-600 hover:bg-emerald-700" : "bg-rose-600 hover:bg-rose-700"}`}>
          Add {type === "INCOME" ? "Income" : "Outcome"}
        </button>
      </form>
    </div>;
};
export default TransactionForm;
