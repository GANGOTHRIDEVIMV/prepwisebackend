const pdfParse = require("pdf-parse");
const mammoth = require("mammoth");

async function extractText(file) {
  if (file.mimetype === "application/pdf") {
    const data = await pdfParse(file.buffer);
    return data.text;
  }

  if (
    file.mimetype ===
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    const result = await mammoth.extractRawText({ buffer: file.buffer });
    return result.value;
  }

  return file.buffer.toString("utf-8");
}

function extractSkills(text) {
  const skillsList = [
    "javascript", "react", "node", "express", "mongodb",
    "python", "java", "c++", "sql", "html", "css"
  ];

  return skillsList.filter(skill =>
    text.toLowerCase().includes(skill)
  );
}

function detectRole(text) {
  if (text.toLowerCase().includes("react")) return "software-engineer";
  if (text.toLowerCase().includes("marketing")) return "marketing";
  if (text.toLowerCase().includes("design")) return "designer";
  return "software-engineer";
}

function estimateExperience(text) {
  const match = text.match(/(\d+)\s+years?/i);
  return match ? parseInt(match[1]) : 0;
}

module.exports = {
  extractText,
  extractSkills,
  detectRole,
  estimateExperience
};