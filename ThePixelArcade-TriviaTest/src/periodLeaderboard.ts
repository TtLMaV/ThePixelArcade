import { Color4, Quaternion, Vector3 } from '@dcl/sdk/math'
import {
  engine,
  Transform,
  TextShape,
  TextAlignMode,
  Entity,
} from '@dcl/sdk/ecs'
import { signedFetch } from '~system/SignedFetch'

// =========================================================================
// Time-window leaderboard board — cycles through TODAY / THIS WEEK / THIS MONTH
//
// This is a second, independent board. It does NOT submit anything: the backend
// already buckets every score into day/week/month windows on each submit (via
// your existing submitCorrectAnswer call). This board just reads the current
// window and rotates through the three every few seconds.
//
//   GET /api/top?period=day|week|month&limit=N
//
// Refresh model: real wall-clock cycle/poll timing, a per-request cache-buster
// so the client/CDN can't serve a stale body, an instant header flip on cycle,
// and a self-healing in-flight guard.
// =========================================================================

const DEBUG = true

interface Entry {
  name: string
  score: number
}

const CYCLE = [
  { period: 'day', label: 'TODAY' },
  { period: 'week', label: 'THIS WEEK' },
  { period: 'month', label: 'THIS MONTH' },
]

// ---- config -------------------------------------------------------------

let BASE_URL = ''
let CYCLE_MS = 10000 // how long each period is shown
let POLL_MS = 10000 // refresh the shown period this often

export interface PeriodLeaderboardOptions {
  baseUrl: string
  position: Vector3
  rotation?: Quaternion
  scale?: number
  rows?: number
  cycleMs?: number // seconds-per-period on screen, default 8000
  pollMs?: number // refresh cadence, default 5000
}

// ---- board entities -----------------------------------------------------

let rootEntity: Entity | null = null
let titleEntity: Entity | null = null
let rowEntities: Entity[] = []
let boardRows = 8

const HEADER_GAP = 1.4
const LINE_HEIGHT = 0.6

export function SetUpPeriodLeaderboard(opts: PeriodLeaderboardOptions): void {
  BASE_URL = opts.baseUrl.replace(/\/+$/, '')
  boardRows = opts.rows ?? 8
  CYCLE_MS = opts.cycleMs ?? 8000
  POLL_MS = opts.pollMs ?? 5000
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
    text: CYCLE[0].label + '\nLEADERBOARD',
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

  render([], CYCLE[0].label)
  forceRefreshPeriodLeaderboard()
}

// ---- cycle + poll -------------------------------------------------------

let currentIndex = 0
let lastCycleAt = 0
let lastPollAt = 0
let fetchStartedAt = 0
let fetchInFlight = false
let lastEntries: Entry[] = []

/** Force a fresh pull on the next tick. */
export function forceRefreshPeriodLeaderboard(): void {
  lastPollAt = 0
  fetchInFlight = false
  void refresh()
}

/** Call once per tick from your system loop. */
export function tickPeriodLeaderboard(): void {
  if (BASE_URL === '') return
  const now = Date.now()

  if (lastCycleAt === 0) lastCycleAt = now
  if (now - lastCycleAt >= CYCLE_MS) {
    lastCycleAt = now
    currentIndex = (currentIndex + 1) % CYCLE.length
    lastRenderKey = '' // force a redraw for the new header
    render(lastEntries, CYCLE[currentIndex].label) // flip header instantly
    lastPollAt = now
    void refresh()
    return
  }

  if (now - lastPollAt >= POLL_MS) {
    lastPollAt = now
    void refresh()
  }
}

async function refresh(): Promise<void> {
  if (BASE_URL === '') return
  const now = Date.now()
  if (fetchInFlight && now - fetchStartedAt < 15000) return
  fetchInFlight = true
  fetchStartedAt = now

  const shown = CYCLE[currentIndex]
  try {
    const bust = Math.floor(now / 2000)
    const url = `${BASE_URL}/api/top?period=${shown.period}&limit=${boardRows}&_=${bust}`
    const res = await signedFetch({ url, init: { method: 'GET', headers: {} } })
    if (!res.body) return
    const data = JSON.parse(res.body) as { entries?: Entry[] }
    const entries = Array.isArray(data.entries) ? data.entries : []
    // Drop a response that arrived after the board already cycled on.
    if (CYCLE[currentIndex].period !== shown.period) return
    lastEntries = entries
    render(entries, shown.label)
    if (DEBUG) console.log('[period-leaderboard]', shown.label, entries.length, 'entries')
  } catch (e) {
    console.log('[period-leaderboard] fetch failed', e)
  } finally {
    fetchInFlight = false
  }
}

// ---- rendering ----------------------------------------------------------

let lastRenderKey = ''

function render(entries: Entry[], label: string): void {
  if (titleEntity !== null) {
    TextShape.getMutable(titleEntity).text = `${label}\nLEADERBOARD`
  }
  if (rowEntities.length === 0) return

  const key = label + '|' + entries.map((e) => `${e.name}:${e.score}`).slice(0, boardRows).join('|')
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
