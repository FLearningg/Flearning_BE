const Transaction = require("../models/transactionModel");
const mongoose = require("mongoose");

/**
 * @desc    Proxy API to fetch VietQR payment info (e.g., QR code for payment)
 * @route   GET /api/payments/transactions
 * @access  Private
 */
const vietQrPayment = async (req, res) => {
  try {
    const response = await fetch(process.env.QR_API_URL, {
      headers: {
        Authorization: `Apikey ${process.env.QR_API_KEY}`,
        "Content-Type": "application/json",
      },
    });

    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error("Error fetching from QR API:", error);
    res.status(500).json({ error: "Server proxy error" });
  }
};

/**
 * @desc    Add a new payment transaction (used after successful payment)
 * @route   POST /api/payments/transactions
 * @access  Private
 */
const addTransaction = async (req, res) => {
  try {
    const {
      userId,
      paymentId,
      gatewayId,
      type,
      amount,
      currency,
      createdAt,
      updatedAt,
      description,
      courseId,
    } = req.body;

    if (!userId || !amount || !type || !currency || !createdAt || !updatedAt) {
      return res
        .status(400)
        .json({ message: "Missing required transaction fields." });
    }

    const newTransaction = new Transaction({
      userId: new mongoose.Types.ObjectId(userId),
      paymentId: new mongoose.Types.ObjectId(paymentId),
      gatewayTransactionId: new mongoose.Types.ObjectId(gatewayId),
      type,
      amount,
      currency,
      status: "completed",
      createdAt,
      updatedAt,
      description,
      courseId: new mongoose.Types.ObjectId(courseId),
    });

    await newTransaction.save();

    return res.status(201).json({
      message: "Transaction added successfully.",
      transaction: newTransaction,
    });
  } catch (err) {
    console.error("Error adding transaction:", err);
    res.status(500).json({ message: "Server error.", error: err.message });
  }
};

module.exports = {
  vietQrPayment,
  addTransaction,
};
