const express   = require('express');
const Interview = require('../models/Interview');
const User      = require('../models/User');
const { protect } = require('../middleware/auth');
const router    = express.Router();

const QB = {
  'software-engineer': {
    behavioral: [
      'Tell me about a time you handled a very challenging deadline. What was the situation and what did you do?',
      'Describe a situation where you had a conflict with a teammate. How did you resolve it?',
      'Tell me about a time you made a mistake in your work. How did you identify it and fix it?',
      'Describe a project you are most proud of. What was your specific contribution?',
      'How do you handle working on a project with unclear or constantly changing requirements?',
      'Tell me about a time you had to learn a new technology very quickly.',
      'Describe a time when you had to give critical feedback to a colleague.'
    ],
    technical: [
      'Explain the difference between REST and GraphQL. When would you use each?',
      'What is time complexity? Explain Big O notation with a real example.',
      'Explain the SOLID principles. Give a real example for at least two of them.',
      'What is the difference between SQL and NoSQL databases? When do you choose each?',
      'Explain how async and await works in JavaScript. How is it different from Promises?',
      'Describe microservices architecture and its advantages and disadvantages.',
      'What is a race condition and how do you prevent it?'
    ],
    mixed: [
      'Walk me through how you would design a URL shortener like bit.ly from scratch.',
      'Tell me about the most technically challenging problem you have ever solved.',
      'How do you ensure code quality in a team environment?',
      'Describe a time you significantly improved system performance.'
    ]
  },
  'product-manager': {
    behavioral: [
      'Tell me about a product feature you drove from idea to launch. What was your process?',
      'How do you prioritize features when everything feels urgent?',
      'Describe a time a product decision you made failed. What did you learn?',
      'How do you handle pushback from engineering on your timelines?',
      'Tell me about a time you used data to completely change your product strategy.'
    ],
    technical: [
      'Walk me through how you define success metrics for a new product feature.',
      'How would you design an onboarding flow for a new B2B SaaS product?',
      'What is the difference between a KPI and a North Star metric?',
      'How do you run an A/B test? What are the key considerations to avoid bias?'
    ]
  },
  'data-scientist': {
    behavioral: [
      'Tell me about a time your model predictions were wrong in production.',
      'How do you explain complex technical findings to non-technical business stakeholders?',
      'What is machine learning?',
      'Explain supervised vs unsupervised learning',
      'What is overfitting?',
      'Describe a project where you worked with messy or incomplete datasets.'
    ],
    technical: [
      'Explain the bias-variance tradeoff with a concrete example.',
      'When would you choose Random Forest over Logistic Regression?',
      'How do you handle class imbalance in a classification problem?',
      'Explain gradient boosting step by step.',
      'What is overfitting and how do you prevent it in practice?'
    ]
  },
  'designer': {
    behavioral: [
      'Walk me through your design process from brief to final delivery.',
      'Tell me about a time you strongly disagreed with a stakeholder on a design decision.',
      'Describe a design project that failed and what you learned from it.'
    ],
    technical: [
      'How do you approach accessibility in your designs? Give specific examples.',
      'What metrics do you use to evaluate whether a design is working?',
      'How do you conduct user research? Walk me through your exact process.'
    ]
  },
  'marketing': {
    behavioral: [
      'Tell me about a marketing campaign you ran that significantly exceeded your targets.',
      'Describe a time you had to completely pivot a marketing strategy mid-campaign.',
      'How do you measure the ROI of a content marketing initiative?'
    ],
    technical: [
      'Walk me through how you would build a go-to-market strategy for a new SaaS product.',
      'What metrics do you track for an email marketing campaign and why?',
      'How would you approach SEO strategy for a brand new website from scratch?'
    ]
  }
};

function getQuestions(role, type, count = 5) {
  const bank = QB[role] || QB['software-engineer'];
  const pool = bank[type] || bank['behavioral'] || [];
  return [...pool].sort(() => Math.random() - 0.5).slice(0, Math.min(count, pool.length));
}

