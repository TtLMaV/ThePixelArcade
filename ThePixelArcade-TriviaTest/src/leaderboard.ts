import { Color4, Quaternion, Vector3 } from '@dcl/sdk/math'
import {
  engine,
  Transform,
  TextShape,
  TextAlignMode,
  Entity,
} from '@dcl/sdk/ecs'
import { getPlayer } from '@dcl/sdk/players'
import { signedFetch } from '~system/SignedFetch'

// =========================================================================
// Persistent, per-category in-scene leaderboard
//
// Scores live in an external backend (see the dcl-leaderboard-backend repo:
// Vercel + Upstash Redis), so they survive players leaving and the scene
// emptying out. There's one ranking per trivia category plus a combined
// "overall" board.
//
//   - submitCorrectAnswer()  -> signedFetch POST /api/submit
//   - tickLeaderboard()      -> polls GET /api/top for the displayed category
//   - setCurrentCategory()   -> tells the module which category is in play
//   - showOverall()          -> switch the board to the combined ranking
//   - forceRefreshLeaderboard() -> pull fresh data on the next tick
//
// Refresh model: real wall-clock polling, a per-request cache-buster so the
// client/CDN can't serve a stale body, an instant header flip on category
// change, and a self-healing in-flight guard.
// =========================================================================

const DEBUG = true // set false to quiet the console logs

// ---- config -------------------------------------------------------------

let BASE_URL = '' // set in SetUpLeaderboard, e.g. https://your-app.vercel.app
let POLL_INTERVAL_MS = 10000

// "overall" must match the OVERALL constant in the backend.
const OVERALL = 'overall'

// ---- board entities -----------------------------------------------------

interface Entry {
  name: string
  score: number
}

let rootEntity: Entity | null = null
let titleEntity: Entity | null = null
let rowEntities: Entity[] = []
let boardRows = 8

const HEADER_GAP = 1.4
const LINE_HEIGHT = 0.6

export interface LeaderboardOptions {
  baseUrl: string // your deployed backend origin (no trailing slash)
  position: Vector3 // world position of the board's top (the title)
  rotation?: Quaternion // defaults to identity
  scale?: number // overall size multiplier, defaults to 1
  rows?: number // how many places to show, defaults to 8
  pollIntervalMs?: number // how often to refresh, defaults to 5000
}

export function SetUpLeaderboard(opts: LeaderboardOptions): void {
  BASE_URL = opts.baseUrl.replace(/\/+$/, '')
  boardRows = opts.rows ?? 8
  POLL_INTERVAL_MS = opts.pollIntervalMs ?? 5000
  const scale = opts.scale ?? 1
  const rotation = opts.rotation ?? Quaternion.Identity()

  rootEntity = engine.addEntity()
  Transform.create(rootEntity, {
    position: opts.position,
    rotation,
    scale: Vector3.create(scale, scale, scale),
  })

  titleEntity = engine.addEntity()
  Transform.create(titleEntity, {
    position: Vector3.create(0, 0, 0),
    parent: rootEntity,
  })
  TextShape.create(titleEntity, {
    text: 'LEADERBOARD',
    fontSize: 4,
    lineSpacing: 1,
    textColor: Color4.White(),
    outlineColor: Color4.Black(),
    outlineWidth: 0.15,
    textAlign: TextAlignMode.TAM_TOP_CENTER,
  })

  rowEntities = []
  for (let i = 0; i < boardRows; i++) {
    const row = engine.addEntity()
    Transform.create(row, {
      position: Vector3.create(-1.3, -HEADER_GAP - i * LINE_HEIGHT, 0),
      parent: rootEntity,
    })
    TextShape.create(row, {
      text: '',
      fontSize: 2.4,
      textColor: Color4.White(),
      outlineColor: Color4.Black(),
      outlineWidth: 0.1,
      textAlign: TextAlignMode.TAM_MIDDLE_LEFT,
    })
    rowEntities.push(row)
  }

  // Draw something immediately rather than waiting for the first poll.
  render([], 'Overall')
  forceRefreshLeaderboard()
}

// ---- which category are we on -------------------------------------------

// The category the board is showing / the next correct answer counts toward.
let displayCategory = OVERALL
let displayLabel = 'Overall'
let lastEntries: Entry[] = []

/**
 * Point the board (and the next submitted point) at a specific category.
 * Call this when a genre is picked. `categoryId` is the TriviaCategory enum
 * value; `label` is the human name shown in the header.
 */
export function setCurrentCategory(categoryId: number, label: string): void {
  const cat = String(categoryId)
  if (cat === displayCategory) return
  displayCategory = cat
  displayLabel = label
  if (DEBUG) console.log('[leaderboard] category ->', label, `(${cat})`)
  // Flip the header immediately with whatever we last had, so it never sits on
  // the previous category while the fetch is in flight.
  lastRenderKey = ''
  render(lastEntries, displayLabel)
  forceRefreshLeaderboard()
}

/** Switch the board to the combined all-category ranking. */
export function showOverall(): void {
  if (displayCategory === OVERALL) return
  displayCategory = OVERALL
  displayLabel = 'Overall'
  lastRenderKey = ''
  render(lastEntries, displayLabel)
  forceRefreshLeaderboard()
}

// ---- submitting a correct answer ----------------------------------------

/**
 * Record that the local player just answered correctly. Fire-and-forget.
 */
