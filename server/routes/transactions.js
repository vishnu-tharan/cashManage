const express = require('express');
const router = express.Router();
const controller = require('../controllers/transactionController');

router.get('/', controller.getTransactions);
router.post('/', controller.createTransaction);
router.delete('/:id', controller.deleteTransaction);
router.get('/summary', controller.getSummary);

module.exports = router;
