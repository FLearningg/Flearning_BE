const Transaction = require("../models/transactionModel");
const mongoose = require("mongoose");
const payOs = require("../config/payos");
const User = require("../models/userModel");
const { APIError } = require("@payos/node"); // Biến này chưa được dùng, nhưng vẫn giữ lại
const Payment = require("../models/paymentModel");
const Enrollment = require("../models/enrollmentModel");

// Bỏ WEB_URL vì không dùng
// const WEB_URL = "http://localhost:3000";

/**
 * @desc    Proxy API to fetch VietQR payment info (e.g., QR code for payment) [Abandoned]
 * @route   GET /api/payments/transactions
 * @access  Private
 */
const vietQrPayment = async (req, res) => {
  // ... (Giữ nguyên, không thay đổi)
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

// ***** START: HÀM ĐÃ ĐƯỢC SỬA LẠI HOÀN TOÀN *****
/**
 * @desc    Thêm giao dịch (từ luồng quét QR cũ - QRCodePayment.jsx)
 * @desc    Hàm này được REFACTOR để tương thích với logic Mongoose Transaction mới,
 * @desc    tạo ra Enrollment, Payment, và Transaction giống như webhook thành công.
 * @route   POST /api/payments/transactions
 * @access  Private (Đã thêm authorize() trong file routes)
 */
const addTransaction = async (req, res) => {
  const {
    userId,
    paymentId, // Đây là "Mã GD" của ngân hàng (từ saveTransactionToDB)
    amount,
    description,
    courseId, // Đây là mảng các course ID
  } = req.body; // Kiểm tra các trường bắt buộc

  if (
    !userId ||
    !amount ||
    !courseId ||
    !Array.isArray(courseId) ||
    courseId.length === 0 ||
    !paymentId
  ) {
    // Quan trọng: kiểm tra Mã GD ngân hàng
    return res.status(400).json({
      message:
        "Thiếu các trường bắt buộc: `userId`, `amount`, `paymentId` (Mã GD), và `courseId` (mảng không rỗng).",
    });
  } // Bắt đầu một Mongoose session (database transaction)

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // Kiểm tra giao dịch trùng lặp bằng Mã GD của ngân hàng
    // Chúng ta lưu Mã GD vào trường 'gatewayTransactionId'
    const existingTransaction = await Transaction.findOne({
      gatewayTransactionId: paymentId,
    }).session(session);

    if (existingTransaction) {
      await session.abortTransaction();
      session.endSession();
      return res
        .status(409)
        .json({ message: "Giao dịch đã được xử lý trước đó." });
    } // BƯỚC 1: Tạo các Enrollment (trạng thái "enrolled" vì đã thanh toán)

    const enrollmentPromises = courseId.map((id) => {
      const newEnrollment = new Enrollment({
        userId: userId,
        courseId: id,
        status: "enrolled", // Ghi danh luôn
      });
      return newEnrollment.save({ session });
    });
    const newEnrollments = await Promise.all(enrollmentPromises);
    const newEnrollmentIds = newEnrollments.map((e) => e._id); // Tạo orderCode (giống như luồng PayOS)

    const orderCode = parseInt(
      Date.now().toString() + Math.floor(Math.random() * 1000)
    ); // BƯỚC 2: Tạo Payment (trạng thái "completed")

    const newPayment = new Payment({
      enrollmentIds: newEnrollmentIds,
      paymentDate: new Date(),
      amount: amount,
      status: "completed", // Hoàn thành luôn
    }); // BƯỚC 3: Tạo Transaction (trạng thái "completed")

    const newTransaction = new Transaction({
      userId,
      amount: amount,
      status: "completed", // Hoàn thành luôn
      description: description,
      orderCode: orderCode, // Tạo orderCode mới
      paymentId: newPayment._id, // Link tới Payment
      gatewayTransactionId: paymentId, // Lưu Mã GD ngân hàng vào đây
    }); // Gán ngược lại transactionId cho payment

    newPayment.transactionId = newTransaction._id; // Lưu cả hai vào DB

    await newPayment.save({ session });
    await newTransaction.save({ session }); // Commit database transaction

    await session.commitTransaction();

    return res.status(201).json({
      message: "Thêm giao dịch và ghi danh thành công.",
      transaction: newTransaction,
    });
  } catch (err) {
    // Nếu lỗi, hủy bỏ mọi thay đổi
    await session.abortTransaction();
    console.error("Lỗi khi thêm giao dịch thủ công:", err);
    if (err.code === 11000) {
      return res.status(409).json({
        message: "Lỗi trùng lặp (orderCode hoặc gatewayTransactionId).",
      });
    }
    res.status(500).json({ message: "Lỗi máy chủ.", error: err.message });
  } finally {
    // Luôn kết thúc session
    session.endSession();
  }
};
// ***** END: HÀM ĐÃ ĐƯỢC SỬA LẠI HOÀN TOÀN *****

