# Quy tắc viết Comment (Commenting Rules)

Sử dụng định dạng JSDoc để viết comment cho các hàm, đặc biệt là các hàm trong controller và service. Điều này không chỉ giúp người khác hiểu code mà còn hỗ trợ các công cụ tự động tạo tài liệu API (như Swagger).

## Cấu trúc Comment chuẩn cho một API Endpoint

Đây là cấu trúc comment được yêu cầu, đặt ngay phía trên hàm controller xử lý endpoint.

### Ví dụ:

```javascript
/**
 * @desc Mô tả ngắn gọn chức năng của API. (Ví dụ: Cập nhật thông tin một section)
 * @route [METHOD] /path/to/api (Ví dụ: PUT /api/admin/courses/:courseId/sections/:sectionId)
 * @access Quyền truy cập. (Ví dụ: Private (Admin only), Public)
 */
```
