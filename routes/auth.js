// ═══════════════════════════════════════════
//  routes/auth.js
// ═══════════════════════════════════════════
const express = require('express');
const jwt     = require('jsonwebtoken');
const twilio  = require('twilio');
const User    = require('../models/User');
const { protect } = require('../middleware/auth');

const router = express.Router();

// ── Twilio client (lazy init — won't crash if creds missing) ──
let twilioClient = null;
try {
  if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
    twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  }
} catch (_) {}

// ── Helper: sign JWT ──────────────────────────
const signToken = (userId) =>
  jwt.sign({ id: userId }, process.env.JWT_SECRET, {
    expiresIn: `${process.env.JWT_EXPIRY_DAYS || 7}d`,
  });

// ── Helper: send SMS via Twilio ────────────────
async function sendSMS(to, body) {
  if (!twilioClient) {
    // DEV MODE — just log the OTP
    console.log(`\n📱  [DEV - OTP] To: ${to}  Code: ${body}\n`);
    return { sid: 'DEV_MODE' };
  }
  return twilioClient.messages.create({
    body,
    from: process.env.TWILIO_PHONE_NUMBER,
    to,
  });
}

// ══════════════════════════════════════════════
//  POST /api/auth/send-otp
//  Body: { phone: "+919876543210" }
// ══════════════════════════════════════════════
router.post('/send-otp', async (req, res) => {
  try {
    let { phone } = req.body;

    if (!phone) return res.status(400).json({ success: false, message: 'Phone number is required.' });

    // Normalise: ensure starts with +
    phone = String(phone).trim();
    if (!phone.startsWith('+')) phone = '+' + phone;

    // Validate
    if (!/^\+[1-9]\d{9,14}$/.test(phone)) {
      return res.status(400).json({ success: false, message: 'Invalid phone number format. Use international format e.g. +919876543210' });
    }

    // Find or create user
    let user = await User.findOne({ phone });
    if (!user) {
      user = new User({ phone });
    }

    // Generate OTP
    const code = user.generateOTP();
    await user.save();

    // Send SMS
    await sendSMS(phone, `Your PrepWise OTP is: ${code}. Valid for ${process.env.OTP_EXPIRY_MINUTES || 10} minutes. Do not share this code.`);

    res.json({
      success  : true,
      message  : 'OTP sent successfully.',
      isNewUser: !user.isPhoneVerified,
      // In dev mode, return otp for testing (REMOVE IN PRODUCTION)
      ...(process.env.NODE_ENV === 'development' && { devOtp: code }),
    });
  } catch (err) {
    console.error('send-otp error:', err);
    res.status(500).json({ success: false, message: 'Failed to send OTP. Please try again.' });
  }
});

// ══════════════════════════════════════════════
//  POST /api/auth/verify-otp
//  Body: { phone, otp, name? }
// ══════════════════════════════════════════════
router.post('/verify-otp', async (req, res) => {
  try {
    let { phone, otp, name } = req.body;

    if (!phone || !otp) {
      return res.status(400).json({ success: false, message: 'Phone and OTP are required.' });
    }

    phone = String(phone).trim();
    if (!phone.startsWith('+')) phone = '+' + phone;

    const user = await User.findOne({ phone });
    if (!user) {
      return res.status(404).json({ success: false, message: 'Phone number not registered. Please request OTP first.' });
    }

    const result = user.verifyOTP(String(otp).trim());
    if (!result.valid) {
      await user.save(); // save attempt count
      return res.status(400).json({ success: false, message: result.reason });
    }

    // If name provided (signup flow)
    if (name && name.trim()) {
      user.name             = name.trim();
      user.isProfileComplete = true;
    }

    // Update last active
    user.lastActiveDate = new Date();
    await user.save();

    const token = signToken(user._id);

    res.json({
      success  : true,
      message  : 'Phone verified successfully!',
      token,
      isNewUser: !user.isProfileComplete,
      user     : {
        id              : user._id,
        phone           : user.phone,
        name            : user.name,
        isProfileComplete: user.isProfileComplete,
        plan            : user.plan,
        targetRole      : user.targetRole,
        experienceLevel : user.experienceLevel,
        totalInterviews : user.totalInterviews,
        averageScore    : user.averageScore,
        streak          : user.streak,
      },
    });
  } catch (err) {
    console.error('verify-otp error:', err);
    res.status(500).json({ success: false, message: 'Verification failed. Please try again.' });
  }
});

// ══════════════════════════════════════════════
//  GET /api/auth/me  — get current user
// ══════════════════════════════════════════════
router.get('/me', protect, async (req, res) => {
  res.json({
    success: true,
    user   : {
      id              : req.user._id,
      phone           : req.user.phone,
      name            : req.user.name,
      email           : req.user.email,
      isProfileComplete: req.user.isProfileComplete,
      plan            : req.user.plan,
      targetRole      : req.user.targetRole,
      experienceLevel : req.user.experienceLevel,
      totalInterviews : req.user.totalInterviews,
      averageScore    : req.user.averageScore,
      streak          : req.user.streak,
      avatarUrl       : req.user.avatarUrl,
    },
  });
});

// ══════════════════════════════════════════════
//  POST /api/auth/logout
// ══════════════════════════════════════════════
router.post('/logout', protect, (req, res) => {
  res.json({ success: true, message: 'Logged out successfully.' });
});

module.exports = router;
