const F_LEARNING_ORANGE = "#FF6B00";
const F_LEARNING_LIGHT = "#FFF7E6";

// Common email header with logo
const emailHeader = (title) => `
  <div style="background: linear-gradient(135deg, ${F_LEARNING_ORANGE} 0%, #ff8534 100%); padding: 40px 20px; text-align: center; border-radius: 12px 12px 0 0;">
    <h1 style="color: white; margin: 0; font-size: 32px; font-weight: bold;">🎓 F-Learning</h1>
    <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0; font-size: 16px;">${title}</p>
  </div>
`;

// Common email footer
const emailFooter = () => `
  <div style="background-color: #f5f5f5; padding: 30px 20px; text-align: center; border-radius: 0 0 12px 12px; margin-top: 30px;">
    <p style="color: #8c8c8c; margin: 0 0 10px 0; font-size: 14px;">
      © 2024 F-Learning. All rights reserved.
    </p>
    <p style="color: #8c8c8c; margin: 0; font-size: 12px;">
      If you have any questions, please contact us at support@f-learning.com
    </p>
  </div>
`;

// Email wrapper
const emailWrapper = (content) => `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
  </head>
  <body style="margin: 0; padding: 0; font-family: 'Arial', sans-serif; background-color: #f5f5f5;">
    <div style="max-width: 600px; margin: 40px auto; background-color: white; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); overflow: hidden;">
      ${content}
    </div>
  </body>
  </html>
`;

// Button component
const button = (url, text, isPrimary = true) => {
  const bgColor = isPrimary ? F_LEARNING_ORANGE : "transparent";
  const textColor = isPrimary ? "white" : F_LEARNING_ORANGE;
  const border = isPrimary ? "none" : `2px solid ${F_LEARNING_ORANGE}`;

  return `
    <a href="${url}"
       style="display: inline-block;
              background-color: ${bgColor};
              color: ${textColor};
              padding: 14px 32px;
              text-decoration: none;
              border-radius: 8px;
              font-weight: bold;
              font-size: 16px;
              border: ${border};
              margin: 20px 0;">
      ${text}
    </a>
  `;
};

/**
 * Student verification email
 */
exports.studentVerificationEmail = (firstName, verificationUrl) => {
  const content = `
    ${emailHeader("Welcome to F-Learning!")}
    <div style="padding: 40px 30px;">
      <h2 style="color: #262626; margin-top: 0;">Hi ${firstName},</h2>
      <p style="color: #595959; font-size: 16px; line-height: 1.6;">
        Thank you for joining F-Learning! We're excited to have you as part of our learning community.
      </p>
      <p style="color: #595959; font-size: 16px; line-height: 1.6;">
        To get started, please verify your email address by clicking the button below:
      </p>
      <div style="text-align: center; margin: 30px 0;">
        ${button(verificationUrl, "Verify Email Address")}
      </div>
      <div style="background-color: ${F_LEARNING_LIGHT}; padding: 16px; border-radius: 8px; border-left: 4px solid ${F_LEARNING_ORANGE};">
        <p style="margin: 0; color: #8c8c8c; font-size: 14px;">
          <strong>Note:</strong> This link will expire in 24 hours. If you didn't create an account, please ignore this email.
        </p>
      </div>
      <p style="color: #595959; font-size: 14px; margin-top: 30px;">
        If the button doesn't work, copy and paste this link into your browser:
      </p>
      <p style="color: ${F_LEARNING_ORANGE}; font-size: 13px; word-break: break-all;">
        ${verificationUrl}
      </p>
    </div>
    ${emailFooter()}
  `;

  return emailWrapper(content);
};

/**
 * Instructor verification email - Different from student
 */
