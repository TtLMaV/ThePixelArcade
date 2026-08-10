import {Color4, Vector3, Quaternion} from '@dcl/sdk/math'
import { engine, AudioSource, TextShape, Transform, CameraModeArea, CameraType, PBTextShape, Schemas, Entity, MeshRenderer, Material, VisibilityComponent, MaterialTransparencyMode } from '@dcl/sdk/ecs'
import { triggerEmote } from '~system/RestrictedActions'
import { SetUpTriviaUi, UpdateText, UpdateShowUI, UpdateQuestionUI, UpdateAnswersUI} from './ui'
import { syncEntity, isStateSyncronized } from '@dcl/sdk/network'
import { getPlayer, onLeaveScene } from '@dcl/sdk/players'
import { SetUpLeaderboard, tickLeaderboard, setCurrentCategory, submitCorrectAnswer } from './leaderboard'
import { SetUpPeriodLeaderboard, tickPeriodLeaderboard } from './periodLeaderboard'
import { QUESTION_BANK, LocalQuestion } from './questions'
import { TriviaCategory } from './triviaCategories'
import { actions } from '@dcl-sdk/utils'
import { getActionEvents } from '@dcl/asset-packs/dist/events'
import { EntityNames } from '../assets/scene/entity-names'

// Re-exported so any file that previously did `import { TriviaCategory } from
// './index'` keeps working — the enum itself now lives in triviaCategories.ts
// to avoid a circular import with questions.ts.
export { TriviaCategory }

// Class for storing trivia questions
export type Difficulty = 'easy' | 'medium' | 'hard' | 'any'
export type QuestionType = 'multiple' | 'boolean' | 'any'