export function submitCorrectAnswer(): void {
  if (BASE_URL === '') return
  const me = getPlayer()
  const name = me?.name ?? 'Guest'

  // Unique per event so a network retry can't double-count on the backend.
  const event = `${Date.now()}-${Math.floor(Math.random() * 1e9)}`

  const payload = {
    category: displayCategory,
    name,
    event,
    amount: 1,
  }

  void signedFetch({
    url: `${BASE_URL}/api/submit`,
    init: {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    },
  })
    .then(() => {
      if (DEBUG) console.log('[leaderboard] submitted point ->', displayLabel)
      forceRefreshLeaderboard() // pull the new standings straight away
    })
    .catch((e) => {
      console.log('[leaderboard] submit failed', e)
    })
}

// ---- polling + rendering ------------------------------------------------

let lastPollAt = 0
let fetchStartedAt = 0
let fetchInFlight = false

/** Force a fresh pull on the next tick. */
export function forceRefreshLeaderboard(): void {
  lastPollAt = 0
  fetchInFlight = false // clear any stuck flag
  void refresh()
}

/** Call once per tick from your system loop. */
export function tickLeaderboard(): void {
  if (BASE_URL === '') return
  const now = Date.now()
  if (now - lastPollAt >= POLL_INTERVAL_MS) {
    lastPollAt = now
    void refresh()
  }
}

async function refresh(): Promise<void> {
  if (BASE_URL === '') return
  const now = Date.now()
  // In-flight guard, but self-heal if a request wedged for >15s.
  if (fetchInFlight && now - fetchStartedAt < 15000) return
  fetchInFlight = true
  fetchStartedAt = now

  const requestedCategory = displayCategory
  try {
    // `_` cache-buster: a unique URL each ~2s window defeats client/CDN caching
    // so the board reflects new scores instead of a stale cached body.
    const bust = Math.floor(now / 2000)
    const url = `${BASE_URL}/api/top?category=${encodeURIComponent(
      requestedCategory
    )}&limit=${boardRows}&_=${bust}`
    const res = await signedFetch({ url, init: { method: 'GET', headers: {} } })
    if (!res.body) {
      if (DEBUG) console.log('[leaderboard] empty response')
      return
    }
    const data = JSON.parse(res.body) as { entries?: Entry[] }
    const entries = Array.isArray(data.entries) ? data.entries : []
    // Ignore a response that arrived after the player switched categories.
    if (requestedCategory !== displayCategory) return
    lastEntries = entries
    render(entries, displayLabel)
    if (DEBUG) console.log('[leaderboard]', displayLabel, entries.length, 'entries')
  } catch (e) {
    console.log('[leaderboard] fetch failed', e)
  } finally {
    fetchInFlight = false
  }
}

let lastRenderKey = ''

function render(entries: Entry[], label: string): void {
  if (titleEntity !== null) {
    const newtext = wrapTextToLines(label.toUpperCase().toString(), 2) + '\nALL-TIME'
    TextShape.getMutable(titleEntity).text = newtext
    const Qlines = TextShape.getMutable(titleEntity).text.split('\n').length
    TextShape.getMutable(titleEntity).fontSize = 8 / Qlines
  }
  if (rowEntities.length === 0) return

  const key =
    label + '|' + entries.map((e) => `${e.name}:${e.score}`).slice(0, boardRows).join('|')
  if (key === lastRenderKey) return
  lastRenderKey = key

  for (let i = 0; i < rowEntities.length; i++) {
    const shape = TextShape.getMutable(rowEntities[i])
    if (i < entries.length) {
      const rank = i + 1
      const raw = entries[i].name || 'Guest'
      const name = raw.length > 16 ? raw.slice(0, 15) + '…' : raw
      shape.text = `${rank}.  ${name}      ${entries[i].score}`
      shape.textColor = Color4.White()
      /*
      shape.textColor =
        rank === 1
          ? Color4.create(1, 0.84, 0, 1)
          : rank === 2
          ? Color4.create(0.75, 0.75, 0.78, 1)
          : rank === 3
          ? Color4.create(0.8, 0.5, 0.2, 1)
          : Color4.White()
        */
    } else {
      shape.text = ''
    }
  }
}

/** Read-only accessor, handy if you want the current standings elsewhere. */
export function getDisplayedEntries(): Entry[] {
  return lastEntries
}

function wrapTextToLines(input: string, targetLines: number = 2): string {
  if (!input || targetLines <= 1) return input

  const words = input.trim().split(/\s+/)

  // If there are fewer words than target lines, we can't create more lines than words
  if (words.length <= targetLines) {
    return words.join('\n')
  }

  const totalChars = input.length
  const approxLineLength = Math.ceil(totalChars / targetLines)

  const lines: string[] = []
  let currentLine = ''

  for (let i = 0; i < words.length; i++) {
    const word = words[i]

    // If we are on the LAST allowed line, dump all remaining words into it
    if (lines.length === targetLines - 1) {
      const remainingWords = words.slice(i).join(' ')
      lines.push(currentLine ? `${currentLine} ${remainingWords}` : remainingWords)
      break
    }

    // Check if adding the next word exceeds our target line length
    const lineWithWord = currentLine ? `${currentLine} ${word}` : word

    if (lineWithWord.length > approxLineLength && currentLine.length > 0) {
      lines.push(currentLine)
      currentLine = word
    } else {
      currentLine = lineWithWord
    }
  }

  // Push the final line if we didn't hit the max limit break inside the loop
  if (currentLine && lines.length < targetLines) {
    lines.push(currentLine)
  }

  return lines.join('\n')
}