exports.instructorVerificationEmail = (firstName, verificationUrl) => {
  const content = `
    ${emailHeader("Welcome to F-Learning Instructor Community!")}
    <div style="padding: 40px 30px;">
      <h2 style="color: #262626; margin-top: 0;">Hi ${firstName},</h2>
      <p style="color: #595959; font-size: 16px; line-height: 1.6;">
        Thank you for applying to become an instructor on F-Learning! We're thrilled to have you join our teaching community.
      </p>
      <p style="color: #595959; font-size: 16px; line-height: 1.6;">
        <strong>First, let's verify your email address:</strong>
      </p>
      <div style="text-align: center; margin: 30px 0;">
        ${button(verificationUrl, "Verify Email Address")}
      </div>
      <div style="background-color: #e6f7ff; padding: 20px; border-radius: 8px; margin: 20px 0;">
        <h3 style="color: #262626; margin-top: 0; font-size: 18px;">📋 What's Next?</h3>
        <ol style="color: #595959; font-size: 15px; line-height: 1.8; margin: 0; padding-left: 20px;">
          <li><strong>Verify your email</strong> (click the button above)</li>
          <li><strong>Admin review</strong> - Our team will review your application (1-2 business days)</li>
          <li><strong>Get approved</strong> - You'll receive an email notification once approved</li>
          <li><strong>Start teaching</strong> - Begin creating courses and sharing your knowledge!</li>
        </ol>
      </div>
      <div style="background-color: ${F_LEARNING_LIGHT}; padding: 16px; border-radius: 8px; border-left: 4px solid ${F_LEARNING_ORANGE};">
        <p style="margin: 0; color: #8c8c8c; font-size: 14px;">
          <strong>Important:</strong> Your instructor access will be available only after admin approval.
          You can log in to your account, but instructor features will be unlocked once your application is approved.
        </p>
      </div>
      <p style="color: #595959; font-size: 14px; margin-top: 30px;">
        If the button doesn't work, copy and paste this link into your browser:
      </p>
      <p style="color: ${F_LEARNING_ORANGE}; font-size: 13px; word-break: break-all;">
        ${verificationUrl}
      </p>
    </div>
    ${emailFooter()}
  `;

  return emailWrapper(content);
};

/**
 * Instructor application received confirmation
 */
exports.instructorApplicationReceivedEmail = (
  firstName,
  lastName,
  email,
  phone,
  expertise
) => {
  const content = `
    ${emailHeader("Application Received")}
    <div style="padding: 40px 30px;">
      <h2 style="color: #262626; margin-top: 0;">Dear ${firstName} ${lastName},</h2>
      <p style="color: #595959; font-size: 16px; line-height: 1.6;">
        Thank you for applying to become an instructor on F-Learning! 🎉
      </p>
      <p style="color: #595959; font-size: 16px; line-height: 1.6;">
        We have received your application and our team will review it shortly.
      </p>
      <div style="background-color: #f9f9f9; padding: 20px; border-radius: 8px; margin: 25px 0;">
        <h3 style="color: #262626; margin-top: 0; font-size: 18px;">📄 Application Summary</h3>
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="padding: 8px 0; color: #8c8c8c; font-size: 14px;"><strong>Email:</strong></td>
            <td style="padding: 8px 0; color: #262626; font-size: 14px;">${email}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #8c8c8c; font-size: 14px;"><strong>Phone:</strong></td>
            <td style="padding: 8px 0; color: #262626; font-size: 14px;">${phone}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #8c8c8c; font-size: 14px;"><strong>Expertise:</strong></td>
            <td style="padding: 8px 0; color: #262626; font-size: 14px;">${expertise}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #8c8c8c; font-size: 14px;"><strong>Status:</strong></td>
            <td style="padding: 8px 0; color: ${F_LEARNING_ORANGE}; font-size: 14px;"><strong>Pending Review</strong></td>
          </tr>
        </table>
      </div>
      <p style="color: #595959; font-size: 16px; line-height: 1.6;">
        You will receive an email notification once your application has been processed.
      </p>
      <p style="color: #595959; font-size: 16px; line-height: 1.6;">
        If you have any questions, please don't hesitate to contact us.
      </p>
    </div>
    ${emailFooter()}
  `;

  return emailWrapper(content);
};

/**
 * Password reset email
 */
