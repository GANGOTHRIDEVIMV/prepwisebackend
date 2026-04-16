// ═══════════════════════════════════════════
//  models/Interview.js
// ═══════════════════════════════════════════
const mongoose = require('mongoose');

const questionSchema = new mongoose.Schema({
  text         : { type: String, required: true },
  answer       : { type: String, default: '' },
  aiScore      : { type: Number, min: 0, max: 100, default: 0 },
  aiFeedback   : { type: String, default: '' },
  durationSec  : { type: Number, default: 0 },
  transcription: { type: String, default: '' },
}, { _id: false });

const analysisSchema = new mongoose.Schema({
  confidence  : { type: Number, default: 0 },
  eyeContact  : { type: Number, default: 0 },
  posture     : { type: Number, default: 0 },
  nervousness : { type: Number, default: 0 },
  clarity     : { type: Number, default: 0 },
  pacing      : { type: Number, default: 0 },
  relevance   : { type: Number, default: 0 },
  structure   : { type: Number, default: 0 },
}, { _id: false });

const interviewSchema = new mongoose.Schema(
  {
    userId: {
      type    : mongoose.Schema.Types.ObjectId,
      ref     : 'User',
      required: true,
    },

    // ── Config ──────────────────────────────────
    interviewType: {
      type   : String,
      enum   : ['behavioral', 'technical', 'mixed', 'case-study', 'resume-based'],
      default: 'behavioral',
    },
    role: {
      type   : String,
      default: 'software-engineer',
    },
    difficulty: {
      type   : String,
      enum   : ['easy', 'medium', 'hard'],
      default: 'medium',
    },
    jobDescription: { type: String, default: '' },

    // ── Session State ───────────────────────────
    status: {
      type   : String,
      enum   : ['pending', 'in-progress', 'completed', 'abandoned'],
      default: 'pending',
    },
    startedAt  : { type: Date },
    completedAt: { type: Date },
    durationMin: { type: Number, default: 0 },

    // ── Q&A ─────────────────────────────────────
    questions: [questionSchema],

    // ── AI Analysis ─────────────────────────────
    analysis: { type: analysisSchema, default: () => ({}) },

    // ── Scores ──────────────────────────────────
    overallScore   : { type: Number, min: 0, max: 100, default: 0 },
    verbalScore    : { type: Number, min: 0, max: 100, default: 0 },
    nonVerbalScore : { type: Number, min: 0, max: 100, default: 0 },

    // ── Feedback ────────────────────────────────
    aiFeedbackSummary: { type: String, default: '' },
    keyStrengths     : [{ type: String }],
    areasToImprove   : [{ type: String }],
    tips             : [{ type: String }],

    // ── Recording ───────────────────────────────
    recordingUrl  : { type: String, default: '' },
    hasVideoRecord: { type: Boolean, default: false },
  },
  { timestamps: true }
);

interviewSchema.index({ userId: 1, createdAt: -1 });
interviewSchema.index({ status: 1 });

module.exports = mongoose.model('Interview', interviewSchema);
