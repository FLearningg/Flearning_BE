const Transaction = require("../models/transactionModel");
const mongoose = require("mongoose");
const payOs = require("../config/payos");
const User = require("../models/userModel");
const { APIError } = require("@payos/node"); // Biến này chưa được dùng, nhưng vẫn giữ lại
const Payment = require("../models/paymentModel");
const Enrollment = require("../models/enrollmentModel");
const Cart = require("../models/cartModel");
const Course = require("../models/courseModel");
const { userEnrolledInCourseEmail } = require("../utils/emailTemplates");
const sendEmail = require("../utils/sendEmail");

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
    // BƯỚC 1: Xử lý các bản ghi Enrollment (DÙNG VÒNG LẶP TUẦN TỰ)
    const resultingEnrollments = []; // Tạo mảng trống để lưu kết quả

    for (const courseId of courseIds) {
      const existingEnrollment = await Enrollment.findOne({
        userId: userId,
        courseId: courseId,
      }).session(session); // <-- Luôn .session(session) cho mọi query

      if (existingEnrollment) {
        // TÌNH HUỐNG 1: Đã tồn tại & bị hủy
        if (existingEnrollment.status === "cancelled") {
          console.log(
            `[Payment] Kích hoạt lại enrollment 'cancelled' cho course: ${courseId}`
          );
          existingEnrollment.status = "pending";
          const savedDoc = await existingEnrollment.save({ session }); // <-- Luôn .save({ session })
          resultingEnrollments.push(savedDoc);
        } // TÌNH HUỐNG 2: Đã tồn tại & đang chờ
        else if (existingEnrollment.status === "pending") {
          console.log(
            `[Payment] Tái sử dụng enrollment 'pending' cho course: ${courseId}`
          );
          resultingEnrollments.push(existingEnrollment);
        } // TÌNH HUỐNG 3: Đã sở hữu
        else {
          console.error(
            `[Payment] LỖI: Người dùng ${userId} đã sở hữu course ${courseId}.`
          );
          const error = new Error(
            `Bạn đã sở hữu khoá học (Course ID: ${courseId}).`
          );
          error.statusCode = 409;
          throw error; // Ném lỗi sẽ bị bắt ở khối catch
        }
      } // TÌNH HUỐNG 4: Không tồn tại -> Tạo mới
      else {
        console.log(
          `[Payment] Tạo mới enrollment 'pending' cho course: ${courseId}`
        );
        const newEnrollment = new Enrollment({
          userId: userId,
          courseId: courseId,
          status: "pending",
        });
        const savedDoc = await newEnrollment.save({ session }); // <-- Luôn .save({ session })
        resultingEnrollments.push(savedDoc);
      }
    } // Kết thúc vòng lặp for...of
    const newEnrollmentIds = resultingEnrollments.map((e) => e._id); // BƯỚC 2: Tạo một Payment duy nhất

    const orderCode = parseInt(
      Date.now().toString() + Math.floor(Math.random() * 1000)
    );

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

    await session.commitTransaction(); // <-- Commit khi mọi thứ thành công

    res.status(200).json({
      message: "Tạo link thanh toán thành công",
      checkoutUrl: paymentLinkResponse.checkoutUrl,
    });
  } catch (error) {
    await session.abortTransaction(); // <-- Tự động abort nếu có lỗi
    console.error("Lỗi khi tạo link thanh toán:", error);

    if (error.statusCode === 409) {
      return res.status(409).json({ message: error.message });
    }

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

          // 4. Lấy dữ liệu 1 LẦN DUY NHẤT để dùng cho cả (5) và (6)
          const enrollments = await Enrollment.find({
            _id: { $in: payment.enrollmentIds },
          })
            .select("courseId")
            .populate({
              path: "courseId",
              select: "createdBy price title", // Lấy ID giảng viên và GIÁ KHÓA HỌC
            });

          // 5. Cập nhật số tiền cho giảng viên (LOGIC ĐÃ SỬA)
          try {
            const earningsMap = new Map(); // Dùng Map để cộng dồn doanh thu cho mỗi giảng viên

            for (const enrollment of enrollments) {
              if (enrollment.courseId) {
                const course = enrollment.courseId;
                const teacherId = course.createdBy.toString();

                // LỖI NGHIÊM TRỌNG ĐÃ SỬA: Tính 80% của GIÁ KHÓA HỌC, không phải tổng payment
                const coursePrice = parseFloat(course.price.toString());
                const revenueShare = coursePrice * 0.8;

                // Cộng dồn doanh thu (nếu giảng viên có nhiều khóa học trong 1 giao dịch)
                const currentEarnings = earningsMap.get(teacherId) || 0;
                earningsMap.set(teacherId, currentEarnings + revenueShare);
              }
            }

            // Tối ưu N+1 Query: Tạo mảng các promise
            const updatePromises = [];
            for (const [teacherId, totalRevenue] of earningsMap.entries()) {
              console.log(
                `[WEBHOOK] Chuẩn bị cập nhật +${totalRevenue} cho Giảng viên ID: ${teacherId}`
              );
              // Dùng $inc để cập nhật nguyên tử, an toàn và nhanh hơn find/save
              updatePromises.push(
                User.updateOne(
                  { _id: teacherId },
                  { $inc: { moneyLeft: totalRevenue } } // $inc sẽ tự động cộng dồn
                )
              );
            }

            // Chạy tất cả các lệnh cập nhật song song
            await Promise.all(updatePromises);
            console.log(
              `[WEBHOOK] Đã cập nhật tiền cho ${earningsMap.size} giảng viên.`
            );
          } catch (moneyError) {
            console.error(
              "[WEBHOOK] Lỗi khi cập nhật số tiền cho giảng viên:",
              moneyError
            );
          }

          // 6. Xoá các khoá học đã mua khỏi giỏ hàng (Dùng lại 'enrollments')
          try {
            const courseIdsToRemove = enrollments.map((e) => e.courseId._id); // Lấy _id từ course đã populate
            const userId = transaction.userId;

            console.log(
              `[WEBHOOK] Bắt đầu xóa ${courseIdsToRemove.length} khóa học khỏi giỏ hàng user: ${userId}`
            );

            const cart = await Cart.findOne({ userId: userId });
            if (cart) {
              const courseIdsStr = courseIdsToRemove.map((id) => id.toString());
              cart.courseIds = cart.courseIds.filter(
                (id) => !courseIdsStr.includes(id.toString())
              );
              await cart.save();
              console.log("[WEBHOOK] Đã xóa các khóa học khỏi giỏ hàng.");
            } else {
              console.log(
                `[WEBHOOK] Không tìm thấy giỏ hàng cho user: ${userId}.`
              );
            }
          } catch (cartError) {
            // Ghi lại lỗi nhưng không làm hỏng webhook
            console.error(
              "[WEBHOOK] Lỗi khi xóa giỏ hàng (nhưng thanh toán đã thành công):",
              cartError
            );
          }
          // 7. Gửi email thông báo ghi danh thành công cho từng khoá học
          try {
            // Lấy ID các khóa học từ 'enrollments' đã query
            const courseIds = enrollments.map((e) => e.courseId._id); // Lấy userId từ transaction đã query
            const userId = transaction.userId; // Gọi hàm gửi mail (không cần await để webhook trả về nhanh)

            sendIndividualEnrollmentEmails(userId, courseIds);
          } catch (emailError) {
            console.error(
              "[WEBHOOK] Giao dịch thành công nhưng gửi mail thất bại:",
              emailError
            );
          }
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

const sendIndividualEnrollmentEmails = async (userId, courseIds) => {
  try {
    // 1. Lấy thông tin người dùng (email, tên) - CHỈ 1 LẦN
    const user = await User.findById(userId).select("email fullName");

    if (!user) {
      console.log("[Email] Không tìm thấy người dùng, hủy gửi mail.");
      return;
    } // 2. Lấy thông tin các khóa học - CHỈ 1 LẦN // QUAN TRỌNG: Phải select 'title' và 'message.welcome'

    const courses = await Course.find({ _id: { $in: courseIds } }).select(
      "title message.welcome"
    );

    if (courses.length === 0) {
      console.log("[Email] Không tìm thấy khóa học, hủy gửi mail.");
      return;
    } // 3. Lặp qua TỪNG khóa học và gửi email

    for (const course of courses) {
      try {
        // 4. Tạo nội dung email từ template mới
        const emailContent = userEnrolledInCourseEmail(
          user.fullName,
          course.title,
          course.message.welcome // Truyền welcome message
        );
        console.log(course.message.welcome);

        await sendEmail(
          user.email,
          `Chào mừng bạn đến với khóa học: ${course.title}!`, // Tiêu đề email riêng
          emailContent
        );
      } catch (emailError) {
        // Nếu lỗi 1 email, ghi log và tiếp tục gửi các email khác
        console.error(
          `[Email] Lỗi khi gửi mail cho course ${course._id} tới user ${userId}:`,
          emailError
        );
      }
    }
  } catch (error) {
    // Lỗi nghiêm trọng (không tìm thấy user, lỗi DB)
    console.error(
      `[Email] Lỗi nghiêm trọng khi chuẩn bị gửi email cho user ${userId}:`,
      error
    );
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
