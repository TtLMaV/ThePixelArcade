import {Color4, Vector3} from '@dcl/sdk/math'
import { engine, AudioSource, TextShape, Transform, CameraModeArea, CameraType, PBTextShape, Schemas, Entity } from '@dcl/sdk/ecs'
import { SetUpTriviaUi, UpdateText, UpdateShowUI} from './ui'
import { syncEntity, isStateSyncronized } from '@dcl/sdk/network'
import { getPlayer, onLeaveScene } from '@dcl/sdk/players'
import { signedFetch } from '~system/SignedFetch'

// Class for storing trivia questions
export type Difficulty = 'easy' | 'medium' | 'hard' | 'any'
export type QuestionType = 'multiple' | 'boolean' | 'any'
export enum TriviaCategory {
  Any = 0,
  GeneralKnowledge = 9,
  Books = 10,
  Film = 11,
  Music = 12,
  Television = 14,
  VideoGames = 15,
  ScienceNature = 17,
  Computers = 18,
  Mathematics = 19,
  Mythology = 20,
  Sports = 21,
  Geography = 22,
  History = 23,
  Politics = 24,
  Art = 25,
  Animals = 27,
  Vehicles = 28,
  Anime = 31,
}

//
export interface FetchOptions {
  amount: number                  // 1 - 50
  category?: TriviaCategory
  difficulty?: Difficulty
  type?: QuestionType
  useSessionToken?: boolean       // dedupes questions across calls in a session
}

//
interface RawTriviaResponse {
  response_code: number
  results: RawQuestion[]
}

//
interface RawQuestion {
  category: string
  type: 'multiple' | 'boolean'
  difficulty: 'easy' | 'medium' | 'hard'
  question: string
  correct_answer: string
  incorrect_answers: string[]
}

//
export interface TriviaQuestion {
  id: string                      // stable hash for the question, useful for analytics
  category: string
  difficulty: 'easy' | 'medium' | 'hard'
  type: 'multiple' | 'boolean'
  question: string
  answers: string[]               // shuffled, length 4 for multiple, 2 for boolean
  correctIndex: number            // index into answers[]
}

// =========================================================================
// Session token management
// =========================================================================

const API_BASE = 'https://opentdb.com'
let sessionToken: string | null = null

async function fetchJson<T>(url: string, retries = 2): Promise<T> {
  const res = await signedFetch({ url, init: { method: 'GET', headers: {} } })
  if (!res.body) throw new Error(`Empty response from ${url}`)

  const parsed = JSON.parse(res.body)
  // opentdb doesn't always surface 429 as response_code; if you see a 429
  // in the exception rather than a parsed body, this catch won't fire —
  // wrap the signedFetch call itself in a try/catch with a delay + retry too.
  return parsed as T
}

async function requestNewToken(): Promise<string> {
  const data = await fetchJson<{ response_code: number; token: string }>(
    `${API_BASE}/api_token.php?command=request`
  )
  if (data.response_code !== 0) {
    throw new Error(`Failed to get session token, code ${data.response_code}`)
  }
  return data.token
}

async function resetToken(token: string): Promise<void> {
  await fetchJson<{ response_code: number }>(
    `${API_BASE}/api_token.php?command=reset&token=${token}`
  )
}

async function ensureToken(): Promise<string> {
  if (!sessionToken) {
    sessionToken = await requestNewToken()
  }
  return sessionToken
}

// =========================================================================
// Decoding and normalisation
// =========================================================================

/** Base64 decode that works in the Decentraland runtime (no atob in scenes). */
function base64Decode(input: string): string {
  // SDK7 scenes run on a QuickJS runtime that doesn't include atob by default.
  // Implement a minimal decoder here.
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/='
  let output = ''
  let buffer = 0
  let bits = 0
  for (let i = 0; i < input.length; i++) {
    const c = input.charAt(i)
    if (c === '=') break
    const val = chars.indexOf(c)
    if (val === -1) continue
    buffer = (buffer << 6) | val
    bits += 6
    if (bits >= 8) {
      bits -= 8
      output += String.fromCharCode((buffer >> bits) & 0xff)
    }
  }
  // UTF-8 decode the resulting byte string
  try {
    return decodeURIComponent(escape(output))
  } catch {
    return output
  }
}

