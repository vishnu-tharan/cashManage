import React from 'react';
import { Trash2, ArrowUpCircle, ArrowDownCircle } from 'lucide-react';

const TransactionList = ({ transactions, onDeleteTransaction }) => {
    return (
        <div className="bg-white rounded-xl shadow-lg overflow-hidden">
            <div className="p-6 border-b border-gray-100">
                <h2 className="text-xl font-bold text-gray-800">Recent Transactions</h2>
            </div>

            {transactions.length === 0 ? (
                <div className="p-8 text-center text-gray-500">
                    No transactions found. Add one to get started!
                </div>
            ) : (
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead className="bg-gray-50 text-gray-600 text-sm uppercase">
                            <tr>
                                <th className="p-4">Type</th>
                                <th className="p-4">Remark</th>
                                <th className="p-4">Date</th>
                                <th className="p-4 text-right">Amount</th>
                                <th className="p-4 text-center">Action</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {transactions.map((t) => (
                                <tr key={t.id} className="hover:bg-gray-50 transition">
                                    <td className="p-4">
                                        <div className={`flex items-center gap-2 font-medium ${t.type === 'INCOME' ? 'text-emerald-600' : 'text-rose-600'
                                            }`}>
                                            {t.type === 'INCOME' ? <ArrowUpCircle size={18} /> : <ArrowDownCircle size={18} />}
                                            {t.type}
                                        </div>
                                    </td>
                                    <td className="p-4 font-medium text-gray-800">{t.remark}</td>
                                    <td className="p-4 text-gray-500 text-sm">
                                        {new Date(t.date).toLocaleDateString()} {new Date(t.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </td>
                                    <td className={`p-4 text-right font-bold ${t.type === 'INCOME' ? 'text-emerald-600' : 'text-rose-600'
                                        }`}>
                                        {t.type === 'INCOME' ? '+' : '-'}${t.amount.toFixed(2)}
                                    </td>
                                    <td className="p-4 text-center">
                                        <button
                                            onClick={() => onDeleteTransaction(t.id)}
                                            className="text-gray-400 hover:text-rose-500 transition p-2 rounded-full hover:bg-rose-50"
                                        >
                                            <Trash2 size={18} />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
};

export default TransactionList;