/**
 * @desc    Tạo link thanh toán PayOS... (Giữ nguyên)
 * @route   POST /api/payments/create-link
 * @access  Private
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

    const orderCode = parseInt(
      Date.now().toString() + Math.floor(Math.random() * 1000)
    ); // BƯỚC 2: Tạo một Payment duy nhất

    const newPayment = new Payment({
      enrollmentIds: newEnrollmentIds,
      paymentDate: new Date(),
      amount: price,
      status: "pending",
    }); // BƯỚC 3: Tạo Transaction và liên kết với Payment

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
    await transaction.save({ session }); // BƯỚC 4: Tạo link PayOS

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

    await session.commitTransaction();

    res.status(200).json({
      message: "Tạo link thanh toán thành công",
      checkoutUrl: paymentLinkResponse.checkoutUrl,
    });
  } catch (error) {
    await session.abortTransaction();
    console.error("Lỗi khi tạo link thanh toán:", error);
    res.status(500).json({ message: "Không thể tạo link thanh toán." });
  } finally {
    session.endSession();
  }
};

/**
 * @desc    Nhận và xử lý webhook từ PayOS.
 * @desc    Sửa lại để so sánh đúng "success" (chữ thường).
 * @route   POST /api/payments/webhook
 * @access  Public
 */
const handlePayOsWebhook = async (req, res) => {
  console.log("=============== WEBHOOK RECEIVED ===============");
  console.log("Timestamp:", new Date().toISOString());
  console.log("Webhook Raw Body:", req.rawBody);
  console.log("Webhook Parsed Body:", JSON.stringify(req.body, null, 2));
  console.log("Webhook Headers:", JSON.stringify(req.headers, null, 2));
  console.log("==============================================");

  if (!req.rawBody) {
    console.log(
      "[WEBHOOK] Nhận được request không có body (validation ping). Trả về 200 OK."
    );
    return res
      .status(200)
      .json({ message: "Webhook validation ping received." });
  }

  const webhookData = req.body;

  try {
    console.log(
      "[WEBHOOK] Bắt đầu xác thực dữ liệu (dùng verifyPaymentWebhook)..."
    );
    const verifiedData = await payOs.webhooks.verify(webhookData);
    console.log(
      "[WEBHOOK] Dữ liệu đã được xác thực thành công.",
      verifiedData.desc
    ); // ***** SỬA LỖI TẠI ĐÂY: Chuyển "Success" thành "success" (chữ thường) *****

    if (verifiedData.code === "00" && verifiedData.desc === "success") {
      console.log("[WEBHOOK] Giao dịch thành công, bắt đầu xử lý.");
      const orderCode = verifiedData.orderCode;
      console.log(`[WEBHOOK] Tìm kiếm Transaction với orderCode: ${orderCode}`);

      const transaction = await Transaction.findOne({ orderCode: orderCode });

      if (transaction && transaction.status === "pending") {
        console.log(
          `[WEBHOOK] Đã tìm thấy Transaction ID: ${transaction._id} ở trạng thái pending.`
        ); // 1. Cập nhật Transaction

        transaction.gatewayTransactionId = verifiedData.paymentId;
        transaction.status = "completed";
        await transaction.save();
        console.log(
          `[WEBHOOK] Đã cập nhật Transaction ID: ${transaction._id} sang 'completed'.`
        ); // 2. Cập nhật Payment

        const payment = await Payment.findById(transaction.paymentId);
        if (payment) {
          console.log(`[WEBHOOK] Đã tìm thấy Payment ID: ${payment._id}.`);
          payment.status = "completed";
          await payment.save();
          console.log(
            `[WEBHOOK] Đã cập nhật Payment ID: ${payment._id} sang 'completed'.`
          ); // 3. Cập nhật Enrollments

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

    return res.status(200).json({ message: "Webhook processed successfully" });
  } catch (error) {
    console.error(
      "!!!!!!!!!!!! LỖI NGHIÊM TRỌNG TRONG WEBHOOK HANDLER !!!!!!!!!!!!"
    );
    console.error(error.message || error);
    console.error(
      "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!"
    );
    return res.status(400).json({ message: "Webhook verification failed" });
  }
};

/**
 * @desc    Kiểm tra trạng thái của một giao dịch... (Giữ nguyên)
 * @route   GET /api/payments/status/:orderCode
 * @access  Private
 */
const getPaymentStatus = async (req, res) => {
  // ... (Giữ nguyên, không thay đổi)
  try {
    const transaction = await Transaction.findOne({
      orderCode: req.params.orderCode,
    });

    if (!transaction) {
      return res.status(404).json({ message: "Không tìm thấy giao dịch." });
    }

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
 * @desc    Hủy một đơn hàng đang chờ xử lý (Giữ nguyên)
 * @route   PUT /api/payments/cancel/:orderCode
 * @access  Private
 */
const cancelPayment = async (req, res) => {
  // ... (Giữ nguyên, không thay đổi)
  try {
    const { orderCode } = req.params;

    const transaction = await Transaction.findOne({ orderCode });

    if (!transaction) {
      return res.status(404).json({ message: "Không tìm thấy giao dịch." });
    }

    if (transaction.status !== "pending") {
      return res.status(400).json({ message: "Giao dịch không thể hủy." });
    }

    transaction.status = "cancelled";
    await transaction.save();

    const payment = await Payment.findById(transaction.paymentId);
    if (payment) {
      payment.status = "cancelled";
      await payment.save();

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