// Simple deterministic hash for question IDs
function hashString(s: string): string {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = (h * 16777619) >>> 0
  }
  return h.toString(16)
}

// Fisher-Yates shuffle
function shuffle<T>(arr: T[]): T[] {
  const copy = arr.slice()
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

//
function normaliseQuestion(raw: RawQuestion): TriviaQuestion {
  const question = base64Decode(raw.question)
  const correct = base64Decode(raw.correct_answer)
  const incorrect = raw.incorrect_answers.map(base64Decode)

  const answers = shuffle([correct, ...incorrect])
  const correctIndex = answers.indexOf(correct)

  return {
    id: hashString(question),
    category: base64Decode(raw.category),
    difficulty: raw.difficulty,
    type: raw.type,
    question,
    answers,
    correctIndex,
  }
}


//
export async function fetchQuestions(opts: FetchOptions): Promise<TriviaQuestion[]> {
  if (opts.amount < 1 || opts.amount > 50) {
    throw new Error('amount must be between 1 and 50')
  }

  const params: string[] = [
    `amount=${opts.amount}`,
    `encode=base64`,
  ]
  if (opts.category && opts.category !== TriviaCategory.Any as TriviaCategory) {
    params.push(`category=${opts.category}`)
  }
  if (opts.difficulty && opts.difficulty !== 'any') {
    params.push(`difficulty=${opts.difficulty}`)
  }
  if (opts.type && opts.type !== 'any') {
    params.push(`type=${opts.type}`)
  }

  if (opts.useSessionToken !== false) {
    const token = await ensureToken()
    params.push(`token=${token}`)
  }

  const url = `${API_BASE}/api.php?${params.join('&')}`
  const data = await fetchJson<RawTriviaResponse>(url)

  switch (data.response_code) {
    case 0:
      return data.results.map(normaliseQuestion)
    case 1:
      throw new Error('Not enough questions in the database for that query')
    case 2:
      throw new Error('Invalid parameter sent to trivia API')
    case 3:
    case 4:
      // Token missing or exhausted, reset and retry once
      if (sessionToken) {
        await resetToken(sessionToken)
      } else {
        sessionToken = await requestNewToken()
      }
      return fetchQuestions({ ...opts, useSessionToken: true })
    case 5:
      throw new Error('Rate limited by trivia API, wait 5 seconds between calls')
    default:
      throw new Error(`Unknown response code ${data.response_code}`)
  }
}

// =========================================================================
// Synced state — this is the only thing every client trusts
// =========================================================================

// Keep enum ids under 8001, see DCL docs on entityEnumId
enum SyncIds {
  TRIVIA_STATE = 1,
  HOST_CLAIM = 2,
}

// Timing constants (host uses these to schedule its own setTimeouts AND to
// stamp the synced deadline that every client's timer reads from).
const QUESTION_DURATION_MS = 15000
const ANSWER_DURATION_MS = 3000
const GENRE_DURATION_MS = 15000
const GENRE_RESULT_DURATION_MS = 3000

// Voting players re-stamp their vote this often. The host ignores any vote it
// hasn't seen change within VOTE_TIMEOUT_MS, so someone who leaves the scene
// mid-vote stops holding the countdown open.
const VOTE_HEARTBEAT_MS = 1000
const VOTE_TIMEOUT_MS = 4000

export const TriviaState = engine.defineComponent('TriviaStateComponent', {
  roundId: Schemas.Int,        // bumped every time the host publishes a new question
  phase: Schemas.String,        // 'genre' | 'genrepicked' | 'question' | 'answer'
  questionText: Schemas.String,
  answerA: Schemas.String,
  answerB: Schemas.String,
  answerC: Schemas.String,
  answerD: Schemas.String,
  correctIndex: Schemas.Int,    // 1-4 (in a genre phase, the winning option)
  phaseEndTime: Schemas.Number, // Date.now()-based deadline for the current phase, set by host
  genreRound: Schemas.Int,      // bumped every time a new genre vote opens
})

export const HostClaim = engine.defineComponent('HostClaimComponent', {
  hostUserId: Schemas.String,
})

// One of these per player, created by that player and synced to everyone, so
// the host can count who is stood in which zone during a genre vote.
export const PlayerVote = engine.defineComponent('PlayerVoteComponent', {
  option: Schemas.Int,      // 0 = not voting, 1-4 = which genre slot
  genreRound: Schemas.Int,  // which vote this belongs to, older ones are ignored
  pulse: Schemas.Int,       // ticks up while the player is stood in a zone
})

const triviaStateEntity = engine.addEntity()
const hostClaimEntity = engine.addEntity()

function setUpSyncedEntities() {
  TriviaState.create(triviaStateEntity, {
    roundId: 0, phase: 'genre',
    questionText: '', answerA: '', answerB: '', answerC: '', answerD: '',
    correctIndex: 0,
    phaseEndTime: 0,
    genreRound: 0,
  })
  HostClaim.create(hostClaimEntity, { hostUserId: '' })

  syncEntity(triviaStateEntity, [TriviaState.componentId], SyncIds.TRIVIA_STATE)
  syncEntity(hostClaimEntity, [HostClaim.componentId], SyncIds.HOST_CLAIM)
}

// =========================================================================
// Host election — first synced player to see an empty claim takes it
// =========================================================================

let claimAttempted = false
let hostConfirmed = false
let gameLoopStarted = false

function tryClaimHost() {
  if (claimAttempted || !isStateSyncronized()) return
  claimAttempted = true

  const claim = HostClaim.getMutable(hostClaimEntity)
  if (claim.hostUserId === '') {
    const me = getPlayer()
    if (me) claim.hostUserId = me.userId
  }

  // Don't trust this yet — give CRDT time to converge in case someone
  // else claimed in the same tick. Re-check after it's had time to settle.
  setTimeout(() => {
    const me = getPlayer()
    const settled = HostClaim.get(hostClaimEntity)
    hostConfirmed = !!me && settled.hostUserId === me.userId
  }, 1000)
}

function isLocalPlayerHost(): boolean {
  return hostConfirmed
}

onLeaveScene((userId) => {
  const claim = HostClaim.get(hostClaimEntity)
  if (claim.hostUserId !== userId) return // wasn't the host, ignore

  // Host left — release the claim so another client can pick it up
  const mutClaim = HostClaim.getMutable(hostClaimEntity)
  mutClaim.hostUserId = ''

  // Reset local election state so remaining clients re-run tryClaimHost
  claimAttempted = false
  hostConfirmed = false
  gameLoopStarted = false
})

// =========================================================================
// Genre voting — runs on every client (publishing its own vote) and on the
// host (counting them)
// =========================================================================

// The genres players can be offered. GENRE_OPTION_COUNT of these are drawn at
// random for each vote, so the shortlist changes every time.
const GENRE_OPTION_COUNT = 4
const GENRE_CHOICES: { name: string; category: TriviaCategory }[] = [
  { name: 'General Knowledge', category: TriviaCategory.GeneralKnowledge },
  { name: 'Books', category: TriviaCategory.Books },
  { name: 'Film', category: TriviaCategory.Film },
  { name: 'Music', category: TriviaCategory.Music },
  { name: 'Television', category: TriviaCategory.Television },
  { name: 'Video Games', category: TriviaCategory.VideoGames },
  { name: 'Science & Nature', category: TriviaCategory.ScienceNature },
  { name: 'Computers', category: TriviaCategory.Computers },
  { name: 'Mathematics', category: TriviaCategory.Mathematics },
  { name: 'Mythology', category: TriviaCategory.Mythology },
  { name: 'Sports', category: TriviaCategory.Sports },
  { name: 'Geography', category: TriviaCategory.Geography },
  { name: 'History', category: TriviaCategory.History },
  { name: 'Politics', category: TriviaCategory.Politics },
  { name: 'Art', category: TriviaCategory.Art },
  { name: 'Animals', category: TriviaCategory.Animals },
  { name: 'Vehicles', category: TriviaCategory.Vehicles },
  { name: 'Anime & Manga', category: TriviaCategory.Anime },
]

function categoryForName(name: string): TriviaCategory | null {
  for (const g of GENRE_CHOICES) {
    if (g.name === name) return g.category
  }
  return null
}

let myVoteEntity: Entity | null = null
let genreVoteValue = 0
let lastVotedGenreRound = -1
let lastVotePublish = 0

function ensureVoteEntity() {
  if (myVoteEntity !== null || !isStateSyncronized()) return

  myVoteEntity = engine.addEntity()
  PlayerVote.create(myVoteEntity, { option: 0, genreRound: -1, pulse: 0 })
  // No enum id — this one is created at runtime, so the network toolkit hands
  // out a unique id and every other client receives it as a new entity.
  syncEntity(myVoteEntity, [PlayerVote.componentId])
}

function publishMyVote() {
  ensureVoteEntity()
  if (myVoteEntity === null) return

  const state = TriviaState.get(triviaStateEntity)

  // Each new vote clears the previous pick, so standing still from the last
  // round doesn't silently count — you have to walk into a zone again. The
  // arrow is parked too, otherwise it would still point at last round's answer
  // while that pick isn't actually counting for anything.
  if (state.genreRound !== lastVotedGenreRound) {
    lastVotedGenreRound = state.genreRound
    genreVoteValue = 0
    curAnswerValue = 0
    MoveAnswerArrow(0)
  }

  const desired = state.phase === 'genre' ? genreVoteValue : 0
  const mine = PlayerVote.get(myVoteEntity)
  const now = Date.now()

  // Heartbeat while actually voting, so the host can tell a live vote from one
  // left behind by a player who disconnected.
  const needsHeartbeat = desired !== 0 && now - lastVotePublish >= VOTE_HEARTBEAT_MS
  if (mine.option === desired && mine.genreRound === state.genreRound && !needsHeartbeat) return

  lastVotePublish = now
  const mut = PlayerVote.getMutable(myVoteEntity)
  mut.option = desired
  mut.genreRound = state.genreRound
  mut.pulse = mine.pulse + 1
}

// Host-side view of when each vote entity last changed, measured on the host's
// own clock so client clock skew can't make a vote look stale.
const votesLastSeen = new Map<number, { pulse: number; seenAt: number }>()

function tallyVotes(genreRound: number): number[] {
  const counts: number[] = []
  for (let i = 0; i < GENRE_OPTION_COUNT; i++) counts.push(0)

  const now = Date.now()
  const live = new Set<number>()

  for (const [entity, vote] of engine.getEntitiesWith(PlayerVote)) {
    const key = entity as number
    live.add(key)

    const prev = votesLastSeen.get(key)
    if (!prev || prev.pulse !== vote.pulse) {
      votesLastSeen.set(key, { pulse: vote.pulse, seenAt: now })
    } else if (now - prev.seenAt > VOTE_TIMEOUT_MS) {
      continue // stopped heartbeating, treat the player as gone
    }

    if (vote.genreRound !== genreRound) continue
    const i = vote.option - 1
    if (i >= 0 && i < GENRE_OPTION_COUNT) counts[i]++
  }

  for (const key of votesLastSeen.keys()) {
    if (!live.has(key)) votesLastSeen.delete(key)
  }

  return counts
}

// =========================================================================
// Host-only game loop: genre vote -> maxQuestions rounds -> genre vote -> ...
// =========================================================================

let curQuestionIndex = 0
let curAnswerValue = 0
let maxQuestions = 10
let newQuestions: TriviaQuestion[] = []

/** Entry point for the host. Every game now opens with a genre vote. */
export async function GameLoop() {
  if (!isLocalPlayerHost()) return // everyone else just waits for synced state
  startGenreVote()
}

function startGenreVote() {
  if (!isLocalPlayerHost()) return

  const options = shuffle(GENRE_CHOICES).slice(0, GENRE_OPTION_COUNT)
  const state = TriviaState.getMutable(triviaStateEntity)
  state.roundId += 1
  state.genreRound += 1
  state.phase = 'genre'
  state.questionText = 'Which genre next?'
  state.answerA = options[0].name
  state.answerB = options[1].name
  state.answerC = options[2].name
  state.answerD = options[3].name
  state.correctIndex = 0
  state.phaseEndTime = 0 // parked until somebody actually votes, see hostGenreTick

  // No setTimeout here — the clock only starts once a player is stood in a
  // zone, so the genre phase is driven from hostGenreTick() instead.
}

/**
 * Called every frame on the host while a vote is open. The clock only runs
 * once at least one player is stood in a zone; with nobody voting it's parked
 * (phaseEndTime 0) and restarts from the full duration when someone steps in.
 */
function hostGenreTick() {
  const state = TriviaState.get(triviaStateEntity)
  if (state.phase !== 'genre') return

  const counts = tallyVotes(state.genreRound)
  let total = 0
  for (const c of counts) total += c

  if (total === 0) {
    // Nobody picking — park the clock. If everyone steps out mid-countdown
    // this throws the elapsed time away, so the next voter gets a full 15s.
    if (state.phaseEndTime !== 0) TriviaState.getMutable(triviaStateEntity).phaseEndTime = 0
    return
  }

  if (state.phaseEndTime === 0) {
    // First player just stepped in, start counting.
    TriviaState.getMutable(triviaStateEntity).phaseEndTime = Date.now() + GENRE_DURATION_MS
    return
  }

  if (Date.now() >= state.phaseEndTime) resolveGenreVote(counts)
}

function resolveGenreVote(counts: number[]) {
  if (!isLocalPlayerHost()) return

  let total = 0
  for (const c of counts) total += c
  if (total === 0) return // everyone bailed in the same frame, keep waiting

  // Weighted pick: each player's vote is one ticket, so an option with more
  // votes is more likely to win but isn't guaranteed to.
  let ticket = Math.floor(Math.random() * total)
  let winner = 0
  for (let i = 0; i < counts.length; i++) {
    if (ticket < counts[i]) { winner = i; break }
    ticket -= counts[i]
  }

  // Read the names back off the synced state rather than a host-local array,
  // so a vote that started under a previous host still resolves correctly.
  const state = TriviaState.getMutable(triviaStateEntity)
  const names = [state.answerA, state.answerB, state.answerC, state.answerD]
  const winnerName = names[winner]
  const category = categoryForName(winnerName)
  if (category === null) {
    startGenreVote() // shouldn't happen, but don't strand the game
    return
  }

  state.roundId += 1
  state.phase = 'genrepicked'
  state.questionText = `${winnerName}!`
  state.correctIndex = winner + 1
  state.phaseEndTime = Date.now() + GENRE_RESULT_DURATION_MS

  setTimeout(() => startQuestionRound(category), GENRE_RESULT_DURATION_MS)
}

async function startQuestionRound(category: TriviaCategory) {
  if (!isLocalPlayerHost()) return

  newQuestions = await fetchGenreQuestions(category)
  if (newQuestions.length === 0) {
    startGenreVote() // couldn't fill a round, put it back to a vote
    return
  }

  curQuestionIndex = 0
  publishCurrentQuestion()
}

async function fetchGenreQuestions(category: TriviaCategory): Promise<TriviaQuestion[]> {
  const opts: FetchOptions = {
    amount: maxQuestions, category, difficulty: 'easy', type: 'multiple', useSessionToken: true,
  }

  try {
    return await fetchQuestions(opts)
  } catch (e) {
    console.log('[trivia] easy fetch failed for category', category, e)
  }

  try {
    // Thinner categories run dry on easy once the session token has eaten
    // through them, so take any difficulty rather than stall the game.
    return await fetchQuestions({ ...opts, difficulty: 'any' })
  } catch (e) {
    console.log('[trivia] fallback fetch failed for category', category, e)
    return []
  }
}

function publishCurrentQuestion() {
  const q = newQuestions[curQuestionIndex]
  const state = TriviaState.getMutable(triviaStateEntity)
  state.roundId += 1
  state.phase = 'question'
  state.questionText = q.question
  state.answerA = q.answers[0]
  state.answerB = q.answers[1]
  state.answerC = q.answers[2]
  state.answerD = q.answers[3]
  state.correctIndex = q.correctIndex + 1
  state.phaseEndTime = Date.now() + QUESTION_DURATION_MS

  // host owns timing too, so everyone reveals/advances together
  setTimeout(() => revealAnswer(), QUESTION_DURATION_MS)
}

function revealAnswer() {
  if (!isLocalPlayerHost()) return
  const state = TriviaState.getMutable(triviaStateEntity)
  state.phase = 'answer'
  state.phaseEndTime = Date.now() + ANSWER_DURATION_MS
  setTimeout(() => tryNextQuestion(), ANSWER_DURATION_MS)
}

function tryNextQuestion() {
  if (!isLocalPlayerHost()) return
  curQuestionIndex++
  if (curQuestionIndex > newQuestions.length - 1) {
    // Round over — back to the genre vote rather than straight into more
    // questions of the same category.
    curQuestionIndex = 0
    startGenreVote()
  } else {
    publishCurrentQuestion()
  }
}

// =========================================================================
// Score tracking (local per-player, not synced)
// =========================================================================

let myScore = 0
let lastScoredRoundId = -1

let tShapeScore: PBTextShape

// =========================================================================
// Rendering — runs on EVERY client, driven only by synced TriviaState
// =========================================================================

let lastSeenRoundId = -1
let lastSeenPhase = ''

let tShapeQuest: PBTextShape
let tShapeAnsA: PBTextShape
let tShapeAnsB: PBTextShape
let tShapeAnsC: PBTextShape
let tShapeAnsD: PBTextShape
let tShapeTimer: PBTextShape

function VerifyTextField()
{
  // Check All The Answer Text Fields
  const QuestionText = engine.getEntityOrNullByName('Screen_Text')
  if (QuestionText !== null) {
    if (TextShape.has(QuestionText)) {
      tShapeQuest = TextShape.getMutable(QuestionText)
    }
  }

  //
  const AnsAText = engine.getEntityOrNullByName('Answer_A')
  if (AnsAText !== null) {
    if (TextShape.has(AnsAText)) {
      tShapeAnsA = TextShape.getMutable(AnsAText)
    }
  }

  //
  const AnsBText = engine.getEntityOrNullByName('Answer_B')
  if (AnsBText !== null) {
    if (TextShape.has(AnsBText)) {
      tShapeAnsB = TextShape.getMutable(AnsBText)
    }
  }

  //
  const AnsCText = engine.getEntityOrNullByName('Answer_C')
  if (AnsCText !== null) {
    if (TextShape.has(AnsCText)) {
      tShapeAnsC = TextShape.getMutable(AnsCText)
    }
  }

  //
  const AnsDText = engine.getEntityOrNullByName('Answer_D')
  if (AnsDText !== null) {
    if (TextShape.has(AnsDText)) {
      tShapeAnsD = TextShape.getMutable(AnsDText)
    }
  }

  //
  const TimerText = engine.getEntityOrNullByName('Screen_Timer')
  if (TimerText !== null) {
    if (TextShape.has(TimerText)) {
      tShapeTimer = TextShape.getMutable(TimerText)
    }
  }
}

function renderFromState() {
  const state = TriviaState.get(triviaStateEntity)
  // roundId 0 means the host hasn't published anything yet — leave "Loading..."
  // on screen rather than blanking it out with empty synced strings.
  if (state.roundId === 0) return
  if (state.roundId === lastSeenRoundId && state.phase === lastSeenPhase) return
  lastSeenRoundId = state.roundId
  lastSeenPhase = state.phase

  VerifyTextField()

  if (state.phase === 'question' || state.phase === 'genre') {
    // A genre vote draws exactly like a question: prompt on top, four options
    // in the answer slots, all neutral until it resolves.
    tShapeQuest.text = wrapText(state.questionText, 30)

    const Qlines = tShapeQuest.text.split('\n').length
    tShapeQuest.fontSize = 30 / Qlines

    tShapeAnsA.text = wrapText(state.answerA, 40); tShapeAnsA.textColor = Color4.create(1,1,1,1)
    tShapeAnsB.text = wrapText(state.answerB, 40); tShapeAnsB.textColor = Color4.create(1,1,1,1)
    tShapeAnsC.text = wrapText(state.answerC, 40); tShapeAnsC.textColor = Color4.create(1,1,1,1)
    tShapeAnsD.text = wrapText(state.answerD, 40); tShapeAnsD.textColor = Color4.create(1,1,1,1)

    const AAlines = tShapeAnsA.text.split('\n').length
    tShapeAnsA.fontSize = 15 / AAlines
    const ABlines = tShapeAnsB.text.split('\n').length
    tShapeAnsB.fontSize = 15 / ABlines
    const AClines = tShapeAnsB.text.split('\n').length
    tShapeAnsC.fontSize = 15 / AClines
    const ADlines = tShapeAnsC.text.split('\n').length
    tShapeAnsD.fontSize = 15 / ADlines

  } else if (state.phase === 'genrepicked') {
    // Winning genre announced. Nothing is scored here, so the losing options
    // are dimmed rather than marked wrong.
    tShapeQuest.text = wrapText(state.questionText, 30)
    const Qlines = tShapeQuest.text.split('\n').length
    tShapeQuest.fontSize = 30 / Qlines

    const shapes = [tShapeAnsA, tShapeAnsB, tShapeAnsC, tShapeAnsD]
    shapes.forEach((s, i) => { s.textColor = (i + 1 === state.correctIndex) ? Color4.create(0,1,0,1) : Color4.create(1,1,1,0.35) })

  } else {
    // 'answer' phase
    const gotItRight = curAnswerValue === state.correctIndex

    // Only score once per round, even if this function re-runs
    if (state.roundId !== lastScoredRoundId) {
      lastScoredRoundId = state.roundId
      if (gotItRight) {
        myScore++
        UpdateShowUI(true)
        UpdateText("Correct: ", myScore)
      }
    }
    
    const QuestionText = engine.getEntityOrNullByName('Screen_Text')
    if(QuestionText != null)
    {
      AudioSource.createOrReplace(QuestionText, {
        audioClipUrl: '',
      })
      if(gotItRight) {
        AudioSource.playSound(QuestionText, 'assets/sounds/correct.wav');
      } else {
        AudioSource.playSound(QuestionText, 'assets/sounds/incorrect.wav');
      }
    }

    tShapeQuest.text = wrapText(gotItRight ? 'Correct' : 'Incorrect', 30)
    const Qlines = tShapeQuest.text.split('\n').length
    tShapeQuest.fontSize = 30 / Qlines
    const shapes = [tShapeAnsA, tShapeAnsB, tShapeAnsC, tShapeAnsD]
    shapes.forEach((s, i) => { s.textColor = (i + 1 === state.correctIndex) ? Color4.create(0,1,0,1) : Color4.create(1,0,0,1) })

  }
}

export function GetCurrentState()
{
  const state = TriviaState.get(triviaStateEntity)
  return state.phase
}

// Runs every tick (unlike renderFromState, which is gated on roundId/phase
// change) since the countdown needs to visibly tick down every frame.
let lastRenderedSecond = -1
let lastShowedClock = false
function renderTimer() {
  if (!tShapeTimer) return

  const state = TriviaState.get(triviaStateEntity)
  const showsClock = state.phase === 'question' || state.phase === 'genre'

  // phaseEndTime 0 during a genre vote means the clock is parked: nobody has
  // stepped into a zone yet, so it sits at the full duration.
  const parked = state.phase === 'genre' && state.phaseEndTime === 0
  const msRemaining = parked ? GENRE_DURATION_MS : state.phaseEndTime - Date.now()
  const secondsRemaining = Math.max(0, Math.ceil(msRemaining / 1000))

  // Skip redundant text writes when the displayed number hasn't changed
  if (secondsRemaining === lastRenderedSecond && showsClock === lastShowedClock) return

  //console.log(secondsRemaining)

  lastRenderedSecond = secondsRemaining
  lastShowedClock = showsClock
  VerifyTextField()
  const display = showsClock ? `${secondsRemaining}` : ''
  tShapeTimer.text = display
}

function wrapText(input: string, maxChars: number = 10): string {
  const regex = new RegExp(`(?<=\\s|^)(.{1,${maxChars}})(?:\\s+|$)`, 'g')
  return input.match(regex)?.join('\n') || input
}

export function SetCurrentAnswer(answerIndex: number) {
  curAnswerValue = answerIndex

  const state = TriviaState.get(triviaStateEntity)

  // Same zones, same trigger — during a genre vote this counts as a vote for
  // that slot instead of an answer. Kept separate from curAnswerValue so it
  // can be cleared at the start of each vote.
  if (state.phase === 'genre') {
    genreVoteValue = answerIndex
  }

  if(state.phase === 'question' || state.phase === 'genre')
  {
    MoveAnswerArrow(curAnswerValue)
  }
}

/** answerIndex 0 parks the arrow out of sight, 1-4 point at a slot. */
function MoveAnswerArrow(answerIndex: number) {
  const AnswerArrow = engine.getEntityOrNullByName('Screen_Ans_Arrow')
  if(AnswerArrow != null)
  {
    const mutableTransform = Transform.getMutable(AnswerArrow)
    switch(answerIndex)
    {
      case 0: mutableTransform.position.y = 10; break
      case 1: mutableTransform.position.y = 2.52; break
      case 2: mutableTransform.position.y = 1.91; break
      case 3: mutableTransform.position.y = 1.27; break
      case 4: mutableTransform.position.y = 0.69; break
    }
  }
}

export function GetCurrentAnswer() {
  return curAnswerValue
}

// =========================================================================
// Main
// =========================================================================

export function main() {
  // Check All The Answer Text Fields
  VerifyTextField()
  tShapeQuest.text = "Loading..."

  const firstPersonZone = engine.addEntity()
  Transform.create(firstPersonZone, { position: Vector3.create(0, 0, 0) })
  CameraModeArea.create(firstPersonZone, { area: Vector3.create(25, 15, 25), mode: CameraType.CT_FIRST_PERSON })

  setUpSyncedEntities()
  SetUpTriviaUi()

  engine.addSystem(() => {
    tryClaimHost()
    publishMyVote()
    renderFromState()
    renderTimer()
    if (isLocalPlayerHost()) {
      if (!gameLoopStarted) {
        gameLoopStarted = true
        GameLoop()
      }
      hostGenreTick()
    }
  })
}