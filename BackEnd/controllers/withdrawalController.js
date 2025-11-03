const WithdrawalRequest = require("../models/withdrawRequestModel");
const User = require("../models/userModel"); // Đảm bảo đường dẫn này đúng
const mongoose = require("mongoose");

/**
 * Helper để xử lý Decimal128 an toàn
 * Chuyển đổi từ Decimal128 (từ DB) sang number (float)
 */
const toFloat = (decimal) => {
  if (!decimal) return 0;
  return parseFloat(decimal.toString());
};

/**
 * Helper để chuyển đổi từ number sang Decimal128 (để lưu vào DB)
 */
const toDecimal = (num) => {
  return mongoose.Types.Decimal128.fromString(num.toString());
};

// =================================================================
// API 1: Tạo request rút tiền (Instructor)
// POST /api/withdrawals
// =================================================================
exports.createWithdrawalRequest = async (req, res) => {
  const { amount } = req.body;
  const instructorId = req.user._id; // Lấy từ middleware authorize

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const requestedAmount = parseFloat(amount);

    // 1. Kiểm tra số tiền hợp lệ
    // (Bạn có thể đặt mức rút tối thiểu, ví dụ 50000)
    if (isNaN(requestedAmount) || requestedAmount <= 0) {
      await session.abortTransaction();
      return res.status(400).json({ message: "Số tiền yêu cầu không hợp lệ." });
    }

    const instructor = await User.findById(instructorId).session(session);

    // 2. Kiểm tra thông tin thanh toán
    if (
      !instructor.payoutDetails ||
      !instructor.payoutDetails.bankName ||
      !instructor.payoutDetails.accountNumber ||
      !instructor.payoutDetails.accountHolderName
    ) {
      await session.abortTransaction();
      return res.status(400).json({
        message: "Vui lòng cập nhật thông tin thanh toán trước khi rút tiền.",
      });
    }

    // 3. Kiểm tra số dư
    const currentBalance = toFloat(instructor.moneyLeft);
    if (currentBalance < requestedAmount) {
      await session.abortTransaction();
      return res.status(400).json({ message: "Số dư không đủ." });
    }

    // 4. Kiểm tra xem có request 'pending' nào không
    const existingPendingRequest = await WithdrawalRequest.findOne({
      instructorId: instructorId,
      status: "pending",
    }).session(session);

    if (existingPendingRequest) {
      await session.abortTransaction();
      return res.status(400).json({
        message: "Bạn đã có một yêu cầu rút tiền đang chờ xử lý.",
      });
    }

    // 5. TRỪ TIỀN (Hold tiền)
    const newBalance = currentBalance - requestedAmount;
    instructor.moneyLeft = toDecimal(newBalance);
    await instructor.save({ session });

    // 6. TẠO REQUEST
    const newRequest = new WithdrawalRequest({
      instructorId: instructorId,
      amount: toDecimal(requestedAmount),
      status: "pending",
      payoutDetails: instructor.payoutDetails, // Sao chép thông tin thanh toán tại thời điểm yêu cầu
    });
    await newRequest.save({ session });

    // 7. Hoàn tất
    await session.commitTransaction();

    res.status(201).json(newRequest);
  } catch (error) {
    await session.abortTransaction();
    console.error("Lỗi khi tạo yêu cầu rút tiền:", error);
    res.status(500).json({ message: "Lỗi máy chủ nội bộ." });
  } finally {
    session.endSession();
  }
};

