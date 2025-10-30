require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/userModel');
const Token = require('./models/tokenModel');
const { userBannedEmail } = require('./utils/emailTemplates');
const sendEmail = require('./utils/sendEmail');

// Test banning a user
const testBanUser = async () => {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB');
    
    // Find a test user (using a real user ID from the database)
    const testUserId = '68d3266bccc7e6a2a3579b5c'; // Using nomsociuu2004@gmail.com for testing
    const user = await User.findById(testUserId);
    
    if (!user) {
      console.log('Test user not found. Please update the testUserId in the script.');
      return;
    }
    
    console.log(`Found user: ${user.firstName} ${user.lastName} (${user.email})`);
    
    // Update user status to banned
    user.status = 'banned';
    await user.save();
    console.log('User status updated to banned');
    
    // Delete all refresh tokens for this user
    await Token.deleteMany({ userId: testUserId });
    console.log('All sessions terminated for banned user');
    
    // Send email notification
    try {
      const emailContent = userBannedEmail(user.firstName || user.userName);
      const emailResult = await sendEmail(
        user.email,
        "Your Account Has Been Banned",
        emailContent
      );
      
      if (emailResult.success) {
        console.log(`✅ Ban notification email sent successfully to: ${user.email}`);
      } else {
        console.error(`❌ Failed to send ban notification email to ${user.email}:`, emailResult.error);
      }
    } catch (emailError) {
      console.error("❌ Error sending ban notification email:", emailError);
    }
    
    console.log('✅ Test completed successfully');
  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
};

testBanUser();