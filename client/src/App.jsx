import React, { useEffect, useState } from 'react';
import { getTransactions, createTransaction, deleteTransaction, getSummary } from './api';
import Dashboard from './components/Dashboard';
import TransactionForm from './components/TransactionForm';
import TransactionList from './components/TransactionList';
import { LayoutDashboard } from 'lucide-react';

function App() {
  const [transactions, setTransactions] = useState([]);
  const [summary, setSummary] = useState({ totalIncome: 0, totalOutcome: 0, balance: 0 });
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    try {
      const [transactionsRes, summaryRes] = await Promise.all([
        getTransactions(),
        getSummary()
      ]);
      setTransactions(transactionsRes.data);
      setSummary(summaryRes.data);
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleAddTransaction = async (data) => {
    try {
      await createTransaction(data);
      fetchData(); // Refresh data
    } catch (error) {
      console.error("Error adding transaction:", error);
    }
  };

  const handleDeleteTransaction = async (id) => {
    if (!window.confirm("Are you sure you want to delete this transaction?")) return;
    try {
      await deleteTransaction(id);
      fetchData(); // Refresh data
    } catch (error) {
      console.error("Error deleting transaction:", error);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 p-4 md:p-8 font-sans">
      <div className="max-w-6xl mx-auto">
        <header className="mb-8 flex items-center gap-3">
          <div className="bg-indigo-600 p-3 rounded-xl shadow-lg text-white">
            <LayoutDashboard size={32} />
          </div>
          <div>
            <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">Cash Manager</h1>
            <p className="text-gray-500">Track your income and expenses efficiently</p>
          </div>
        </header>

        {loading ? (
          <div className="flex justify-center items-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
          </div>
        ) : (
          <>
            <Dashboard summary={summary} />
            <TransactionForm onAddTransaction={handleAddTransaction} />
            <TransactionList transactions={transactions} onDeleteTransaction={handleDeleteTransaction} />
          </>
        )}
      </div>
    </div>
  );
}

export default App;
