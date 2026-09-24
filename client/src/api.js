import axios from "axios";
const api = axios.create({
  baseURL: `${window.location.origin}/api`
});
export const getTransactions = () => api.get("/transactions");
export const createTransaction = data => api.post("/transactions", data);
export const deleteTransaction = id => api.delete(`/transactions/${id}`);
export const getSummary = () => api.get("/transactions/summary");
export default api;
