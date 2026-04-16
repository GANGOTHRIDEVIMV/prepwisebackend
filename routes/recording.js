// ═══════════════════════════════════════════
//  routes/recording.js
// ═══════════════════════════════════════════
const express   = require('express');
const multer    = require('multer');
const path      = require('path');
const fs        = require('fs');
const Interview = require('../models/Interview');
const { protect } = require('../middleware/auth');

const router = express.Router();

// ── Multer storage for recordings ─────────────
const recordingStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '../uploads/recordings');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = file.mimetype.includes('video') ? '.webm' : '.webm';
    cb(null, `recording_${req.user._id}_${Date.now()}${ext}`);
  },
});

const upload = multer({
  storage: recordingStorage,
  limits : { fileSize: 500 * 1024 * 1024 }, // 500 MB max
  fileFilter: (_req, file, cb) => {
    const allowed = ['video/webm', 'audio/webm', 'video/mp4', 'audio/ogg', 'audio/wav'];
    if (!allowed.includes(file.mimetype)) {
      return cb(new Error(`File type ${file.mimetype} not allowed.`));
    }
    cb(null, true);
  },
});

// ══════════════════════════════════════════════
//  POST /api/recording/upload
//  Attach a recording to an interview session
// ══════════════════════════════════════════════
router.post('/upload', protect, upload.single('recording'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No recording file provided.' });
    }

    const { interviewId } = req.body;

    const recordingUrl = `/uploads/recordings/${req.file.filename}`;
    const isVideo      = req.file.mimetype.startsWith('video/');

    // If interviewId provided, attach to the interview document
    if (interviewId) {
      await Interview.findOneAndUpdate(
        { _id: interviewId, userId: req.user._id },
        { recordingUrl, hasVideoRecord: isVideo },
      );
    }

    res.json({
      success     : true,
      recordingUrl,
      hasVideoRecord: isVideo,
      filename    : req.file.filename,
      size        : req.file.size,
    });
  } catch (err) {
    console.error('recording upload error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ══════════════════════════════════════════════
//  GET /api/recording/:interviewId
//  Get recording URL for an interview
// ══════════════════════════════════════════════
router.get('/:interviewId', protect, async (req, res) => {
  try {
    const interview = await Interview.findOne({
      _id   : req.params.interviewId,
      userId: req.user._id,
    }).select('recordingUrl hasVideoRecord');

    if (!interview) {
      return res.status(404).json({ success: false, message: 'Interview not found.' });
    }

    if (!interview.recordingUrl) {
      return res.status(404).json({ success: false, message: 'No recording for this interview.' });
    }

    res.json({
      success        : true,
      recordingUrl   : interview.recordingUrl,
      hasVideoRecord : interview.hasVideoRecord,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ══════════════════════════════════════════════
//  DELETE /api/recording/:interviewId
// ══════════════════════════════════════════════
router.delete('/:interviewId', protect, async (req, res) => {
  try {
    const interview = await Interview.findOne({
      _id   : req.params.interviewId,
      userId: req.user._id,
    });

    if (!interview || !interview.recordingUrl) {
      return res.status(404).json({ success: false, message: 'Recording not found.' });
    }

    // Delete file from disk
    const filePath = path.join(__dirname, '..', interview.recordingUrl);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

    interview.recordingUrl   = '';
    interview.hasVideoRecord = false;
    await interview.save();

    res.json({ success: true, message: 'Recording deleted.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
