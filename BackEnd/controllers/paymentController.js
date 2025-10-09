const Transaction = require("../models/transactionModel");
const mongoose = require("mongoose");
const payOs = require("../config/payos");
const User = require("../models/userModel");
const { APIError } = require("@payos/node");
const Payment = require("../models/paymentModel");
const Enrollment = require("../models/enrollmentModel");
const crypto = require("crypto");

const WEB_URL = "http://localhost:3000";

function sortObjectForSignature(obj) {
  if (obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) return obj.map((it) => sortObjectForSignature(it));
  if (typeof obj !== "object") return obj;

  const keys = Object.keys(obj).sort();
  const out = {};
  for (const k of keys) {
    out[k] = sortObjectForSignature(obj[k]);
  }
  return out;
}

function objectToQueryString(obj, prefix = "") {
  const result = [];
  const sortedKeys = Object.keys(obj).sort();

  for (const key of sortedKeys) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      const fullKey = prefix ? `${prefix}[${key}]` : key;
      const value = obj[key];
      if (value === null || value === undefined) {
        result.push(`${fullKey}=`);
        continue;
      }
      if (Array.isArray(value)) {
        value.forEach((item, index) => {
          if (item === null || item === undefined) {
            result.push(`${fullKey}[${index}]=`);
          } else if (typeof item === "object") {
            const sorted = sortObjectForSignature(item);
            result.push(`${fullKey}[${index}]=${JSON.stringify(sorted)}`);
          } else {
            result.push(`${fullKey}[${index}]=${String(item)}`);
          }
        });
      } else if (typeof value === "object") {
        result.push(...objectToQueryString(value, fullKey));
      } else {
        result.push(`${fullKey}=${String(value)}`);
      }
    }
  }
  return result;
}

function createSignature(data) {
  const dataQueries = objectToQueryString(data);
  const sortedQueries = dataQueries.sort();
  const dataString = sortedQueries.join("&");
  return crypto
    .createHmac("sha256", process.env.PAYOS_CHECKSUM_KEY)
    .update(dataString)
    .digest("hex");
}

/**
 * @desc    Proxy API to fetch VietQR payment info (e.g., QR code for payment) [Abandoned]
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
 * @desc    Add a new payment transaction (used after successful payment) [Abandoned]
 * @route   POST /api/payments/transactions
 * @access  Private
 */
const addTransaction = async (req, res) => {
  try {
    const {
      userId,
      gatewayTransactionId,
      type,
      amount,
      currency,
      description,
      courseId,
    } = req.body;

    if (
      !userId ||
      !amount ||
      !type ||
      !currency ||
      !courseId ||
      !Array.isArray(courseId) ||
      courseId.length === 0
    ) {
      return res.status(400).json({
        message:
          "Missing required fields. `courseId` must be a non-empty array.",
      });
    }

    const newTransaction = new Transaction({
      userId: new mongoose.Types.ObjectId(userId),
      gatewayTransactionId,
      type,
      amount,
      currency,
      status: "completed",
      description,
      courseId,
    });

    await newTransaction.save();

    return res.status(201).json({
      message: "Transaction added successfully.",
      transaction: newTransaction,
    });
  } catch (err) {
    console.error("Error adding transaction:", err);
    if (err.code === 11000) {
      return res
        .status(409)
        .json({ message: "Duplicate gatewayTransactionId." });
    }
    res.status(500).json({ message: "Server error.", error: err.message });
  }
};

/**
 * @desc    Tạo link thanh toán PayOS để nâng cấp tài khoản hoặc mua gói dịch vụ.
 * API này khởi tạo một Payment và Transaction ở trạng thái PENDING,
 * sau đó trả về checkoutUrl cho client để chuyển hướng người dùng.
 * @route   POST /api/payments/create-link
 * @access  Private
 */
