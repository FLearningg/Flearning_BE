require('dotenv').config(); // Load environment variables
const sendEmail = require('./utils/sendEmail');

// Test email function
const testEmail = async () => {
  console.log('Testing email sending...');
  
  const result = await sendEmail(
    'test@example.com', // Replace with a test email
    'Test Email from F-Learning',
    '<h1>This is a test email</h1><p>If you receive this, email sending is working correctly.</p>'
  );
  
  if (result.success) {
    console.log('✅ Email sent successfully!');
    console.log('Result:', result);
  } else {
    console.log('❌ Email sending failed!');
    console.log('Error:', result.error);
    if (result.details) {
      console.log('Details:', result.details);
    }
  }
};

testEmail();