import { Wallet, TrendingUp, TrendingDown } from "lucide-react";
const Dashboard = ({
  summary
}) => {
  const {
    totalIncome,
    totalOutcome,
    balance
  } = summary;
  return <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
      <div className="bg-white p-6 rounded-xl shadow-lg border-l-4 border-blue-500 flex items-center justify-between">
        <div>
          <p className="text-gray-500 text-sm font-medium uppercase">
            Total Balance
          </p>
          <p className="text-2xl font-bold text-gray-800">
            ${balance.toFixed(2)}
          </p>
        </div>
        <div className="p-3 bg-blue-100 rounded-full text-blue-600">
          <Wallet size={24} />
        </div>
      </div>

      <div className="bg-white p-6 rounded-xl shadow-lg border-l-4 border-emerald-500 flex items-center justify-between">
        <div>
          <p className="text-gray-500 text-sm font-medium uppercase">
            Total Income
          </p>
          <p className="text-2xl font-bold text-emerald-600">
            +${totalIncome.toFixed(2)}
          </p>
        </div>
        <div className="p-3 bg-emerald-100 rounded-full text-emerald-600">
          <TrendingUp size={24} />
        </div>
      </div>

      <div className="bg-white p-6 rounded-xl shadow-lg border-l-4 border-rose-500 flex items-center justify-between">
        <div>
          <p className="text-gray-500 text-sm font-medium uppercase">
            Total Outcome
          </p>
          <p className="text-2xl font-bold text-rose-600">
            -${totalOutcome.toFixed(2)}
          </p>
        </div>
        <div className="p-3 bg-rose-100 rounded-full text-rose-600">
          <TrendingDown size={24} />
        </div>
      </div>
    </div>;
};
export default Dashboard;
