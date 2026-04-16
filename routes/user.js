// ═══════════════════════════════════════════
//  routes/user.js
// ═══════════════════════════════════════════
const express  = require('express');
const multer   = require('multer');
const path     = require('path');
const fs       = require('fs');
const User     = require('../models/User');
const Interview= require('../models/Interview');
const { protect } = require('../middleware/auth');

const router = express.Router();

// ── Multer for avatar uploads ─────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '../uploads/avatars');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `avatar_${req.user._id}_${Date.now()}${ext}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      return cb(new Error('Only images allowed'));
    }
    cb(null, true);
  },
});

// ══════════════════════════════════════════════
//  GET /api/user/profile
// ══════════════════════════════════════════════
router.get('/profile', protect, (req, res) => {
  const u = req.user;
  res.json({
    success: true,
    user: {
      id              : u._id,
      phone           : u.phone,
      name            : u.name,
      email           : u.email,
      avatarUrl       : u.avatarUrl,
      targetRole      : u.targetRole,
      experienceLevel : u.experienceLevel,
      targetCompanies : u.targetCompanies,
      plan            : u.plan,
      planExpiresAt   : u.planExpiresAt,
      totalInterviews : u.totalInterviews,
      averageScore    : u.averageScore,
      streak          : u.streak,
      totalPracticeMin: u.totalPracticeMin,
      isProfileComplete: u.isProfileComplete,
      createdAt       : u.createdAt,
    },
  });
});

// ══════════════════════════════════════════════
//  PATCH /api/user/profile  — update profile
// ══════════════════════════════════════════════
router.patch('/profile', protect, async (req, res) => {
  try {
    const allowed = ['name', 'email', 'targetRole', 'experienceLevel', 'targetCompanies'];
    const updates = {};
    allowed.forEach((field) => {
      if (req.body[field] !== undefined) updates[field] = req.body[field];
    });

    // Mark profile complete if name is set
    if (updates.name && updates.name.trim()) {
      updates.isProfileComplete = true;
    }

    const user = await User.findByIdAndUpdate(req.user._id, updates, { new: true, runValidators: true }).select('-otp');

    res.json({ success: true, message: 'Profile updated.', user });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// ══════════════════════════════════════════════
//  POST /api/user/avatar  — upload avatar
// ══════════════════════════════════════════════
router.post('/avatar', protect, upload.single('avatar'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded.' });

    const avatarUrl = `/uploads/avatars/${req.file.filename}`;
    await User.findByIdAndUpdate(req.user._id, { avatarUrl });

    res.json({ success: true, avatarUrl });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ══════════════════════════════════════════════
//  GET /api/user/dashboard — dashboard stats
// ══════════════════════════════════════════════
router.get('/dashboard', protect, async (req, res) => {
  try {
    const userId = req.user._id;

    // Recent 5 interviews
    const recentInterviews = await Interview.find({ userId, status: 'completed' })
      .sort({ completedAt: -1 })
      .limit(5)
      .select('interviewType role overallScore durationMin completedAt createdAt');

    // Score over last 10
    const scoreHistory = await Interview.find({ userId, status: 'completed' })
      .sort({ completedAt: -1 })
      .limit(10)
      .select('overallScore completedAt');

    res.json({
      success: true,
      stats: {
        totalInterviews : req.user.totalInterviews,
        averageScore    : req.user.averageScore,
        streak          : req.user.streak,
        totalPracticeMin: req.user.totalPracticeMin,
      },
      recentInterviews,
      scoreHistory: scoreHistory.reverse(),
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
