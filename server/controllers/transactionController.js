const db = require('../db');

exports.getTransactions = (req, res) => {
    db.all('SELECT * FROM transactions ORDER BY date DESC', [], (err, rows) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json(rows);
    });
};

exports.createTransaction = (req, res) => {
    const { type, amount, remark } = req.body;
    const sql = 'INSERT INTO transactions (type, amount, remark) VALUES (?, ?, ?)';
    const params = [type, amount, remark];

    db.run(sql, params, function (err) {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.status(201).json({
            id: this.lastID,
            type,
            amount,
            remark,
            date: new Date().toISOString()
        });
    });
};

exports.deleteTransaction = (req, res) => {
    const { id } = req.params;
    db.run('DELETE FROM transactions WHERE id = ?', id, function (err) {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json({ message: 'Transaction deleted', changes: this.changes });
    });
};

exports.getSummary = (req, res) => {
    const sql = `
    SELECT 
      SUM(CASE WHEN type = 'INCOME' THEN amount ELSE 0 END) as totalIncome,
      SUM(CASE WHEN type = 'OUTCOME' THEN amount ELSE 0 END) as totalOutcome
    FROM transactions
  `;

    db.get(sql, [], (err, row) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        const totalIncome = row ? row.totalIncome || 0 : 0;
        const totalOutcome = row ? row.totalOutcome || 0 : 0;
        const balance = totalIncome - totalOutcome;
        res.json({ totalIncome, totalOutcome, balance });
    });
};
