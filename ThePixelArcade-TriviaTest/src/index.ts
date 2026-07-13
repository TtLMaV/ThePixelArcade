import {Color4, Vector3} from '@dcl/sdk/math'
import { engine, TextShape, Transform, CameraModeArea, CameraType, PBTextShape, Schemas } from '@dcl/sdk/ecs'
import { SetUpTriviaUi, UpdateNumberCorrect} from './ui'
import { syncEntity, isStateSyncronized } from '@dcl/sdk/network'
import { getPlayer, onLeaveScene } from '@dcl/sdk/players'
import { MainSignTag } from '../assets/scene/Scripts/ChangeText'
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



/*
// ----------------------------------
//
// OLD SHIT
//
//
// ----------------------------------

// Clear the cached session token, eg between game sessions.
export function clearSession(): void {
  sessionToken = null
}

//
export async function GameLoop()
{
  SetUpTriviaUi(tryNextQuestion);
  let newQO: FetchOptions = {amount: maxQuestions, category: questionsCatagory, difficulty: 'easy', type: 'multiple', useSessionToken: true};
  newQuestions = await fetchQuestions(newQO);
  askRandomQuestion(newQuestions);
}


// =========================================================================
// Main
// =========================================================================
let curQuestionIndex = 0
let curAnswerValue = 0
let maxQuestions = 10
let questionsCatagory = 15
let newQuestions: TriviaQuestion[]

let tShapeQuest: PBTextShape
let tShapeAnsA: PBTextShape
let tShapeAnsB: PBTextShape
let tShapeAnsC: PBTextShape
let tShapeAnsD: PBTextShape

export function main() {

  //Enforce First Person with a FPS Zone
  const firstPersonZone = engine.addEntity()
  Transform.create(firstPersonZone, {
      position: Vector3.create(8, 2, 8),
  })
  CameraModeArea.create(firstPersonZone, {
      area: Vector3.create(100, 100, 100),
      mode: CameraType.CT_FIRST_PERSON,
  })

  // Init Game Functions
  clearSession()
  curQuestionIndex = 0;
  GameLoop();
}

function tryNextQuestion()
{
  //
  curQuestionIndex++;

  //
  if(curQuestionIndex > maxQuestions - 1)
  {
    //
    curQuestionIndex = 0;
    GameLoop();
  }
  else {
    //
    askRandomQuestion(newQuestions);
  }
}

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
}

//
export function askRandomQuestion(newQuestions: TriviaQuestion[] ) {

  //
  let currentQuestion: TriviaQuestion = newQuestions[curQuestionIndex];
  
  //
  const QText = currentQuestion.question;
  const A1Text = currentQuestion.answers[0];
  const A2Text = currentQuestion.answers[1];
  const A3Text = currentQuestion.answers[2];
  const A4Text = currentQuestion.answers[3];
  const Answer = currentQuestion.correctIndex + 1;

  //
  VerifyTextField()

  // Set All Texts
  tShapeQuest.text = wrapText(QText, 30)
  tShapeAnsA.text = wrapText(A1Text, 10)
  tShapeAnsA.textColor = Color4.create(1, 1, 1, 1)
  tShapeAnsB.text = wrapText(A2Text, 10)
  tShapeAnsB.textColor = Color4.create(1, 1, 1, 1)
  tShapeAnsC.text = wrapText(A3Text, 10)
  tShapeAnsC.textColor = Color4.create(1, 1, 1, 1)
  tShapeAnsD.text = wrapText(A4Text, 10)
  tShapeAnsD.textColor = Color4.create(1, 1, 1, 1)

  //
  setTimeout(() => {
    verifyAnswer(curAnswerValue);
  }, 15000);
}

//
function wrapText(input: string, maxChars: number = 10): string {
  // Regex matches any chunk of characters up to maxChars, ending at a space
  const regex = new RegExp(`(?<=\\s|^)(.{1,${maxChars}})(?:\\s+|$)`, 'g');
  return input.match(regex)?.join('\n') || input;
}

//
export function SetCurrentAnswer(answerIndex: number)
{
  curAnswerValue = answerIndex
}

//
function verifyAnswer(answerIndex: number)
{
  console.log('GIVE ANSWER')

  let thisAnswer = newQuestions[curQuestionIndex].correctIndex + 1
  if(answerIndex == thisAnswer)
  {
    tShapeQuest.text = wrapText("Correct", 30)
  } else {
    tShapeQuest.text = wrapText("Incorrect", 30)
  }

  //
  VerifyTextField()

  //
  tShapeAnsA.textColor = Color4.create(1, 0, 0, 1)
  tShapeAnsB.textColor = Color4.create(1, 0, 0, 1)
  tShapeAnsC.textColor = Color4.create(1, 0, 0, 1)
  tShapeAnsD.textColor = Color4.create(1, 0, 0, 1)

  switch(thisAnswer)
  {
    case 1: tShapeAnsA.textColor = Color4.create(0, 1, 0, 1); break;
    case 2: tShapeAnsB.textColor = Color4.create(0, 1, 0, 1); break;
    case 3: tShapeAnsC.textColor = Color4.create(0, 1, 0, 1); break;
    case 4: tShapeAnsD.textColor = Color4.create(0, 1, 0, 1); break;
  }

  //
  setTimeout(() => {    
    tryNextQuestion();
  }, 3000);
}

*/