// POST /start
router.post('/start', protect, async (req, res) => {
  try {
    const {
      interviewType = 'behavioral',
      role = req.user.targetRole || 'software-engineer',
      difficulty = 'medium',
      questionCount = 5,
      useResume = false
    } = req.body;

    let texts = [];

    if (useResume) {
      const user = await User.findById(req.user._id);
      if (user && user.resumeData) {
        texts = generateResumeQuestionsInline(user.resumeData, user.resumeText || '', questionCount);
      }
    }

    if (texts.length < questionCount) {
      const extra = getQuestions(role, interviewType, questionCount - texts.length);
      texts = [...texts, ...extra];
    }

    if (!texts.length) return res.status(400).json({ success: false, message: 'No questions available.' });

    const iv = await Interview.create({
      userId: req.user._id, interviewType, role, difficulty,
      status: 'in-progress', startedAt: new Date(),
      isResumeBased: useResume,
      questions: texts.map(t => ({ text: t }))
    });

    res.status(201).json({
      success: true,
      interviewId: iv._id,
      questions: iv.questions.map((q, i) => ({ index: i, text: q.text })),
      config: { interviewType, role, difficulty, isResumeBased: useResume }
    });
  } catch (e) {
    console.error('start error:', e);
    res.status(500).json({ success: false, message: e.message });
  }
});

