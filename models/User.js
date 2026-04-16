const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  phone:             { type: String, required: true, unique: true, trim: true },
  name:              { type: String, default: '' },
  email:             { type: String, default: '' },
  isPhoneVerified:   { type: Boolean, default: false },
  isProfileComplete: { type: Boolean, default: false },
  targetRole:        { type: String, default: 'software-engineer' },
  experienceLevel:   { type: String, default: 'mid' },
  plan:              { type: String, default: 'free' },
  totalInterviews:   { type: Number, default: 0 },
  totalPracticeMin:  { type: Number, default: 0 },
  averageScore:      { type: Number, default: 0 },
  streak:            { type: Number, default: 0 },
  lastActiveDate:    { type: Date },
  // Resume fields
  resumeUrl:         { type: String, default: '' },
  resumeText:        { type: String, default: '' },
  resumeData:        { type: mongoose.Schema.Types.Mixed, default: null },
  otp: {
    code:      String,
    expiresAt: Date,
    attempts:  { type: Number, default: 0 }
  }
}, { timestamps: true });

userSchema.methods.generateOTP = function() {
  const code = String(Math.floor(100000 + Math.random() * 900000));
  this.otp = { code, expiresAt: new Date(Date.now() + 10*60*1000), attempts: 0 };
  return code;
};

userSchema.methods.verifyOTP = function(input) {
  if (!this.otp?.code)                 return { valid: false, reason: 'No OTP found. Request a new one.' };
  if (new Date() > this.otp.expiresAt) return { valid: false, reason: 'OTP expired. Request a new one.' };
  if (this.otp.attempts >= 5)          return { valid: false, reason: 'Too many attempts. Request a new OTP.' };
  this.otp.attempts += 1;
  if (this.otp.code !== String(input).trim()) return { valid: false, reason: 'Wrong OTP. Try again.' };
  this.otp = { code: null, expiresAt: null, attempts: 0 };
  this.isPhoneVerified = true;
  return { valid: true };
};

module.exports = mongoose.model('User', userSchema);