// =========================================================================
// Synced state — this is the only thing every client trusts
// =========================================================================

// Keep enum ids under 8001, see DCL docs on entityEnumId
enum SyncIds {
  TRIVIA_STATE = 1,
  HOST_CLAIM = 2,
}

export const TriviaState = engine.defineComponent('TriviaStateComponent', {
  roundId: Schemas.Int,        // bumped every time the host publishes a new question
  phase: Schemas.String,        // 'question' | 'answer'
  questionText: Schemas.String,
  answerA: Schemas.String,
  answerB: Schemas.String,
  answerC: Schemas.String,
  answerD: Schemas.String,
  correctIndex: Schemas.Int,    // 1-4
})

export const HostClaim = engine.defineComponent('HostClaimComponent', {
  hostUserId: Schemas.String,
})

const triviaStateEntity = engine.addEntity()
const hostClaimEntity = engine.addEntity()

function setUpSyncedEntities() {
  TriviaState.create(triviaStateEntity, {
    roundId: 0, phase: 'question',
    questionText: '', answerA: '', answerB: '', answerC: '', answerD: '',
    correctIndex: 0,
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
// Host-only game loop (unchanged fetch logic, just gated + publishing state)
// =========================================================================

let curQuestionIndex = 0
let curAnswerValue = 0
let maxQuestions = 10
let questionsCatagory = 15
let newQuestions: TriviaQuestion[] = []

export async function GameLoop() {
  if (!isLocalPlayerHost()) return // everyone else just waits for synced state

  const newQO: FetchOptions = { amount: maxQuestions, category: questionsCatagory, difficulty: 'easy', type: 'multiple', useSessionToken: true }
  newQuestions = await fetchQuestions(newQO)
  curQuestionIndex = 0
  publishCurrentQuestion()
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

  // host owns timing too, so everyone reveals/advances together
  setTimeout(() => revealAnswer(), 15000)
}

function revealAnswer() {
  if (!isLocalPlayerHost()) return
  const state = TriviaState.getMutable(triviaStateEntity)
  state.phase = 'answer'
  setTimeout(() => tryNextQuestion(), 3000)
}

function tryNextQuestion() {
  if (!isLocalPlayerHost()) return
  curQuestionIndex++
  if (curQuestionIndex > maxQuestions - 1) {
    curQuestionIndex = 0
    GameLoop()
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
}

function renderFromState() {
  const state = TriviaState.get(triviaStateEntity)
  if (state.roundId === lastSeenRoundId && state.phase === lastSeenPhase) return
  lastSeenRoundId = state.roundId
  lastSeenPhase = state.phase

  VerifyTextField()

  if (state.phase === 'question') {
    tShapeQuest.text = wrapText(state.questionText, 30)
    tShapeAnsA.text = wrapText(state.answerA, 10); tShapeAnsA.textColor = Color4.create(1,1,1,1)
    tShapeAnsB.text = wrapText(state.answerB, 10); tShapeAnsB.textColor = Color4.create(1,1,1,1)
    tShapeAnsC.text = wrapText(state.answerC, 10); tShapeAnsC.textColor = Color4.create(1,1,1,1)
    tShapeAnsD.text = wrapText(state.answerD, 10); tShapeAnsD.textColor = Color4.create(1,1,1,1)
  } else {
    // 'answer' phase
    const gotItRight = curAnswerValue === state.correctIndex

    // Only score once per round, even if this function re-runs
    if (state.roundId !== lastScoredRoundId) {
      lastScoredRoundId = state.roundId
      if (gotItRight) {
        myScore++
        UpdateNumberCorrect(myScore)
      }
    }

    tShapeQuest.text = wrapText(gotItRight ? 'Correct' : 'Incorrect', 30)
    const shapes = [tShapeAnsA, tShapeAnsB, tShapeAnsC, tShapeAnsD]
    shapes.forEach((s, i) => { s.textColor = (i + 1 === state.correctIndex) ? Color4.create(0,1,0,1) : Color4.create(1,0,0,1) })
  }
}

function wrapText(input: string, maxChars: number = 10): string {
  const regex = new RegExp(`(?<=\\s|^)(.{1,${maxChars}})(?:\\s+|$)`, 'g')
  return input.match(regex)?.join('\n') || input
}

export function SetCurrentAnswer(answerIndex: number) {
  curAnswerValue = answerIndex
}

export function GetCurrentAnswer() {
  curAnswerValue = answerIndex
}

// =========================================================================
// Main
// =========================================================================

export function main() {
  // Check All The Answer Text Fields
  VerifyTextField()
  tShapeQuest.text = "Loading..."

  const firstPersonZone = engine.addEntity()
  Transform.create(firstPersonZone, { position: Vector3.create(8, 2, 8) })
  CameraModeArea.create(firstPersonZone, { area: Vector3.create(100, 100, 100), mode: CameraType.CT_FIRST_PERSON })

  setUpSyncedEntities()
  SetUpTriviaUi()

  engine.addSystem(() => {
    tryClaimHost()
    renderFromState()
    if (isLocalPlayerHost() && !gameLoopStarted) {
      gameLoopStarted = true
      GameLoop()
   }
  })
}