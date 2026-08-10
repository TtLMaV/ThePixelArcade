import ReactEcs, { ReactEcsRenderer, UiEntity, Label, scaleFontSize, ScreenInsetArea } from "@dcl/sdk/react-ecs"
import { isMobile, getPlatform } from '@dcl/sdk/platform'
import * as utils from '@dcl-sdk/utils'
import { Color4 } from '@dcl/sdk/math'

let QuestionTest = "0"
var QuestionVisable: 'flex' | 'none' = 'none'
let AnswerText = "0"
var AnswerVisable: 'flex' | 'none' = 'none'
var TeleportText = ""
var TeleportVisable: 'flex' | 'none' = 'none'

// ---- responsive font ----------------------------------------------------
// scaleFontSize()'s responsive term is divided by devicePixelRatio, so on a
// phone (ratio 2-3x) the text ends up tiny. Give mobile a much larger size.
// Tune the two MOBILE numbers below until it reads well on your device;
// desktop keeps your original values.
function onMobile(): boolean {
  try {
    return typeof isMobile === 'function' ? (isMobile as () => boolean)() : !!isMobile
  } catch {
    return false
  }
}

function labelFont(): number {
  return onMobile()
    ? scaleFontSize(42, '3.5vh') // MOBILE — increase these if still too small
    : scaleFontSize(22, '1.0vh') // DESKTOP — your original
}

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
  <ScreenInsetArea
  uiTransform={{
    width: '100%',
    height: '100%',
    //positionType: 'absolute',
    //position: { top: '1%', bottom: '1%', right: '1%'},
    margin: { left: '0%' },
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'column',
  }}
  uiBackground={{ color: Color4.create(0, 0, 0, 0) }}>
    <UiEntity
    uiTransform={{
      width: '40%',
      height: '12.5%',
      positionType: 'absolute',
      position: { top: '0%', left: '50%' },
      margin: { left: '-20%' },
      display: 'none',
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
      <UiEntity uiTransform={{ width: '90%', height: '90%', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', }}>
        <Label
          value={QuestionTest}
          fontSize={labelFont()}
          textAlign="middle-center"
          color={Color4.White()}
        />
      </UiEntity>
    </UiEntity>

    <UiEntity
    uiTransform={{
      width: '40%',
      height: '8%',
      positionType: 'absolute',
      position: { bottom: '0%', left: '50%' },
      margin: { left: '-20%' },
      display: 'none',
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
    <UiEntity uiTransform={{ width: '90%', height: '90%', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', }}>
        <Label
          value={AnswerText}
          fontSize={labelFont()}
          textAlign="middle-center"
          color={Color4.White()}
        />
      </UiEntity>
    </UiEntity>

    <UiEntity
      uiTransform={{
        width: '40%',
        height: '12%',
        positionType: 'absolute',
        position: { bottom: '44%', left: '50%' },
        margin: { left: '-20%' },
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
    <UiEntity uiTransform={{ width: '90%', height: '90%', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', }}>
        <Label
          value={TeleportText}
          fontSize={labelFont()}
          textAlign="middle-center"
          color={Color4.White()}
        />
      </UiEntity>
    </UiEntity>
  </ScreenInsetArea>
)

export function SetUpTriviaUi() {
  //
  ReactEcsRenderer.setUiRenderer(TriviaUi, { virtualWidth: 1920, virtualHeight: 1080 })
}
