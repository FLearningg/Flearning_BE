const jwt = require('jsonwebtoken');
const User = require('../models/userModel');

/**
 * Hàm phân quyền, nhận vào danh sách các role được phép.
 * Ví dụ: authorize('admin') hoặc authorize('admin', 'student')
 * Nếu gọi authorize() mà không có tham số, nó chỉ kiểm tra người dùng đã đăng nhập hay chưa.
 */
const authorize = (...roles) => {
    // Trả về một middleware function
    return async (req, res, next) => {
        let token;

        // 1. Xác thực (Authentication) - Kiểm tra token có hợp lệ không
        if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
            try {
                token = req.headers.authorization.split(' ')[1];
                const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
                req.user = await User.findById(decoded.id).select('-password');
                
                if (!req.user) {
                    return res.status(401).json({ message: 'Người dùng không tồn tại' });
                }

                // 2. Phân quyền (Authorization) - Kiểm tra vai trò của người dùng
                // Nếu có truyền vào danh sách role, và role của user không nằm trong danh sách đó
                if (roles.length > 0 && !roles.includes(req.user.role)) {
                    // 403 Forbidden - Đã xác thực nhưng không có quyền
                    return res.status(403).json({ message: 'Bạn không có quyền truy cập vào tài nguyên này' });
                }

                // Nếu mọi thứ hợp lệ, đi tiếp
                next();

            } catch (error) {
                return res.status(401).json({ message: 'Token không hợp lệ hoặc đã hết hạn' });
            }
        }

        if (!token) {
            return res.status(401).json({ message: 'Không có quyền truy cập, không tìm thấy token' });
        }
    };
};

module.exports = authorize;