//
export interface FetchOptions {
  amount: number                  // 1 - 50
  category?: TriviaCategory
  difficulty?: Difficulty
  type?: QuestionType
  useSessionToken?: boolean       // dedupes questions across calls in a session
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
// Local question bank
// =========================================================================
// Questions now come from Question.csv, converted at build time into
// questions.ts (QUESTION_BANK). There's no network call and nothing to
// sanitise at runtime — the conversion script already normalised
// category/difficulty/type and stripped blank/malformed rows.
//
// `servedIds` mimics the old opentdb session-token behaviour: within a
// session we avoid repeating a question until the matching pool has been
// fully used, then we wrap around instead of stalling the round.

const servedIds = new Set<string>()

// Fisher-Yates shuffle
function shuffle<T>(arr: T[]): T[] {
  const copy = arr.slice()
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

function matchesQuery(q: LocalQuestion, opts: FetchOptions): boolean {
  if (opts.category && opts.category !== (TriviaCategory.Any as TriviaCategory) && q.categoryId !== opts.category) {
    return false
  }
  if (opts.difficulty && opts.difficulty !== 'any' && q.difficulty !== opts.difficulty) {
    return false
  }
  if (opts.type && opts.type !== 'any' && q.type !== opts.type) {
    return false
  }
  return true
}

function toTriviaQuestion(q: LocalQuestion): TriviaQuestion {
  const answers = shuffle([q.correct, ...q.incorrect])
  return {
    id: q.id,
    category: TriviaCategory[q.categoryId],
    difficulty: q.difficulty,
    type: q.type,
    question: q.question,
    answers,
    correctIndex: answers.indexOf(q.correct),
  }
}

//
export async function fetchQuestions(opts: FetchOptions): Promise<TriviaQuestion[]> {
  if (opts.amount < 1 || opts.amount > 50) {
    throw new Error('amount must be between 1 and 50')
  }

  const pool = QUESTION_BANK.filter(q => matchesQuery(q, opts))

  // Prefer questions this session hasn't seen yet. If the matching pool is
  // too small to cover this request, reset the "seen" tracking and allow
  // repeats rather than throwing mid-round.
  let candidates = pool.filter(q => !servedIds.has(q.id))
  if (candidates.length < opts.amount) {
    servedIds.clear()
    candidates = pool
  }

  if (candidates.length === 0) {
    throw new Error('Not enough questions in the local database for that query')
  }

  const picked = shuffle(candidates).slice(0, Math.min(opts.amount, candidates.length))
  picked.forEach(q => servedIds.add(q.id))

  return picked.map(toTriviaQuestion)
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
const ROUND_WINNER_DURATION_MS = 10000 // end-of-round winner screen

// Voting players re-stamp their vote this often. The host ignores any vote it
// hasn't seen change within VOTE_TIMEOUT_MS, so someone who leaves the scene
// mid-vote stops holding the countdown open.
const VOTE_HEARTBEAT_MS = 1000
const VOTE_TIMEOUT_MS = 4000

export const TriviaState = engine.defineComponent('TriviaStateComponent', {
  roundId: Schemas.Int,         // bumped every time the host publishes a new question
  questionNumb: Schemas.Int,    // question number through genre
  curQuestionType: Schemas.String,
  phase: Schemas.String,        // 'genre' | 'genrepicked' | 'question' | 'answer'
  questionText: Schemas.String,
  answerA: Schemas.String,
  answerB: Schemas.String,
  answerC: Schemas.String,
  answerD: Schemas.String,
  correctIndex: Schemas.Int,    // 1-4 (in a genre phase, the winning option)
  phaseEndTime: Schemas.Number, // Date.now()-based deadline for the current phase, set by host
  genreRound: Schemas.Int,      // bumped every time a new genre vote opens
  roundWinner: Schemas.String,     // name of last round's top scorer (published by host)
  roundWinnerScore: Schemas.Int,   // that player's score for the round
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

// One per player: their score for the CURRENT round, synced so the host can
// pull the round winner. Mirrors PlayerVote — created at runtime, no enum id.
export const PlayerRoundScore = engine.defineComponent('PlayerRoundScoreComponent', {
  userId: Schemas.String,
  name: Schemas.String,
  score: Schemas.Int,
  genreRound: Schemas.Int,  // which round this score belongs to
})

const triviaStateEntity = engine.addEntity()
const hostClaimEntity = engine.addEntity()

function setUpSyncedEntities() {
  TriviaState.create(triviaStateEntity, {
    roundId: 0, phase: 'genre',
    questionNumb: 0, curQuestionType: '',
    questionText: '', answerA: '', answerB: '', answerC: '', answerD: '',
    correctIndex: 0,
    phaseEndTime: 0,
    genreRound: 0,
    roundWinner: '', roundWinnerScore: 0,
  })
  HostClaim.create(hostClaimEntity, { hostUserId: '' })

  syncEntity(triviaStateEntity, [TriviaState.componentId], SyncIds.TRIVIA_STATE)
  syncEntity(hostClaimEntity, [HostClaim.componentId], SyncIds.HOST_CLAIM)
}

// =========================================================================
// Host election — first synced player to see an empty claim takes it
// =========================================================================
//
// Two safeguards live here to prevent the "two questions fire moments
// apart" desync:
//
// 1. `electionSettled` gates isLocalPlayerHost() the same way `hostConfirmed`
//    used to, but isLocalPlayerHost() now re-reads the live synced claim on
//    every call instead of trusting a value snapshotted once. Under real
//    network conditions the CRDT claim can take longer than our 1s settle
//    window to converge across every client — if two clients both wrote
//    their own userId in the same tick, each could otherwise lock in
//    "I'm host" forever from its own not-yet-overwritten local copy. Live
//    re-checking means a client that loses the race steps down within a
//    tick or two of the claim converging, instead of continuing to run a
//    second, stray host loop indefinitely.
// 2. Every setTimeout-driven phase transition (see scheduleHostTransition
//    below) is stamped with the roundId it was scheduled for and re-checks
//    both "am I still host" and "is this still the same round" before it
//    acts. That's what actually stops a brief dual-host window from
//    double-advancing the game: even if both clients fire once, only the
//    transition matching the round that ends up surviving CRDT convergence
//    has any effect.

let claimAttempted = false
let electionSettled = false // true once the 1s settle window has passed
let gameLoopStarted = false

function tryClaimHost() {
  if (claimAttempted || !isStateSyncronized()) return
  claimAttempted = true

  const claim = HostClaim.getMutable(hostClaimEntity)
  if (claim.hostUserId === '') {
    const me = getPlayer()
    if (me) claim.hostUserId = me.userId
  }

  // Give CRDT time to converge in case someone else claimed in the same
  // tick, before we start trusting the result at all.
  setTimeout(() => {
    electionSettled = true
  }, 1000)
}

// Re-derived from the live synced claim on every call, rather than cached
// once — see the note above. This is a cheap component read, safe to call
// every frame (it already is, from the main system).
function isLocalPlayerHost(): boolean {
  if (!electionSettled) return false
  const me = getPlayer()
  if (!me) return false
  return HostClaim.get(hostClaimEntity).hostUserId === me.userId
}

onLeaveScene((userId) => {
  const claim = HostClaim.get(hostClaimEntity)
  if (claim.hostUserId !== userId) return // wasn't the host, ignore

  // Host left — release the claim so another client can pick it up
  const mutClaim = HostClaim.getMutable(hostClaimEntity)
  mutClaim.hostUserId = ''

  // Reset local election state so remaining clients re-run tryClaimHost
  claimAttempted = false
  electionSettled = false
  gameLoopStarted = false
})

/**
 * Schedules a host-only phase transition. Captures the roundId at schedule
 * time and re-checks both "am I still host" and "are we still on that
 * round" when the timer actually fires. Without this, a setTimeout chain
 * started by a client that briefly (and wrongly) believed it was host keeps
 * running to completion even after the election converges on someone else
 * — which is what produces two questions firing seconds apart.
 */
function scheduleHostTransition(fn: () => void, delayMs: number) {
  const roundAtSchedule = TriviaState.get(triviaStateEntity).roundId
  setTimeout(() => {
    if (!isLocalPlayerHost()) {
      console.log('[trivia] skipped stale transition: no longer host')
      return
    }
    if (TriviaState.get(triviaStateEntity).roundId !== roundAtSchedule) {
      console.log('[trivia] skipped stale transition: round moved on without it')
      return
    }
    fn()
  }, delayMs)
}

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


// =========================================================================
// Genre icon — a single image shown under the Question Type text during a round
// =========================================================================

// Drop the generated PNGs into this folder (files are <slug>.png).
const GENRE_ICON_BASE = 'assets/scene/Images/genres/'

// TriviaCategory -> icon file slug
const GENRE_ICON_SLUG: Record<number, string> = {
  [TriviaCategory.GeneralKnowledge]: 'general',
  [TriviaCategory.Books]: 'books',
  [TriviaCategory.Film]: 'film',
  [TriviaCategory.Music]: 'music',
  [TriviaCategory.Television]: 'tv',
  [TriviaCategory.VideoGames]: 'videogames',
  [TriviaCategory.ScienceNature]: 'science',
  [TriviaCategory.Computers]: 'computers',
  [TriviaCategory.Mathematics]: 'maths',
  [TriviaCategory.Mythology]: 'mythology',
  [TriviaCategory.Sports]: 'sports',
  [TriviaCategory.Geography]: 'geography',
  [TriviaCategory.History]: 'history',
  [TriviaCategory.Politics]: 'politics',
  [TriviaCategory.Art]: 'art',
  [TriviaCategory.Animals]: 'animals',
  [TriviaCategory.Vehicles]: 'vehicles',
  [TriviaCategory.Anime]: 'anime',
}

// One icon, parented under the Question_Type text entity, shown for the whole
// question round and textured to the current genre. TUNE these to place/size it:
const TYPE_ICON_ANCHOR = 'Question_Type'
const TYPE_ICON_OFFSET = Vector3.create(0, -3.5, 0) // below the Q type text
const TYPE_ICON_SCALE = 3                          // icon size

let typeIconEntity: Entity | null = null

function ensureTypeIcon() {
  if (typeIconEntity !== null) return
  const anchor = engine.getEntityOrNullByName(TYPE_ICON_ANCHOR)
  if (anchor === null) return // model not loaded yet — try again next tick
  const e = engine.addEntity()
  Transform.create(e, {
    position: TYPE_ICON_OFFSET,
    scale: Vector3.create(TYPE_ICON_SCALE, TYPE_ICON_SCALE, TYPE_ICON_SCALE),
    parent: anchor,
  })
  MeshRenderer.setPlane(e)
  VisibilityComponent.create(e, { visible: false })
  typeIconEntity = e
}

// Show/hide the single genre icon. `genreName` is state.curQuestionType.
function updateTypeIcon(show: boolean, genreName: string) {
  ensureTypeIcon()
  if (typeIconEntity === null) return
  const cat = show ? categoryForName(genreName) : null
  const slug = cat !== null ? GENRE_ICON_SLUG[cat] : undefined
  if (show && slug) {
    Material.setBasicMaterial(typeIconEntity, {
      texture: Material.Texture.Common({ src: GENRE_ICON_BASE + slug + '.png' }),
      alphaTexture: Material.Texture.Common({ src: GENRE_ICON_BASE + slug + '.png' })
    })
    VisibilityComponent.createOrReplace(typeIconEntity, { visible: true })
  } else {
    VisibilityComponent.createOrReplace(typeIconEntity, { visible: false })
  }
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
  state.questionText = `${winnerName}`
  state.curQuestionType = `${winnerName}`
  state.correctIndex = winner + 1
  state.phaseEndTime = Date.now() + GENRE_RESULT_DURATION_MS

  scheduleHostTransition(() => startQuestionRound(category), GENRE_RESULT_DURATION_MS)
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
  state.questionNumb += 1
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
  scheduleHostTransition(() => revealAnswer(), QUESTION_DURATION_MS)
}

function revealAnswer() {
  if (!isLocalPlayerHost()) return
  const state = TriviaState.getMutable(triviaStateEntity)
  state.phase = 'answer'
  state.phaseEndTime = Date.now() + ANSWER_DURATION_MS
  scheduleHostTransition(() => tryNextQuestion(), ANSWER_DURATION_MS)
}

function tryNextQuestion() {
  if (!isLocalPlayerHost()) return
  curQuestionIndex++
  if (curQuestionIndex > newQuestions.length - 1) {
    // Round over
    const winner = pullRoundWinner()
    curQuestionIndex = 0
    const state = TriviaState.getMutable(triviaStateEntity)
    state.questionNumb = 0
    state.roundWinner = winner ? winner.name : ''
    state.roundWinnerScore = winner ? winner.score : 0
    state.roundId += 1 // new roundId so every client re-renders into this phase
    state.phase = 'roundwinner'
    state.phaseEndTime = Date.now() + ROUND_WINNER_DURATION_MS
    scheduleHostTransition(() => startGenreVote(), ROUND_WINNER_DURATION_MS)
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
// Per-round score (synced) — used to pull the round winner
// =========================================================================

let myRoundScore = 0
let myRoundEntity: Entity | null = null
let lastRoundScoreGenre = -1

function ensureRoundEntity() {
  if (myRoundEntity !== null || !isStateSyncronized()) return
  const me = getPlayer()
  myRoundEntity = engine.addEntity()
  PlayerRoundScore.create(myRoundEntity, {
    userId: me?.userId ?? '', name: me?.name ?? 'Guest', score: 0, genreRound: -1,
  })
  syncEntity(myRoundEntity, [PlayerRoundScore.componentId])
}

// Publish my current round score, resetting it whenever a new genre vote opens.
function publishMyRoundScore() {
  ensureRoundEntity()
  if (myRoundEntity === null) return
  const state = TriviaState.get(triviaStateEntity)

  if (state.genreRound !== lastRoundScoreGenre) {
    lastRoundScoreGenre = state.genreRound
    myRoundScore = 0
    // Reset the per-round "Correct: X / 10" counter too. Without this,
    // myScore keeps climbing across rounds and never resets.
    myScore = 0
    lastScoredRoundId = -1 // let the first question of the new round score again
  }

  const cur = PlayerRoundScore.get(myRoundEntity)
  const me = getPlayer()
  const name = me?.name ?? cur.name
  const userId = me?.userId ?? cur.userId
  if (cur.score === myRoundScore && cur.genreRound === state.genreRound && cur.name === name) return

  const mut = PlayerRoundScore.getMutable(myRoundEntity)
  mut.score = myRoundScore
  mut.genreRound = state.genreRound
  mut.name = name
  mut.userId = userId
}

// Host-only: read every player's score for the current round and return the top.
// Ties resolve to whichever player's entity is read first.
function pullRoundWinner(): { name: string; score: number } | null {
  const state = TriviaState.get(triviaStateEntity)
  let best: { name: string; score: number } | null = null
  for (const [, rs] of engine.getEntitiesWith(PlayerRoundScore)) {
    if (rs.genreRound !== state.genreRound) continue
    if (rs.score <= 0) continue
    if (!best || rs.score > best.score) best = { name: rs.name || 'Guest', score: rs.score }
  }
  return best
}

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
let tShapeQNumb: PBTextShape
let tShapeQType: PBTextShape
let tShapeCorAns: PBTextShape

function VerifyTextField()
{
  // Verify Entity Text Field
  const QuestionText = engine.getEntityOrNullByName('Screen_Text')
  if (QuestionText !== null) {
    if (TextShape.has(QuestionText)) {
      tShapeQuest = TextShape.getMutable(QuestionText)
    }
  }

  // Verify Entity Text Field
  const AnsAText = engine.getEntityOrNullByName('Answer_A')
  if (AnsAText !== null) {
    if (TextShape.has(AnsAText)) {
      tShapeAnsA = TextShape.getMutable(AnsAText)
    }
  }

  // Verify Entity Text Field
  const AnsBText = engine.getEntityOrNullByName('Answer_B')
  if (AnsBText !== null) {
    if (TextShape.has(AnsBText)) {
      tShapeAnsB = TextShape.getMutable(AnsBText)
    }
  }

  // Verify Entity Text Field
  const AnsCText = engine.getEntityOrNullByName('Answer_C')
  if (AnsCText !== null) {
    if (TextShape.has(AnsCText)) {
      tShapeAnsC = TextShape.getMutable(AnsCText)
    }
  }

  // Verify Entity Text Field
  const AnsDText = engine.getEntityOrNullByName('Answer_D')
  if (AnsDText !== null) {
    if (TextShape.has(AnsDText)) {
      tShapeAnsD = TextShape.getMutable(AnsDText)
    }
  }

  // Verify Entity Text Field
  const TimerText = engine.getEntityOrNullByName('Screen_Timer')
  if (TimerText !== null) {
    if (TextShape.has(TimerText)) {
      tShapeTimer = TextShape.getMutable(TimerText)
    }
  }

  // Verify Entity Text Field
  const QNumbText = engine.getEntityOrNullByName('Question_Number')
  if (QNumbText !== null) {
    if (TextShape.has(QNumbText)) {
      tShapeQNumb = TextShape.getMutable(QNumbText)
    }
  }

  // Verify Entity Text Field
  const QTypeText = engine.getEntityOrNullByName('Question_Type')
  if (QTypeText !== null) {
    if (TextShape.has(QTypeText)) {
      tShapeQType = TextShape.getMutable(QTypeText)
    }
  }

  // Verify Entity Text Field
  const CorAnsText = engine.getEntityOrNullByName('Correct_Text')
  if (CorAnsText !== null) {
    if (TextShape.has(CorAnsText)) {
      tShapeCorAns = TextShape.getMutable(CorAnsText)
    }
  }
}

function renderFromState() {

  const state = TriviaState.get(triviaStateEntity)
  if (state.roundId === 0) return
  if (state.roundId === lastSeenRoundId && state.phase === lastSeenPhase) return
  lastSeenRoundId = state.roundId
  lastSeenPhase = state.phase

  // anchor locally instead of trusting state.phaseEndTime directly
  localPhaseAnchor = Date.now()
  localPhaseDurationMs =
  state.phase === 'question' ? QUESTION_DURATION_MS :
  state.phase === 'answer'   ? ANSWER_DURATION_MS :
  state.phase === 'genrepicked' ? GENRE_RESULT_DURATION_MS :
  state.phase === 'roundwinner' ? ROUND_WINNER_DURATION_MS :
  GENRE_DURATION_MS // 'genre' — see note below on parked clock

  // Update Timer Positioning
  if(state.phase === 'genre')
  {
    const Timer = engine.getEntityOrNullByName('Screen_Timer')
    const Icon = engine.getEntityOrNullByName('Screen_Timer_Icon')
    if(Timer && Icon)
    {
      const mtTimer = Transform.getMutable(Timer)
      const mtIcon = Transform.getMutable(Icon)
      mtTimer.position.y = 2.15
      mtIcon.position.y = 2.5
    }
  } else {
    const Timer = engine.getEntityOrNullByName('Screen_Timer')
    const Icon = engine.getEntityOrNullByName('Screen_Timer_Icon')
    if(Timer && Icon)
    {
      const mtTimer = Transform.getMutable(Timer)
      const mtIcon = Transform.getMutable(Icon)
      mtTimer.position.y = 1.4
      mtIcon.position.y = 1.75
    }
  }

  VerifyTextField()
  // Single genre icon under the Q type text, for the whole question round.
  updateTypeIcon(
    state.phase === 'question' || state.phase === 'answer',
    state.curQuestionType
  )

  if (state.phase === 'question' || state.phase === 'genre') {

    // A genre vote draws exactly like a question
    UpdateQuestionUI(true, state.questionText)

    const Qlines = Math.ceil(Math.log2((state.questionText.length + 65) / 40))
    //console.log(state.questionText.length.toString() + " , " + Qlines.toString())
    tShapeQuest.text = wrapTextToLines(state.questionText, Qlines)
    const lineCount = tShapeQuest.text.split('\n').length
    tShapeQuest.fontSize = 30 / lineCount
    tShapeQuest.textColor = Color4.White()

    tShapeCorAns.text = state.phase === 'genre' ? "" : "Correct:\n" + myScore.toString() + " / 10"
    tShapeQNumb.text = state.phase === 'question' ? "Q" + state.questionNumb : ""
    tShapeQType.text = state.phase === 'question' ? wrapTextToLines(state.curQuestionType, 2) : ""

    tShapeAnsA.text = wrapText(state.answerA, 40); tShapeAnsA.textColor = Color4.create(1,1,1,1)
    tShapeAnsB.text = wrapText(state.answerB, 40); tShapeAnsB.textColor = Color4.create(1,1,1,1)
    tShapeAnsC.text = wrapText(state.answerC, 40); tShapeAnsC.textColor = Color4.create(1,1,1,1)
    tShapeAnsD.text = wrapText(state.answerD, 40); tShapeAnsD.textColor = Color4.create(1,1,1,1)

    const AAlines = tShapeAnsA.text.split('\n').length
    tShapeAnsA.fontSize = 15 / AAlines
    const ABlines = tShapeAnsB.text.split('\n').length
    tShapeAnsB.fontSize = 15 / ABlines
    const AClines = tShapeAnsC.text.split('\n').length
    tShapeAnsC.fontSize = 15 / AClines
    const ADlines = tShapeAnsD.text.split('\n').length
    tShapeAnsD.fontSize = 15 / ADlines

    // New Question Sound Effect
    const QuestionText = engine.getEntityOrNullByName('Screen_Text')
    if(QuestionText != null)
    {
      // Prepare Audio Source
      AudioSource.createOrReplace(QuestionText, {
        audioClipUrl: '',
      })

      // Play Audio
      AudioSource.playSound(QuestionText, 'assets/sounds/New_Question.mp3')
    }

  } else if (state.phase === 'genrepicked') {
    // Winning genre announced
    UpdateQuestionUI(true, state.questionText + " Selected")

    tShapeQuest.text = wrapText(state.questionText, 30)
    tShapeQuest.textColor = Color4.White()
    const Qlines = tShapeQuest.text.split('\n').length
    tShapeQuest.fontSize = 30 / Qlines

    const shapes = [tShapeAnsA, tShapeAnsB, tShapeAnsC, tShapeAnsD]
    shapes.forEach((s, i) => { s.textColor = (i + 1 === state.correctIndex) ? Color4.create(0,1,0,1) : Color4.create(1,1,1,0.35) })

    // Genre Selected
    const QuestionText = engine.getEntityOrNullByName('Screen_Text')
    if(QuestionText != null)
    {
      // Prepare Audio Source
      AudioSource.createOrReplace(QuestionText, {
        audioClipUrl: '',
      })

      // Play Audio
      AudioSource.playSound(QuestionText, 'assets/sounds/Round_Winner.mp3')
    }

    // Point the leaderboard at the category now being played
    const winnerName = [state.answerA, state.answerB, state.answerC, state.answerD][state.correctIndex - 1]
    const winnerCat = categoryForName(winnerName)
    if (winnerCat !== null) setCurrentCategory(winnerCat, winnerName)

  } else if (state.phase === 'roundwinner') {
    // Dedicated end-of-round screen: the round winner on the main board for 10s.
    UpdateQuestionUI(true, state.roundWinner ? state.roundWinner + " won the round" : "No winner this round")

    // Force Players Emote
    const me = getPlayer()
    if(me && me.name === state.roundWinner)
    {
      triggerEmote({ predefinedEmote: 'handsair' })
    } else {
      triggerEmote({ predefinedEmote: 'clap' })
    }

    // Pop Confetti
    const confetti = engine.getEntityOrNullByName(EntityNames.confetti)
    if (confetti) {
      const confettiActions = getActionEvents(confetti)
      confettiActions.emit('Explode', {})
    }

    // End Of Round Sound Effect
    const QuestionText = engine.getEntityOrNullByName('Screen_Text')
    if(QuestionText != null)
    {
      // Prepare Audio Source
      AudioSource.createOrReplace(QuestionText, {
        audioClipUrl: '',
      })

      // Play Audio
      AudioSource.playSound(QuestionText, 'assets/sounds/Round_Winner.mp3')
    }

    const text = state.roundWinner
      ? state.roundWinner + " wins the round!\n" + state.roundWinnerScore + " / 10"
      : "No winner\nthis round"
    tShapeQuest.text = text
    tShapeQuest.textColor = Color4.White()
    tShapeQuest.fontSize = 30 / text.split('\n').length

    tShapeCorAns.text = ""
    tShapeQNumb.text = ""
    tShapeQType.text = ""
    tShapeAnsA.text = ""; tShapeAnsB.text = ""; tShapeAnsC.text = ""; tShapeAnsD.text = ""

  } else {
    // 'answer' phase
    const gotItRight = curAnswerValue === state.correctIndex

    // Only score once per round, even if this function re-runs
    if (state.roundId !== lastScoredRoundId) {
      lastScoredRoundId = state.roundId
      if (gotItRight) {
        myScore++
        myRoundScore++ // this round's tally, for the round winner
        tShapeCorAns.text = "Correct:\n" + myScore.toString() + " / 10"
        UpdateAnswersUI(true, myScore)
        submitCorrectAnswer() // record the point in the current category (all-time board)
      }
    }
    
    // Win Lose Sound Effect
    const QuestionText = engine.getEntityOrNullByName('Screen_Text')
    if(QuestionText != null)
    {
      // Prepare Audio Source
      AudioSource.createOrReplace(QuestionText, {
        audioClipUrl: '',
      })

      // Play Win Audio
      if(gotItRight) {
        AudioSource.playSound(QuestionText, 'assets/sounds/Win.mp3')
      } else {
        AudioSource.playSound(QuestionText, 'assets/sounds/Wrong_Answer.wav')
      }
    }

    // Update Player Emote
    const winEmotes: string[] = ['clap', 'dab', 'fistpump']
    const loseEmotes: string[] = ['shrug', 'cry', 'dontsee']
    
    if (gotItRight) {
      // Use Math.floor to get an integer index: 0, 1, or 2
      const emoteIndex = Math.floor(Math.random() * winEmotes.length)
      const emote = winEmotes[emoteIndex]
      triggerEmote({ predefinedEmote: emote })
    } else {
      const emoteIndex = Math.floor(Math.random() * loseEmotes.length)
      const emote = loseEmotes[emoteIndex]
      triggerEmote({ predefinedEmote: emote })
    }

    // Update Screen Text
    UpdateQuestionUI(false, "")
    tShapeQuest.text = gotItRight ? 'Correct' : 'Incorrect'
    tShapeQuest.textColor = gotItRight ? Color4.Green() : Color4.Red()
    tShapeQuest.fontSize = 25
    const shapes = [tShapeAnsA, tShapeAnsB, tShapeAnsC, tShapeAnsD]
    shapes.forEach((s, i) => { s.textColor = (i + 1 === state.correctIndex) ? Color4.create(0,1,0,1) : Color4.create(1,0,0,1) })

  }
}

export function GetCurrentState()
{
  const state = TriviaState.get(triviaStateEntity)
  return state.phase
}

// Runs every tick
let lastRenderedSecond = -1
let lastShowedClock = false

// Local timer anchoring
let lastTimerPhase = ''
let lastTimerRoundId = -1
let localPhaseAnchor = 0
let localPhaseDurationMs = 0

// Tracks whether we've locally anchored the running countdown
let genreClockRunning = false

function renderTimer() {
  if (!tShapeTimer) return

  const state = TriviaState.get(triviaStateEntity)
  const showsClock = state.phase === 'question' || state.phase === 'genre'

  // Phase or round changed
  if (state.phase !== lastTimerPhase || state.roundId !== lastTimerRoundId) {
    lastTimerPhase = state.phase
    lastTimerRoundId = state.roundId
    genreClockRunning = false // re-evaluated fresh below for this new phase/round

    if (state.phase === 'question') {
      localPhaseAnchor = Date.now()
      localPhaseDurationMs = QUESTION_DURATION_MS
    } else if (state.phase === 'answer') {
      localPhaseAnchor = Date.now()
      localPhaseDurationMs = ANSWER_DURATION_MS
    } else if (state.phase === 'genrepicked') {
      localPhaseAnchor = Date.now()
      localPhaseDurationMs = GENRE_RESULT_DURATION_MS
    }
  }

  // Genre phase: phaseEndTime === 0 means parked
  if (state.phase === 'genre') {
    const parked = state.phaseEndTime === 0
    if (parked) {
      genreClockRunning = false
    } else if (!genreClockRunning) {
      genreClockRunning = true
      localPhaseAnchor = Date.now()
      localPhaseDurationMs = GENRE_DURATION_MS
    }
  }

  const msRemaining =
    state.phase === 'genre' && !genreClockRunning
      ? GENRE_DURATION_MS
      : localPhaseDurationMs - (Date.now() - localPhaseAnchor)

  const secondsRemaining = Math.max(0, Math.ceil(msRemaining / 1000))

  // Skip redundant text writes when the displayed number hasn't changed
  if (secondsRemaining === lastRenderedSecond && showsClock === lastShowedClock) return


  // Ticking Sound Effect
  if(secondsRemaining >= 5 && (state.phase === 'question' || state.phase === 'genre'))
  {
    const AnsAText = engine.getEntityOrNullByName('Answer_A')

    if(AnsAText != null)
    {
      // Prepare Audio Source
      AudioSource.createOrReplace(AnsAText, {
        audioClipUrl: '',
      })

      if(secondsRemaining == 5)
      {
        // Play Audio
        AudioSource.playSound(AnsAText, 'assets/sounds/Ticking.wav')
      }
    }
  }

  lastRenderedSecond = secondsRemaining
  lastShowedClock = showsClock
  VerifyTextField()
  const display = showsClock ? `${secondsRemaining}` : ''
  tShapeTimer.text = display
  tShapeTimer.textColor = secondsRemaining > 5 ? Color4.create(1,1,1,1) : Color4.create(1,0,0,1)
}

function wrapText(input: string, maxChars: number = 10): string {
  const regex = new RegExp(`(?<=\\s|^)(.{1,${maxChars}})(?:\\s+|$)`, 'g')
  return input.match(regex)?.join('\n') || input
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

  /*
  const firstPersonZone = engine.addEntity()
  Transform.create(firstPersonZone, { position: Vector3.create(0, 0, 0) })
  CameraModeArea.create(firstPersonZone, { area: Vector3.create(25, 15, 25), mode: CameraType.CT_FIRST_PERSON })
  */

  setUpSyncedEntities()
  SetUpTriviaUi()

  // Persistent, per-category leaderboard board. Nudge position/rotation to fit
  // your scene; baseUrl points at the deployed backend.
  SetUpLeaderboard({
    baseUrl: 'https://dcl-leaderboard.vercel.app',
    position: Vector3.create(10.0, 3.0, -3.95),
    rotation: Quaternion.fromEulerDegrees(0, 180, 0),
    scale: 0.4,
    rows: 8,
  })

  // Second board: cycles TODAY / THIS WEEK / THIS MONTH. Placed next to the
  // per-category board (same wall/scale) — nudge position to fit your scene.
  SetUpPeriodLeaderboard({
    baseUrl: 'https://dcl-leaderboard.vercel.app',
    position: Vector3.create(-10, 3.0, -3.95),
    rotation: Quaternion.fromEulerDegrees(0, 180, 0),
    scale: 0.4,
    rows: 8,
    cycleMs: 8000,
  })

  engine.addSystem(() => {
    tryClaimHost()
    publishMyVote()
    publishMyRoundScore()
    renderFromState()
    renderTimer()
    tickLeaderboard()
    tickPeriodLeaderboard()
    if (isLocalPlayerHost()) {
      if (!gameLoopStarted) {
        gameLoopStarted = true
        GameLoop()
      }
      hostGenreTick()
    }
  })
}