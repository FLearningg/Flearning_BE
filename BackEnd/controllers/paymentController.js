const Transaction = require("../models/transactionModel");
const mongoose = require("mongoose");
const payOs = require("../config/payos");
const User = require("../models/userModel");
const { APIError } = require("@payos/node");
const Payment = require("../models/paymentModel");
const Enrollment = require("../models/enrollmentModel");

const WEB_URL = "http://localhost:3000";

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
  const { description, price, courseIds } = req.body; // Bỏ cancelUrl, packageType nếu không dùng
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

    // Tạo orderCode an toàn hơn
    const orderCode = parseInt(
      Date.now().toString() + Math.floor(Math.random() * 1000)
    );

    // BƯỚC 2: Tạo một Payment duy nhất
    const newPayment = new Payment({
      enrollmentIds: newEnrollmentIds,
      paymentDate: new Date(),
      amount: price,
      status: "pending",
      // transactionId sẽ được thêm ở bước sau
    });

    // BƯỚC 3: Tạo Transaction và liên kết với Payment
    const transaction = new Transaction({
      userId, // Giữ lại userId ở đây để check quyền truy cập dễ hơn
      amount: price,
      status: "pending",
      description,
      orderCode: orderCode,
      paymentId: newPayment._id, // Liên kết transaction với payment
    });

    // Gán ngược lại transactionId cho payment
    newPayment.transactionId = transaction._id;

    // Lưu cả hai vào DB trong cùng session
    await newPayment.save({ session });
    await transaction.save({ session });

    // BƯỚC 4: Tạo link PayOS
    const payosOrder = {
      amount: price,
      description: description,
      orderCode: orderCode,
      returnUrl: `${process.env.CLIENT_URL}/payment/success?orderCode=${orderCode}`,
      cancelUrl: `${process.env.CLIENT_URL}/payment/cancelled?orderCode=${orderCode}`,
      buyerName: req.user.fullName,
      buyerEmail: req.user.email,
    };

    console.log("Dữ liệu gửi đến PayOS:", payosOrder);

    const paymentLinkResponse = await payOs.paymentRequests.create(payosOrder);

    // Nếu mọi thứ thành công, commit transaction
    await session.commitTransaction();

    res.status(200).json({
      message: "Tạo link thanh toán thành công",
      checkoutUrl: paymentLinkResponse.checkoutUrl,
    });
  } catch (error) {
    // Nếu có lỗi, hủy bỏ tất cả thay đổi
    await session.abortTransaction();
    console.error("Lỗi khi tạo link thanh toán:", error);
    res.status(500).json({ message: "Không thể tạo link thanh toán." });
  } finally {
    // Luôn kết thúc session
    session.endSession();
  }
};

/**
 * @desc    Nhận và xử lý webhook từ PayOS.
 * API này xác thực dữ liệu webhook, cập nhật trạng thái của Transaction và Payment tương ứng.
 * Nếu thanh toán thành công, nó sẽ kích hoạt logic nghiệp vụ (vd: nâng cấp tài khoản).
 * Lưu ý: API này chỉ dành cho hệ thống PayOS gọi đến, không phải cho client.
 * @route   POST /api/payments/webhook
 * @access  Public
 */
const handlePayOsWebhook = async (req, res) => {
  console.log("=============== WEBHOOK RECEIVED ===============");
  console.log("Timestamp:", new Date().toISOString());
  console.log("Webhook Body:", JSON.stringify(req.body, null, 2));
  console.log("==============================================");

  const webhookData = req.body;
  try {
    console.log("[WEBHOOK] Bắt đầu xác thực dữ liệu...");
    const verifiedData = payOs.verifyPaymentWebhook(webhookData);
    console.log(
      "[WEBHOOK] Dữ liệu đã được xác thực thành công.",
      verifiedData.desc
    );

    if (verifiedData.code === "00" && verifiedData.desc === "Success") {
      console.log("[WEBHOOK] Giao dịch thành công, bắt đầu xử lý.");
      const orderCode = verifiedData.data.orderCode;
      console.log(`[WEBHOOK] Tìm kiếm Transaction với orderCode: ${orderCode}`);

      const transaction = await Transaction.findOne({ orderCode: orderCode });

      if (transaction && transaction.status === "pending") {
        console.log(
          `[WEBHOOK] Đã tìm thấy Transaction ID: ${transaction._id} ở trạng thái pending.`
        );

        // 1. Cập nhật Transaction
        transaction.gatewayTransactionId = verifiedData.data.paymentId;
        transaction.status = "completed";
        await transaction.save();
        console.log(
          `[WEBHOOK] Đã cập nhật Transaction ID: ${transaction._id} sang 'completed'.`
        );

        // 2. Cập nhật Payment
        const payment = await Payment.findById(transaction.paymentId);
        if (payment) {
          console.log(`[WEBHOOK] Đã tìm thấy Payment ID: ${payment._id}.`);
          payment.status = "completed";
          await payment.save();
          console.log(
            `[WEBHOOK] Đã cập nhật Payment ID: ${payment._id} sang 'completed'.`
          );

          // 3. Cập nhật Enrollments
          console.log(
            `[WEBHOOK] Bắt đầu cập nhật ${payment.enrollmentIds.length} enrollment(s).`
          );
          await Enrollment.updateMany(
            { _id: { $in: payment.enrollmentIds } },
            { $set: { status: "enrolled" } }
          );
          console.log("[WEBHOOK] Đã cập nhật xong các enrollment(s).");
          console.log("[WEBHOOK] XỬ LÝ THÀNH CÔNG!");
        } else {
          console.error(
            `[WEBHOOK] LỖI: Không tìm thấy Payment tương ứng với Transaction ID: ${transaction._id}`
          );
        }
      } else if (transaction) {
        console.warn(
          `[WEBHOOK] CẢNH BÁO: Transaction với orderCode ${orderCode} đã được xử lý trước đó (status: ${transaction.status}). Bỏ qua.`
        );
      } else {
        console.error(
          `[WEBHOOK] LỖI: Không tìm thấy Transaction nào với orderCode: ${orderCode}`
        );
      }
    } else {
      console.log(
        `[WEBHOOK] Giao dịch không thành công hoặc không cần xử lý. Code: ${verifiedData.code}, Desc: ${verifiedData.desc}`
      );
    }

    return res.status(200).json({ message: "Webhook received" });
  } catch (error) {
    console.error(
      "!!!!!!!!!!!! LỖI NGHIÊM TRỌNG TRONG WEBHOOK HANDLER !!!!!!!!!!!!"
    );
    console.error(error);
    console.error(
      "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!"
    );
    return res
      .status(400)
      .json({ message: "Webhook verification or processing failed" });
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