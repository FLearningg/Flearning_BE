const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const User = require('../models/userModel'); // Đảm bảo đường dẫn này đúng
require('dotenv').config();

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: `${process.env.BACKEND_URL}/api/auth/google/callback`,
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        const { id, displayName, emails, photos } = profile;
        const email = emails[0].value;
        const [firstName, ...lastNameParts] = displayName.split(' ');
        const lastName = lastNameParts.join(' ');

        let user = await User.findOne({ email });

        if (user) {
          // Nếu user đã tồn tại, cập nhật thông tin nếu cần
          if (!user.googleId) {
            user.googleId = id;
          }
          if (!user.userImage && photos?.[0]?.value) {
            user.userImage = photos[0].value;
          }
          user.status = 'verified'; // Luôn đảm bảo user Google đã được xác thực
          await user.save();
          return done(null, user);
        } else {
          // Nếu chưa tồn tại, tạo user mới
          const newUser = await User.create({
            firstName: firstName || displayName,
            lastName: lastName || '',
            email,
            userImage: photos?.[0]?.value || '',
            status: 'verified',
            role: 'student',
            googleId: id,
          });
          return done(null, newUser);
        }
      } catch (error) {
        console.error('Error in Google OAuth Strategy:', error);
        return done(error, null);
      }
    }
  )
);

// Serialize và Deserialize user để quản lý session
passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser((id, done) => {
  User.findById(id, (err, user) => {
    done(err, user);
  });
});