// =================================================================
// API 2: Cập nhật trạng thái request (Instructor + Admin)
// PATCH /api/withdrawals/:id
// =================================================================
exports.updateWithdrawalStatus = async (req, res) => {
  const { id } = req.params;
  const { status, adminNotes } = req.body;
  const user = req.user; // Lấy từ middleware authorize

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const request = await WithdrawalRequest.findById(id).session(session);

    if (!request) {
      await session.abortTransaction();
      return res.status(404).json({ message: "Không tìm thấy yêu cầu." });
    }

    // ========== KỊCH BẢN 1: INSTRUCTOR XỬ LÝ ==========
    if (user.role === "instructor") {
      // 1. Instructor chỉ được phép "cancelled"
      if (status !== "cancelled") {
        await session.abortTransaction();
        return res
          .status(400)
          .json({ message: "Bạn chỉ có quyền hủy (cancel) yêu cầu này." });
      }

      // 2. Phải là chủ sở hữu của request
      if (request.instructorId.toString() !== user._id.toString()) {
        await session.abortTransaction();
        return res.status(403).json({
          message: "Bạn không có quyền cập nhật yêu cầu của người khác.",
        });
      }

      // 3. Chỉ được hủy khi request đang "pending"
      if (request.status !== "pending") {
        await session.abortTransaction();
        return res.status(400).json({
          message: `Không thể hủy yêu cầu đã ở trạng thái ${request.status}.`,
        });
      }

      // 4. HOÀN TIỀN lại cho instructor
      const instructor = await User.findById(user._id).session(session);
      const currentBalance = toFloat(instructor.moneyLeft);
      const requestAmount = toFloat(request.amount);
      const newBalance = currentBalance + requestAmount;

      instructor.moneyLeft = toDecimal(newBalance);
      await instructor.save({ session });

      request.status = "cancelled";
      await request.save({ session });
    }
    // ========== KỊCH BẢN 2: ADMIN XỬ LÝ ==========
    else if (user.role === "admin") {
      // 1. Admin chỉ được phép "approved" hoặc "rejected"
      if (!["approved", "rejected"].includes(status)) {
        await session.abortTransaction();
        return res
          .status(400)
          .json({ message: "Admin chỉ có thể 'approved' hoặc 'rejected'." });
      }

      // 2. Admin chỉ có thể xử lý request đang 'pending'
      if (request.status !== "pending") {
        await session.abortTransaction();
        return res.status(400).json({
          message: `Không thể xử lý request đã ở trạng thái ${request.status}.`,
        });
      }

      // 3. Nếu Admin TỪ CHỐI (rejected) -> Phải hoàn tiền
      if (status === "rejected") {
        if (!adminNotes) {
          await session.abortTransaction();
          return res
            .status(400)
            .json({ message: "Cần cung cấp lý do từ chối (adminNotes)." });
        }

        // HOÀN TIỀN (cho instructor của request)
        const instructor = await User.findById(request.instructorId).session(
          session
        );
        const currentBalance = toFloat(instructor.moneyLeft);
        const requestAmount = toFloat(request.amount);
        const newBalance = currentBalance + requestAmount;

        instructor.moneyLeft = toDecimal(newBalance);
        await instructor.save({ session });

        request.adminNotes = adminNotes;
      }

      // 4. Cập nhật trạng thái và người xử lý
      // (Nếu là "approved", tiền đã bị trừ lúc tạo nên không cần làm gì thêm)
      request.status = status;
      request.processedBy = user._id; // Lưu lại admin nào đã xử lý
      if (adminNotes) request.adminNotes = adminNotes;

      await request.save({ session });
    }

    // 5. Hoàn tất
    await session.commitTransaction();
    res.status(200).json(request);
  } catch (error) {
    await session.abortTransaction();
    console.error("Lỗi khi cập nhật yêu cầu rút tiền:", error);
    res.status(500).json({ message: "Lỗi máy chủ nội bộ." });
  } finally {
    session.endSession();
  }
};

// =================================================================
// API 3: Xem list request rút tiền (Instructor + Admin)
// GET /api/withdrawals
// =================================================================
exports.getWithdrawalRequests = async (req, res) => {
  const user = req.user;
  let query = {}; // Query rỗng theo mặc định

  try {
    // Kịch bản 1: Instructor chỉ xem được request của mình
    if (user.role === "instructor") {
      query.instructorId = user._id;
    }
    // Kịch bản 2: Admin xem tất cả và có thể lọc
    else if (user.role === "admin") {
      // ***** SỬA LỖI TẠI ĐÂY *****
      // Chỉ thêm bộ lọc status NẾU nó tồn tại VÀ nó không phải là "all"
      if (req.query.status && req.query.status !== "all") {
        query.status = req.query.status;
      }
      // ***************************

      // Cho phép admin lọc theo 1 instructor cụ thể (ví dụ: /api/withdrawals?instructorId=...)
      if (req.query.instructorId) {
        query.instructorId = req.query.instructorId;
      }
    }

    const requests = await WithdrawalRequest.find(query)
      // THÊM 'payoutDetails' VÀO DANH SÁCH CÁC TRƯỜNG ĐƯỢC CHỌN
      .populate(
        "instructorId",
        "userName email userImage firstName lastName payoutDetails"
      )
      .populate("processedBy", "userName firstName lastName")
      .sort({ createdAt: -1 });

    res.status(200).json(requests);
  } catch (error) {
    console.error("Lỗi khi lấy danh sách yêu cầu:", error);
    res.status(500).json({ message: "Lỗi máy chủ nội bộ." });
  }
};
