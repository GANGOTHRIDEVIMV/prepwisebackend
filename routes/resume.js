const express = require('express');
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');

const { protect } = require('../middleware/auth');
const router  = express.Router();

// ─────────────────────────────────────────────
// MULTER STORAGE (KEEP FILES)
// ─────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    const dir = path.join(__dirname, '../uploads/resumes');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `resume_${req.user._id}_${Date.now()}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['.pdf', '.doc', '.docx', '.txt'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (!allowed.includes(ext)) return cb(new Error('Only PDF, DOC, DOCX, TXT allowed'));
    cb(null, true);
  }
});

// ─────────────────────────────────────────────
// POST: Upload Resume
// ─────────────────────────────────────────────
router.post('/upload', protect, upload.single('resume'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded.' });
    }

    const filePath = req.file.path;
    const fileText = await extractTextFromFile(filePath, req.file.originalname);
    const analysis = analyzeResume(fileText);

    const fileUrl = `/uploads/resumes/${req.file.filename}`;

    const User = require('../models/User');
    await User.findByIdAndUpdate(req.user._id, {
      resumeUrl: fileUrl,
      resumeText: fileText.substring(0, 5000),
      resumeData: analysis
    });

    res.json({
  success: true,
  fileUrl,
  analysis,
  resumeText: fileText.substring(0, 2000), // 👈 ADD THIS
  message: 'Resume uploaded and analysed successfully!'
});

  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─────────────────────────────────────────────
// GET: Resume Info
// ─────────────────────────────────────────────
router.get('/info', protect, async (req, res) => {
  try {
    const User = require('../models/User');
    const user = await User.findById(req.user._id);

    if (!user.resumeData) {
      return res.json({ success: false });
    }

    res.json({
      success: true,
      resumeData: user.resumeData
    });

  } catch (err) {
    res.status(500).json({ success: false });
  }
});

// ─────────────────────────────────────────────
// GET: Resume Questions
// ─────────────────────────────────────────────
router.get('/questions', protect, async (req, res) => {
  try {
    const User = require('../models/User');
    const user = await User.findById(req.user._id);

    if (!user.resumeData) {
      return res.status(400).json({
        success: false,
        message: 'Upload resume first'
      });
    }

    const questions = generateResumeQuestions(
      user.resumeData,
      user.resumeText || ''
    );

    res.json({
      success: true,
      questions
    });

  } catch (err) {
    res.status(500).json({ success: false });
  }
});

// ─────────────────────────────────────────────
// TEXT EXTRACTION (UPDATED)
// ─────────────────────────────────────────────
async function extractTextFromFile(filePath, originalName) {
  try {
    const ext = path.extname(originalName).toLowerCase();
    const buffer = fs.readFileSync(filePath);

    let text = '';

    if (ext === '.pdf') {
      const data = await pdfParse(buffer);
      text = data.text;
    } else if (ext === '.docx') {
      const result = await mammoth.extractRawText({ buffer });
      text = result.value;
    } else {
      text = buffer.toString('utf-8');
    }

    // ✅ CLEAN TEXT
    return text
      .replace(/\s+/g, ' ')
      .replace(/[^\x00-\x7F]/g, '') // remove weird chars
      .trim();

  } catch (err) {
    console.error("Text extraction failed:", err);
    return '';
  }
}

// ─────────────────────────────────────────────
// ANALYZE RESUME
// ─────────────────────────────────────────────
function analyzeResume(text) {
  const lower = text.toLowerCase();

  const skillsList = [
    'javascript','python','java','react','node','sql','mongodb',
    'aws','docker','machine learning','html','css'
  ];

  const foundSkills = skillsList.filter(s => lower.includes(s));

  let detectedRole = 'software-engineer';

if (lower.includes('machine learning') || lower.includes('data science')) {
  detectedRole = 'data-scientist';
} else if (lower.includes('ui') || lower.includes('ux') || lower.includes('design')) {
  detectedRole = 'designer';
} else if (lower.includes('marketing')) {
  detectedRole = 'marketing';
} else if (lower.includes('sales')) {
  detectedRole = 'sales';
} else if (lower.includes('product manager')) {
  detectedRole = 'product-manager';
} else if (lower.includes('hr')) {
  detectedRole = 'hr';
}


  const match = lower.match(/(\d+)\s+years?/);
  const yearsExp = match ? parseInt(match[1]) : 0;

  return {
    detectedRole,
    foundSkills,
    yearsExp,
    score: Math.min(100, foundSkills.length * 10 + yearsExp * 5)
  };
}

// ─────────────────────────────────────────────
// GENERATE QUESTIONS
// ─────────────────────────────────────────────
function generateResumeQuestions(data, text) {
  const questions = [];

  questions.push("Tell me about yourself.");

  if (data.foundSkills.length) {
    questions.push(`Explain your experience with ${data.foundSkills[0]}`);
  }

  if (data.yearsExp > 0) {
    questions.push(`What did you learn in your ${data.yearsExp} years of experience?`);
  }

  if (data.detectedRole === 'software-engineer') {
    questions.push("Explain REST API");
    questions.push("What is async await?");
  }

  if (data.detectedRole === 'data-scientist') {
    questions.push("What is machine learning?");
  }

  questions.push("What are your strengths?");
  questions.push("Where do you see yourself in 3 years?");

  return questions.slice(0, 6);
}

module.exports = router;