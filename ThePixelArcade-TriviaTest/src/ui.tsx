import ReactEcs, { ReactEcsRenderer, UiEntity, Button} from "@dcl/sdk/react-ecs"
import * as utils from '@dcl-sdk/utils'
import { Color4 } from '@dcl/sdk/math'

let displayText = "0"
var UIVisable: 'flex' | 'none' = 'none'

export function UpdateShowUI(showUIState: boolean)
{
  UIVisable = showUIState ? 'flex' : 'none'
}

export function UpdateText(prefix: string, amountCorrect: number)
{
  displayText = prefix + amountCorrect.toString()
}

export const TriviaUi = () => (
  <UiEntity
    uiTransform={{
      width: 800,
      height: 80,
      positionType: 'absolute',
      position: { bottom: '5%', left: '50%' },
      margin: { left: -400 },
      display: UIVisable,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'column',
    }}
    uiBackground={{ color: Color4.create(0, 0, 0, 0.8) }}
  >

    // Question Text at the top
    <UiEntity
      uiTransform={{ width: '90%', height: 100, margin: { top: 20, bottom: 20 } }}
      uiText={{
        value: displayText,
        fontSize: 28,
        color: Color4.White(),
      }}
    />
  </UiEntity>
)

export function SetUpTriviaUi() {
  //
  ReactEcsRenderer.setUiRenderer(TriviaUi, { virtualWidth: 1920, virtualHeight: 1080 })
}

/*

//
var QV: 'flex' | 'none' = 'none'
var QTxt: string = ''
var B1Txt: string = ''
var B1V: 'flex' | 'none' = 'none'
var B2Txt: string = ''
var B2V: 'flex' | 'none' = 'none'
var B3Txt: string = ''
var B3V: 'flex' | 'none' = 'none'
var B4Txt: string = ''
var B4V: 'flex' | 'none' = 'none'

//
var currentAnswer = 0

//
let onResetCallback: (() => void) | undefined

//
export function TestAnswer(answerIndex: number) {
  
  //
  if(currentAnswer == -1) {
    // If the callback exists, run it!
    if (onResetCallback) {
      onResetCallback()
    }
  } else if(answerIndex == currentAnswer) {
    //
    UpdateTriviaUi('Correct', 'Continue', '', '', '', -1)
    utils.playSound('assets/sounds/correct.wav')

  } else {
    //
    UpdateTriviaUi('Wrong', 'Continue', '', '', '', -1)
    utils.playSound('assets/sounds/incorrect.wav')
  }
}

//
export function SetUpTriviaUi(onReset: () => void) {
  //
  onResetCallback = onReset

  //
  ReactEcsRenderer.setUiRenderer(TriviaUi, { virtualWidth: 1920, virtualHeight: 1080 })
}

//
export function UpdateTriviaUi(inQTxt: string = '', inB1Txt: string = '', inB2Txt: string = '', inB3Txt: string = '', inB4Txt: string = '', AnswerNumber: number = 0) {
  //
  QTxt = inQTxt
  B1Txt = inB1Txt
  B2Txt = inB2Txt
  B3Txt = inB3Txt
  B4Txt = inB4Txt

  //
  const QCBool = (QTxt != '') || (B1Txt != '') || (B2Txt != '') || (B3Txt != '') || (B4Txt != '')
  QV = QCBool ? 'flex' : 'none'
  
  //
  B1V = (B1Txt != '') ? 'flex' : 'none'
  B2V = (B2Txt != '') ? 'flex' : 'none'
  B3V = (B3Txt != '') ? 'flex' : 'none'
  B4V = (B4Txt != '') ? 'flex' : 'none'

  //
  QV = 'none'
  B1V = 'none'
  B2V = 'none'
  B3V = 'none'
  B4V = 'none'

  //
  currentAnswer = AnswerNumber
}

//
export const TriviaUi = () => (
  <UiEntity
    uiTransform={{
      width: 800,
      height: 350,
      positionType: 'relative',
      position: { top: '20%', left: '50%' },
      margin: { left: -400 },
      display: QV,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'column',
    }}
    uiBackground={{ color: Color4.create(0, 0, 0, 0.8) }}
  >

    // Question Text at the top
    <UiEntity
      uiTransform={{ width: '90%', height: 100, margin: { top: 20, bottom: 20 } }}
      uiText={{
        value: QTxt,
        fontSize: 28,
        color: Color4.White(),
      }}
    />

    // Collumn Div For Top Buttons
    <UiEntity
    uiTransform={{
      justifyContent: 'center',
      alignSelf: 'center',
			alignContent: 'center',
      alignItems: 'center',
      flexDirection: 'row',
      width: '90%',
      height: 200,
      flexGrow: 1,
			margin: { left: '0%', right: '0%', bottom: 20 },
    }}
    uiBackground={{ color: Color4.create(1, 1, 1, 0) }}
  > 

    // Button 1 Results
    <UiEntity
      uiTransform={{ width: '40%', height: 100, display: B1V, margin: {left: 20}}}
      uiText={{
        value: B1Txt,
        fontSize: 28,
        color: Color4.White(),
      }}
    >
      <Button
		  value = ""
		  uiTransform={{ width: '100%', height: 100, display: B1V}}
      uiBackground={{ color: Color4.create(0.2, 0.2, 0.2, 1)}}
		  onMouseDown={() => {
			  TestAnswer(1)
		  }}
	    />
    </UiEntity>

    // Button 2 Results
    <UiEntity
      uiTransform={{ width: '40%', height: 100, display: B2V, margin: {left: 20}}}
      uiText={{
        value: B2Txt,
        fontSize: 28,
        color: Color4.White(),
      }}
    >
      <Button
		  value = ""
		  uiTransform={{ width: '100%', height: 100, display: B2V}}
      uiBackground={{ color: Color4.create(0.2, 0.2, 0.2, 1)}}
		  onMouseDown={() => {
			  TestAnswer(2)
		  }}
	    />
    </UiEntity>
        
    </UiEntity>

    // Collumn Div For Bottom Buttons
    <UiEntity
    uiTransform={{
      justifyContent: 'center',
      alignSelf: 'center',
			alignContent: 'center',
      alignItems: 'center',
      flexDirection: 'row',
      width: '90%',
      height: 200,
      flexGrow: 1,
			margin: { left: '0%', right: '0%'},
    }}
    uiBackground={{ color: Color4.create(1, 1, 1, 0) }}
  > 

    // Button 3 Results
    <UiEntity
      uiTransform={{ width: '40%', height: 100, display: B3V, margin: {left: 20}}}
      uiText={{
        value: B3Txt,
        fontSize: 28,
        color: Color4.White(),
      }}
    >
      <Button
		  value = ""
		  uiTransform={{ width: '100%', height: 100, display: B3V}}
      uiBackground={{ color: Color4.create(0.2, 0.2, 0.2, 1)}}
		  onMouseDown={() => {
			  TestAnswer(3)
		  }}
	    />
    </UiEntity>

    // Button 4 Results
    <UiEntity
      uiTransform={{ width: '40%', height: 100, display: B4V, margin: {left: 20}}}
      uiText={{
        value: B4Txt,
        fontSize: 28,
        color: Color4.White(),
      }}
    >
      <Button
		  value = ""
		  uiTransform={{ width: '100%', height: 100, display: B4V}}
      uiBackground={{ color: Color4.create(0.2, 0.2, 0.2, 1)}}
		  onMouseDown={() => {
			  TestAnswer(4)
		  }}
	    />
    </UiEntity>

    </UiEntity>
  </UiEntity>
)
*/