const createPaymentLink = async (req, res) => {
  const { description, price, courseIds } = req.body;
  const userId = req.user.id;

  if (!description || !price || !courseIds || courseIds.length === 0) {
    return res.status(400).json({ message: "Vui lòng cung cấp đủ thông tin." });
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // BƯỚC 1: Tạo các bản ghi Enrollment
    const enrollmentPromises = courseIds.map((courseId) => {
      const newEnrollment = new Enrollment({
        userId: userId,
        courseId: courseId,
        status: "pending",
      });
      return newEnrollment.save({ session });
    });
    const newEnrollments = await Promise.all(enrollmentPromises);
    const newEnrollmentIds = newEnrollments.map((e) => e._id);

    const orderCode = Date.now();

    // BƯỚC 2: Tạo một Payment duy nhất
    const newPayment = new Payment({
      enrollmentIds: newEnrollmentIds,
      paymentDate: new Date(),
      amount: price,
      status: "pending",
    });

    // BƯỚC 3: Tạo Transaction và liên kết với Payment
    const transaction = new Transaction({
      userId,
      amount: price,
      status: "pending",
      description,
      orderCode: orderCode,
      paymentId: newPayment._id,
    });
    newPayment.transactionId = transaction._id;

    await newPayment.save({ session });
    await transaction.save({ session });

    // BƯỚC 4: Tạo link PayOS
    const payosOrder = {
      amount: price,
      description: description,
      orderCode: orderCode,
      returnUrl: `${process.env.CLIENT_URL}/payment/success?orderCode=${orderCode}`,
      cancelUrl: `${process.env.CLIENT_URL}/payment/cancelled?orderCode=${orderCode}`,
      buyerName: req.user.fullName || req.user.email,
      buyerEmail: req.user.email,
    };

    console.log("Dữ liệu gửi đến PayOS:", payosOrder);
    const paymentLinkResponse = await payOs.paymentRequests.create(payosOrder);

    await session.commitTransaction();

    res.status(200).json({
      message: "Tạo link thanh toán thành công",
      checkoutUrl: paymentLinkResponse.checkoutUrl,
    });
  } catch (error) {
    await session.abortTransaction();

    // ==========================================================
    // === KHỐI LOG LỖI CHI TIẾT ĐÃ ĐƯỢC THÊM VÀO ĐÂY ===
    // ==========================================================
    console.error(
      "!!!!!!!!!!!! LỖI NGHIÊM TRỌNG KHI TẠO LINK THANH TOÁN !!!!!!!!!!!!"
    );
    console.error("Time:", new Date().toISOString());
    console.error("Error Message:", error.message);

    // In ra toàn bộ object lỗi để xem các thuộc tính ẩn như 'error.code' hoặc 'error.error' từ PayOS
    // Dùng JSON.stringify để đảm bảo không có thông tin nào bị ẩn đi
    console.error("Full Error Object:", JSON.stringify(error, null, 2));

    console.error(
      "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!"
    );

    res.status(500).json({ message: "Không thể tạo link thanh toán." });
  } finally {
    session.endSession();
  }
};

/**
 * @desc    Nhận và xử lý webhook từ PayOS.
 * ...
 * @route   POST /api/payment/webhook
 * @access  Public
 */
