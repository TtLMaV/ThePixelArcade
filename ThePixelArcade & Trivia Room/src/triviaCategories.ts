// Split out from index.ts so questions.ts (the generated local question bank)
// can reference category ids without creating a circular import between
// index.ts <-> questions.ts. index.ts re-exports this for backward
// compatibility, so `import { TriviaCategory } from './index'` elsewhere in
// the scene still works unchanged.
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
