#!/usr/bin/env node
/**
 * Converts a Question.csv spreadsheet into questions.ts for the trivia scene.
 *
 * Usage:
 *   node convert-questions.js [inputCsv] [outputTs]
 *
 * Defaults to Question.csv -> questions.ts in the current folder if no
 * arguments are given. Just re-run this (or double-click convert-questions.bat)
 * any time you edit the spreadsheet.
 *
 * Expected CSV layout (matches the OpenTDB export this was built from):
 *   Row 1: title row (ignored)
 *   Row 2: blank (ignored)
 *   Row 3: header — #, Category, Difficulty, Type, Question, Correct Answer,
 *          Incorrect 1, Incorrect 2, Incorrect 3
 *   Row 4+: data
 *
 * If your spreadsheet's header row lives somewhere else, adjust
 * HEADER_ROW_INDEX below.
 */

const fs = require('fs')
const path = require('path')

const HEADER_ROW_INDEX = 2 // 0-based; row 3 in a 1-based spreadsheet view

// CSV category label -> TriviaCategory enum member name (must match
// triviaCategories.ts). Add a line here any time you introduce a new
// category in the spreadsheet AND add the matching enum member / genre
// wheel entry / icon in the scene.
const CATEGORY_MAP = {
  'General Knowledge': 'GeneralKnowledge',
  'Entertainment: Books': 'Books',
  'Entertainment: Film': 'Film',
  'Entertainment: Music': 'Music',
  'Entertainment: Television': 'Television',
  'Entertainment: Video Games': 'VideoGames',
  'Science & Nature': 'ScienceNature',
  'Science: Computers': 'Computers',
  'Science: Mathematics': 'Mathematics',
  'Mythology': 'Mythology',
  'Sports': 'Sports',
  'Geography': 'Geography',
  'History': 'History',
  'Politics': 'Politics',
  'Art': 'Art',
  'Animals': 'Animals',
  'Vehicles': 'Vehicles',
  'Entertainment: Japanese Anime & Manga': 'Anime',
}

const DIFFICULTY_MAP = { Easy: 'easy', Medium: 'medium', Hard: 'hard' }
const TYPE_MAP = { 'Multiple Choice': 'multiple', 'True / False': 'boolean' }

// ---------------------------------------------------------------------
// Minimal RFC4180-ish CSV parser: handles quoted fields, embedded commas,
// embedded newlines, and "" as an escaped quote. Good enough for exports
// from Excel/Google Sheets/Numbers.
// ---------------------------------------------------------------------
function parseCsv(text) {
  const rows = []
  let row = []
  let field = ''
  let inQuotes = false
  let i = 0

  // Normalise line endings up front so \r\n and \r don't confuse the parser
  text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')

  while (i < text.length) {
    const c = text[i]

    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i += 2
          continue
        }
        inQuotes = false
        i++
        continue
      }
      field += c
      i++
      continue
    }

    if (c === '"') {
      inQuotes = true
      i++
      continue
    }
    if (c === ',') {
      row.push(field)
      field = ''
      i++
      continue
    }
    if (c === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
      i++
      continue
    }
    field += c
    i++
  }
  // last field/row (files without a trailing newline)
  if (field.length > 0 || row.length > 0) {
    row.push(field)
    rows.push(row)
  }
  return rows
}

// Same hash used in-scene, so a question that doesn't change keeps a
// stable id across re-generations. Uses Math.imul for exact 32-bit
// multiplication — a plain `(h * 16777619) >>> 0` loses precision once the
// intermediate product exceeds 2^53 and silently drifts from a correct
// FNV-1a hash.
function hashString(s) {
  let h = 0x811c9dc5 | 0 // 2166136261 as a signed 32-bit int
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193) // 16777619
  }
  return (h >>> 0).toString(16)
}

function tsString(s) {
  return "'" + String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n') + "'"
}

