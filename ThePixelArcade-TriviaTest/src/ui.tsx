import ReactEcs, { ReactEcsRenderer, UiEntity, Button} from "@dcl/sdk/react-ecs"
import * as utils from '@dcl-sdk/utils'
import { Color4 } from '@dcl/sdk/math'

let QuestionTest = "0"
var QuestionVisable: 'flex' | 'none' = 'none'
let AnswerText = "0"
var AnswerVisable: 'flex' | 'none' = 'none'
var TeleportText = ""
var TeleportVisable: 'flex' | 'none' = 'none'

export function UpdateQuestionUI(showUIState: boolean, question: string)
{
  QuestionVisable = showUIState ? 'flex' : 'none'
  QuestionTest = question
}

export function UpdateAnswersUI(showUIState: boolean, amountCorrect: number)
{
  AnswerVisable = showUIState ? 'flex' : 'none'
  AnswerText = "Correct: " + amountCorrect.toString()
}

export function UpdateTeleportUI(showUIState: boolean, text: string)
{
  TeleportVisable = showUIState ? 'flex' : 'none'
  TeleportText = text
}
export function UpdateText(question: string, amountCorrect: number){}
export function UpdateShowUI(showUIState: boolean){}

export const TriviaUi = () => (

  // Question Text at the top
  <UiEntity
  uiTransform={{
    width: '98%',
    height: '98%',
    positionType: 'absolute',
    position: { top: '1%', bottom: '1%', right: '1%'},
    margin: { left: -400 },
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'column',
  }}uiBackground={{ color: Color4.create(0, 0, 0, 0) }}>
    <UiEntity
    uiTransform={{
      width: 800,
      height: 125,
      positionType: 'absolute',
      position: { top: '0%', left: '50%' },
      margin: { left: -400 },
      display: QuestionVisable,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'column',
    }}
    uiBackground={{
    textureMode: 'stretch',
    texture: {
      src: 'assets/scene/Images/Pixel_Arcade_2.png',
    }}}
    >
      <UiEntity
      uiTransform={{ width: '90%', height: 100, margin: { top: 20, bottom: 20 } }}
      uiText={{
        value: QuestionTest,
        fontSize: 28,
        color: Color4.White(),
      }}
  /></UiEntity>

  // Answers Text at the bottom
  <UiEntity
  uiTransform={{
    width: 800,
    height: 80,
    positionType: 'absolute',
    position: { bottom: '0%', left: '50%' },
    margin: { left: -400 },
    display: AnswerVisable,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'column',
  }}
  uiBackground={{
    textureMode: 'stretch',
    texture: {
      src: 'assets/scene/Images/Pixel_Arcade.png',
    }}}
  >
    
    <UiEntity
      uiTransform={{ width: '90%', height: 100, margin: { top: 20, bottom: 20 } }}
      uiText={{
        value: AnswerText,
        fontSize: 28,
        color: Color4.White(),
      }}
    /></UiEntity>


  // Teleport Text in the middle
  <UiEntity
    uiTransform={{
      width: 800,
      height: 80,
      positionType: 'absolute',
      position: { bottom: '50%', left: '50%' },
      margin: { left: -400 },
      display: TeleportVisable,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'column',
    }}
    uiBackground={{
    textureMode: 'stretch',
    texture: {
      src: 'assets/scene/Images/Pixel_Arcade.png',
    }}}
  >

    // Question Text at the top
    <UiEntity
      uiTransform={{ width: '90%', height: 100, margin: { top: 20, bottom: 20 } }}
      uiText={{
        value: TeleportText,
        fontSize: 28,
        color: Color4.White(),
      }}
    /></UiEntity></UiEntity>
)

export function SetUpTriviaUi() {
  //
  ReactEcsRenderer.setUiRenderer(TriviaUi, { virtualWidth: 1920, virtualHeight: 1080 })
}