exports.passwordResetEmail = (firstName, resetUrl) => {
  const content = `
    ${emailHeader("Password Reset Request")}
    <div style="padding: 40px 30px;">
      <h2 style="color: #262626; margin-top: 0;">Hi ${firstName},</h2>
      <p style="color: #595959; font-size: 16px; line-height: 1.6;">
        We received a request to reset your password for your F-Learning account.
      </p>
      <p style="color: #595959; font-size: 16px; line-height: 1.6;">
        Click the button below to reset your password:
      </p>
      <div style="text-align: center; margin: 30px 0;">
        ${button(resetUrl, "Reset Password")}
      </div>
      <div style="background-color: #fff7e6; padding: 16px; border-radius: 8px; border-left: 4px solid #faad14;">
        <p style="margin: 0; color: #8c8c8c; font-size: 14px;">
          <strong>Security Notice:</strong> This link is valid for 1 hour only. If you didn't request a password reset, please ignore this email or contact support if you're concerned.
        </p>
      </div>
      <p style="color: #595959; font-size: 14px; margin-top: 30px;">
        If the button doesn't work, copy and paste this link into your browser:
      </p>
      <p style="color: ${F_LEARNING_ORANGE}; font-size: 13px; word-break: break-all;">
        ${resetUrl}
      </p>
    </div>
    ${emailFooter()}
  `;

  return emailWrapper(content);
};

/**
 * Mobile app reset code email
 */
exports.mobileResetCodeEmail = (firstName, resetCode) => {
  const content = `
    ${emailHeader("Password Reset Code")}
    <div style="padding: 40px 30px;">
      <h2 style="color: #262626; margin-top: 0;">Hi ${firstName},</h2>
      <p style="color: #595959; font-size: 16px; line-height: 1.6;">
        Your password reset code for the F-Learning mobile app is:
      </p>
      <div style="background: linear-gradient(135deg, ${F_LEARNING_ORANGE} 0%, #ff8534 100%); padding: 30px; border-radius: 12px; text-align: center; margin: 30px 0;">
        <h1 style="color: white; font-size: 48px; letter-spacing: 8px; margin: 0; font-family: 'Courier New', monospace;">
          ${resetCode}
        </h1>
      </div>
      <div style="background-color: #fff7e6; padding: 16px; border-radius: 8px; border-left: 4px solid #faad14;">
        <p style="margin: 0; color: #8c8c8c; font-size: 14px;">
          <strong>Security Notice:</strong> This code is valid for 10 minutes. If you didn't request this code, please ignore this email.
        </p>
      </div>
    </div>
    ${emailFooter()}
  `;

  return emailWrapper(content);
};
/**
 * Instructor application denied email
 */
exports.instructorApplicationDeniedEmail = (firstName, reason) => {
  const content = `
    ${emailHeader("Application Denied")}
    <div style="padding: 40px 30px;">
      <h2 style="color: #262626; margin-top: 0;">Dear ${firstName},</h2>
      <p style="color: #595959; font-size: 16px; line-height: 1.6;">
        We regret to inform you that your application to become an instructor on F-Learning has been denied.
      </p>
      <div style="background-color: #fff7e6; padding: 20px; border-radius: 8px; margin: 25px 0;">
        <h3 style="color: #262626; margin-top: 0; font-size: 18px;">Reason for Denial:</h3>
        <p style="color: #8c8c8c; font-size: 14px; margin: 0;">${reason}</p>
      </div>
      <p style="color: #595959; font-size: 16px; line-height: 1.6;">
        If you believe this decision was made in error or have further questions, please contact us at support@f-learning.com.
      </p>
    </div>
    ${emailFooter()}
  `;

  return emailWrapper(content);
};
/**
 * Instructor application approved email
 */
exports.instructorApplicationApprovedEmail = (firstName) => {
  const content = `
    ${emailHeader("Application Approved")}
    <div style="padding: 40px 30px;">
      <h2 style="color: #262626; margin-top: 0;">Congratulations ${firstName}!</h2>
      <p style="color: #595959; font-size: 16px; line-height: 1.6;">
        We are thrilled to inform you that your application to become an instructor on F-Learning has been approved! 🎉
      </p>
      <p style="color: #595959; font-size: 16px; line-height: 1.6;">
        You can now log in to your account and start creating courses to share your knowledge with our learning community.
      </p>
      <div style="text-align: center; margin: 30px 0;">
        ${button("https://f-learning.com/login", "Log In to Your Account")}
      </div>
      <p style="color: #595959; font-size: 16px; line-height: 1.6;">
        If you have any questions or need assistance, feel free to reach out to us at support@f-learning.com.
      </p>
    </div>
    ${emailFooter()}
  `;

  return emailWrapper(content);
};
