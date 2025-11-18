require('dotenv').config(); // Ensure environment variables are loaded
const nodemailer = require("nodemailer");

const sendEmail = async (email, subject, textOrHtml) => {
  try {
    console.log("Attempting to send email...");
    console.log("Email host:", process.env.EMAIL_HOST);
    console.log("Email port:", process.env.EMAIL_PORT);
    console.log("Email user:", process.env.EMAIL_USER);
    console.log("Recipient:", email);
    
    // Try different configuration for Gmail
    const transporter = nodemailer.createTransport({
      service: 'gmail', // Use Gmail service instead of custom host
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
      tls: {
        rejectUnauthorized: false
      },
      debug: true,
      logger: true
    });

    // Verify connection configuration
    await transporter.verify();
    console.log("Server is ready to take our messages");

    const mailOptions = {
      from: `"F-Learning" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: subject,
      html: textOrHtml,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log(`Email sent successfully to: ${email}`);
    console.log("Message ID:", info.messageId);
    console.log("Response:", info.response);
    return { success: true, info };
  } catch (error) {
    console.error("Email not sent");
    console.error("Error details:", error);
    
    // More detailed error logging
    if (error.code) {
      console.error("Error code:", error.code);
    }
    if (error.command) {
      console.error("Failed command:", error.command);
    }
    
    // Try alternative configuration if first one fails
    try {
      console.log("Trying alternative email configuration...");
      const altTransporter = nodemailer.createTransport({
        host: process.env.EMAIL_HOST,
        port: Number(process.env.EMAIL_PORT),
        secure: true, // Try with secure true
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASS,
        },
        debug: true,
        logger: true
      });
      
      await altTransporter.verify();
      console.log("Alternative server is ready to take our messages");
      
      const info = await altTransporter.sendMail({
        from: `"F-Learning" <${process.env.EMAIL_USER}>`,
        to: email,
        subject: subject,
        html: textOrHtml,
      });
      
      console.log(`Email sent successfully with alternative config to: ${email}`);
      return { success: true, info };
    } catch (altError) {
      console.error("Alternative configuration also failed:", altError);
      return { success: false, error: error.message, details: error, altError: altError.message };
    }
  }
};

module.exports = sendEmail;