// POST /:id/answer
router.post('/:id/answer', protect, async (req, res) => {
  try {
    const { questionIndex, answer, durationSec = 0 } = req.body;
    const iv = await Interview.findOne({ _id: req.params.id, userId: req.user._id });
    if (!iv) return res.status(404).json({ success: false, message: 'Interview not found.' });
    const q = iv.questions[questionIndex];
    if (!q) return res.status(400).json({ success: false, message: 'Invalid question index.' });
    q.answer = q.transcription = answer || '';
    q.durationSec = durationSec;
    const scored = scoreAnswer(q.text, q.answer);
    q.aiScore = scored.score; q.aiFeedback = scored.feedback;
    await iv.save();
    res.json({ success: true, score: scored.score, feedback: scored.feedback, nextIndex: questionIndex + 1 < iv.questions.length ? questionIndex + 1 : null });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// POST /:id/complete
router.post('/:id/complete', protect, async (req, res) => {
  try {
    const { visionAnalysis = {}, durationMin = 0 } = req.body;
    const iv = await Interview.findOne({ _id: req.params.id, userId: req.user._id });
    if (!iv) return res.status(404).json({ success: false, message: 'Interview not found.' });
    const answered    = iv.questions.filter(q => q.aiScore > 0);
    const verbalScore = answered.length ? Math.round(answered.reduce((s, q) => s + q.aiScore, 0) / answered.length) : 50;
    const va          = visionAnalysis;
    const nonVerbal   = Math.round((va.confidence||70)*0.3 + (va.eyeContact||65)*0.3 + (va.posture||75)*0.2 + (100-(va.nervousness||30))*0.2);
    const overall     = Math.round(verbalScore * 0.6 + nonVerbal * 0.4);
    const fb          = buildFeedback(overall, va, iv.questions);
    Object.assign(iv, {
      status: 'completed', completedAt: new Date(), durationMin,
      analysis: { confidence: va.confidence||70, eyeContact: va.eyeContact||65, posture: va.posture||75, nervousness: va.nervousness||30, clarity: va.clarity||70, pacing: va.pacing||68 },
      verbalScore, nonVerbalScore: nonVerbal, overallScore: overall,
      aiFeedbackSummary: fb.summary, keyStrengths: fb.strengths, areasToImprove: fb.improvements, tips: fb.tips
    });
    await iv.save();
    const user = await User.findById(req.user._id);
    user.totalInterviews  += 1;
    user.totalPracticeMin += durationMin;
    user.lastActiveDate    = new Date();
    const all = await Interview.find({ userId: user._id, status: 'completed' }).select('overallScore');
    user.averageScore = Math.round(all.reduce((s, i) => s + i.overallScore, 0) / all.length);
    user.streak = (user.lastActiveDate && (new Date() - user.lastActiveDate) < 172800000) ? user.streak + 1 : 1;
    await user.save();
    res.json({ success: true, interviewId: iv._id, overallScore: overall, verbalScore, nonVerbalScore: nonVerbal, analysis: iv.analysis, ...fb });
  } catch (e) { console.error(e); res.status(500).json({ success: false, message: e.message }); }
});

// GET /history
router.get('/history', protect, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1, limit = parseInt(req.query.limit) || 10;
    const [ivs, total] = await Promise.all([
      Interview.find({ userId: req.user._id, status: 'completed' }).sort({ completedAt: -1 }).skip((page-1)*limit).limit(limit).select('-questions.aiFeedback'),
      Interview.countDocuments({ userId: req.user._id, status: 'completed' })
    ]);
    res.json({ success: true, interviews: ivs, pagination: { page, limit, total, pages: Math.ceil(total/limit) } });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// GET /:id
router.get('/:id', protect, async (req, res) => {
  try {
    const iv = await Interview.findOne({ _id: req.params.id, userId: req.user._id });
    if (!iv) return res.status(404).json({ success: false, message: 'Not found.' });
    res.json({ success: true, interview: iv });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// DELETE /:id
router.delete('/:id', protect, async (req, res) => {
  try {
    await Interview.findOneAndDelete({ _id: req.params.id, userId: req.user._id });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

function generateResumeQuestionsInline(data, text, count) {
  const q = [];
  const { foundSkills = [], hasProjects, hasExperience, yearsExp } = data;
  q.push('Walk me through your resume. Tell me about yourself and what makes you a strong candidate for this role.');
  if (foundSkills.length > 0) {
    q.push(`Your resume highlights ${foundSkills.slice(0,3).join(', ')}. Walk me through a real project where you used these skills together.`);
  }
  if (hasProjects) q.push('Tell me about the most impactful project on your resume. What was the challenge, your role, and the measurable outcome?');
  if (hasExperience) q.push('Describe the most difficult professional situation you faced in your career and how you handled it.');
  if (yearsExp && yearsExp >= 2) q.push(`With ${yearsExp} years of experience, what is the single biggest lesson your career has taught you so far?`);
  q.push('What is your greatest professional achievement and how did you accomplish it?');
  q.push('Where do you see yourself in 3 years, and how does this role fit into that plan?');
  return q.slice(0, count);
}

function scoreAnswer(question, answer) {
  if (!answer || answer.trim().split(/\s+/).length < 5) return { score: 10, feedback: 'Answer too short. Please elaborate with a specific example and outcome.' };
  const words = answer.trim().split(/\s+/).length;
  let score = 45;
  if (words > 150) score += 20; else if (words > 80) score += 12; else if (words > 40) score += 5;
  const star = ['situation','task','action','result','impact','achieved','outcome','learned','decided','implemented'];
  score += star.filter(w => answer.toLowerCase().includes(w)).length * 4;
  const specific = ['specifically','for example','such as','percent','%','increased','reduced','team','project','deadline','delivered','built','designed'];
  score += specific.filter(w => answer.toLowerCase().includes(w)).length * 2;
  score = Math.min(96, Math.max(12, score));
  let feedback = score >= 82 ? 'Excellent — strong structure, specific details, and clear outcome.' :
    score >= 65 ? 'Good answer. Add measurable results (numbers, percentages) for more impact.' :
    score >= 48 ? 'Fair attempt. Use STAR: Situation → Task → Action → Result.' :
    'Needs more depth. Share a specific situation, your exact actions, and the measurable result.';
  if (words < 60) feedback += ' Aim for 80–150 words per answer.';
  return { score: Math.round(score), feedback };
}

function buildFeedback(overall, va, questions) {
  const strengths = [], improvements = [], tips = [];
  if ((va.confidence||70) >= 75) strengths.push('Confident and composed body language throughout the session.');
  else improvements.push('Sit upright and keep shoulders back — confident posture signals authority to interviewers.');
  if ((va.eyeContact||65) >= 68) strengths.push('Strong eye contact maintained with the camera throughout.');
  else improvements.push('Look directly at the camera lens (not your own face on screen) for stronger eye contact.');
  if (overall >= 80) { strengths.push('Excellent verbal answers with clear structure and specific examples.'); tips.push('Do 2 more sessions this week to lock in this consistency before your real interview.'); }
  else if (overall >= 60) { strengths.push('Good conceptual understanding shown across your answers.'); improvements.push('Add specific numbers and outcomes to your answers to make them more impactful.'); tips.push('Rewrite your lowest-scoring answer using STAR method and practice it aloud 3 times.'); }
  else { improvements.push('Focus on the STAR method — every answer needs a Situation, Task, Action, and clear Result.'); tips.push('Practice one question per day aloud, record yourself and listen back to identify weak spots.'); }
  const weakQ = questions.filter(q => q.aiScore > 0).sort((a, b) => a.aiScore - b.aiScore)[0];
  if (weakQ) tips.push(`Revisit your weakest answer: "${weakQ.text.substring(0, 55)}..." — practise it until it feels natural.`);
  tips.push('Schedule your next PrepWise session within 48 hours while this feedback is still fresh.');
  const summary = overall >= 80 ? 'Strong performance! You communicated clearly and confidently with well-structured answers.' :
    overall >= 60 ? 'Solid performance. Focus on adding specific measurable outcomes and tighter STAR structure.' :
    'Needs practice. Prioritise STAR-method answers, direct eye contact, and confident upright posture.';
  return { summary, strengths, improvements, tips };
}

module.exports = router;