const handlePayOsWebhook = async (req, res) => {
  const webhookData = req.body;
  console.log("[WEBHOOK] Received webhook data:", webhookData);

  try {
    // Bước 1: Xác thực chữ ký bằng logic đúng từ code cũ của bạn
    const expectedSignature = createSignature(webhookData.data || {});
    const signatureFromPayOS = webhookData.signature;

    if (expectedSignature !== signatureFromPayOS) {
      console.error("[WEBHOOK] Invalid signature.");
      return res
        .status(400)
        .json({ message: "Webhook verification failed: Invalid signature." });
    }

    console.log("[WEBHOOK] Signature verified successfully.");

    // Bước 2: Xử lý logic nghiệp vụ
    const data = webhookData.data;

    if (!data || !data.orderCode) {
      console.log(
        "[WEBHOOK] Received a test request or data is missing orderCode. Skipping."
      );
      return res
        .status(200)
        .json({ message: "Webhook acknowledged, no data to process." });
    }

    if (webhookData.code === "00") {
      const orderCode = parseInt(data.orderCode);
      const transaction = await Transaction.findOne({ orderCode: orderCode });

      if (transaction && transaction.status === "pending") {
        transaction.gatewayTransactionId = data.reference;
        transaction.status = "completed";
        await transaction.save();

        const payment = await Payment.findById(transaction.paymentId);
        if (payment) {
          payment.status = "completed";
          await payment.save();
          await Enrollment.updateMany(
            { _id: { $in: payment.enrollmentIds } },
            { $set: { status: "enrolled" } }
          );
          console.log(
            `[WEBHOOK] Successfully enrolled user for ${payment.enrollmentIds.length} courses.`
          );
        }
      } else {
        console.log(
          `[WEBHOOK] Skipping. Order ${orderCode} not found or already processed.`
        );
      }
    }

    return res.status(200).json({ message: "Webhook processed." });
  } catch (error) {
    console.error("!!!!!!!!!!!! CRITICAL WEBHOOK ERROR !!!!!!!!!!!!", error);
    return res
      .status(500)
      .json({ message: "An internal server error occurred." });
  }
};

/**
 * @desc    Kiểm tra trạng thái của một giao dịch bằng orderCode (ID của transaction)
 * @route   GET /api/payments/status/:orderCode
 * @access  Private
 */
const getPaymentStatus = async (req, res) => {
  try {
    const transaction = await Transaction.findOne({
      orderCode: req.params.orderCode,
    });

    if (!transaction) {
      return res.status(404).json({ message: "Không tìm thấy giao dịch." });
    }

    // Đảm bảo chỉ người tạo giao dịch mới có quyền xem
    if (transaction.userId.toString() !== req.user.id) {
      return res.status(403).json({ message: "Không có quyền truy cập." });
    }

    res.status(200).json({ status: transaction.status });
  } catch (error) {
    console.error("Lỗi khi kiểm tra trạng thái thanh toán:", error);
    res.status(500).json({ message: "Lỗi máy chủ." });
  }
};

/**
 * @desc    Hủy một đơn hàng đang chờ xử lý
 * @route   PUT /api/payments/cancel/:orderCode
 * @access  Private
 */
const cancelPayment = async (req, res) => {
  try {
    const { orderCode } = req.params;

    // Tìm transaction dựa trên orderCode
    const transaction = await Transaction.findOne({ orderCode });

    if (!transaction) {
      return res.status(404).json({ message: "Không tìm thấy giao dịch." });
    }

    // Chỉ cho phép hủy các giao dịch đang chờ
    if (transaction.status !== "pending") {
      return res.status(400).json({ message: "Giao dịch không thể hủy." });
    }

    // Cập nhật trạng thái của transaction
    transaction.status = "cancelled";
    await transaction.save();

    // Tìm và cập nhật payment liên quan
    const payment = await Payment.findById(transaction.paymentId);
    if (payment) {
      payment.status = "cancelled";
      await payment.save();

      // Tìm và cập nhật tất cả enrollment liên quan
      await Enrollment.updateMany(
        { _id: { $in: payment.enrollmentIds } },
        { $set: { status: "cancelled" } }
      );
    }

    res.status(200).json({ message: "Đơn hàng đã được hủy thành công." });
  } catch (error) {
    console.error("Lỗi khi hủy đơn hàng:", error);
    res.status(500).json({ message: "Lỗi máy chủ." });
  }
};

module.exports = {
  vietQrPayment,
  addTransaction,
  handlePayOsWebhook,
  getPaymentStatus,
  createPaymentLink,
  cancelPayment,
};