function main() {
  const inputPath = path.resolve(process.argv[2] || 'Question.csv')
  const outputPath = path.resolve(process.argv[3] || 'questions.ts')

  if (!fs.existsSync(inputPath)) {
    console.error(`Could not find input CSV: ${inputPath}`)
    process.exit(1)
  }

  const csvText = fs.readFileSync(inputPath, 'utf8')
  const allRows = parseCsv(csvText)
  const dataRows = allRows.slice(HEADER_ROW_INDEX + 1)

  const kept = []
  const seenIds = new Set()
  const unmapped = {}
  let skippedMalformed = 0
  let skippedDuplicate = 0

  for (const row of dataRows) {
    if (row.length < 9) {
      // Tolerate a fully blank trailing row
      if (row.every(c => c.trim() === '')) continue
      skippedMalformed++
      continue
    }

    const [rowNumRaw, categoryRaw, difficultyRaw, typeRaw, questionRaw, correctRaw, inc1, inc2, inc3] = row
    const category = categoryRaw.trim()
    const difficulty = difficultyRaw.trim()
    const qtype = typeRaw.trim()
    const question = questionRaw.trim()
    const correct = correctRaw.trim()

    if (!question || !correct) {
      skippedMalformed++
      continue
    }

    const mappedCategory = CATEGORY_MAP[category]
    if (!mappedCategory) {
      unmapped[category] = (unmapped[category] || 0) + 1
      continue
    }

    if (!DIFFICULTY_MAP[difficulty] || !TYPE_MAP[qtype]) {
      skippedMalformed++
      continue
    }

    let incorrect
    if (qtype === 'True / False') {
      incorrect = ['True', 'False'].filter(x => x !== correct)
    } else {
      incorrect = [inc1, inc2, inc3].map(x => x.trim()).filter(x => x.length > 0)
    }

    // Preserve the spreadsheet's own "#" column so questions can be looked
    // up quickly against the original file when vetting. Falls back to -1
    // if that column isn't a plain number for some reason (never expected
    // to actually happen, but better than crashing the whole conversion).
    const rowNumTrimmed = rowNumRaw.trim()
    const sourceRow = /^\d+$/.test(rowNumTrimmed) ? parseInt(rowNumTrimmed, 10) : -1

    const id = hashString(question)
    if (seenIds.has(id)) {
      skippedDuplicate++
      continue
    }
    seenIds.add(id)

    kept.push({
      id,
      sourceRow,
      categoryId: mappedCategory,
      difficulty: DIFFICULTY_MAP[difficulty],
      type: TYPE_MAP[qtype],
      question,
      correct,
      incorrect,
    })
  }

  const lines = []
  lines.push('// AUTO-GENERATED from ' + path.basename(inputPath) + ' — do not hand-edit.')
  lines.push('// Regenerate with convert-questions.js (or convert-questions.bat) any time the spreadsheet changes.')
  lines.push("import { TriviaCategory } from './triviaCategories'")
  lines.push('')
  lines.push('export interface LocalQuestion {')
  lines.push('  id: string')
  lines.push('  sourceRow: number       // the "#" column from Question.csv, for cross-checking against the spreadsheet')
  lines.push('  categoryId: TriviaCategory')
  lines.push("  difficulty: 'easy' | 'medium' | 'hard'")
  lines.push("  type: 'multiple' | 'boolean'")
  lines.push('  question: string')
  lines.push('  correct: string')
  lines.push('  incorrect: string[]')
  lines.push('}')
  lines.push('')
  lines.push('export const QUESTION_BANK: LocalQuestion[] = [')
  for (const r of kept) {
    const incorrectStr = '[' + r.incorrect.map(tsString).join(', ') + ']'
    lines.push(
      `  { id: ${tsString(r.id)}, sourceRow: ${r.sourceRow}, categoryId: TriviaCategory.${r.categoryId}, difficulty: ${tsString(r.difficulty)}, ` +
      `type: ${tsString(r.type)}, question: ${tsString(r.question)}, correct: ${tsString(r.correct)}, incorrect: ${incorrectStr} },`
    )
  }
  lines.push(']')

  fs.writeFileSync(outputPath, lines.join('\n') + '\n', 'utf8')

  const badRowNumbers = kept.filter(r => r.sourceRow === -1).length

  console.log('')
  console.log(`Read:      ${inputPath}`)
  console.log(`Wrote:     ${outputPath}`)
  console.log(`Kept:      ${kept.length} questions`)
  if (skippedMalformed) console.log(`Skipped:   ${skippedMalformed} malformed/blank rows`)
  if (skippedDuplicate) console.log(`Skipped:   ${skippedDuplicate} duplicate questions`)
  if (badRowNumbers) console.log(`Warning:   ${badRowNumbers} rows had a non-numeric "#" column, sourceRow set to -1 for those`)
  const unmappedEntries = Object.entries(unmapped)
  if (unmappedEntries.length) {
    console.log('')
    console.log('Excluded — these categories have no matching TriviaCategory yet:')
    for (const [cat, count] of unmappedEntries.sort((a, b) => b[1] - a[1])) {
      console.log(`  ${cat}: ${count}`)
    }
    console.log('Add them to CATEGORY_MAP in this script (and to the scene) if you want them included.')
  }
  console.log('')
}

main()
