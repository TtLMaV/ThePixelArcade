import { engine } from '@dcl/sdk/ecs'
import { getTriggerEvents } from '@dcl/asset-packs/dist/events'
import { TriggerType } from '@dcl/asset-packs'
import { SetCurrentAnswer } from '../../../src/index'

export function main() {
  const triggerA = engine.getEntityOrNullByName('Trigger_Answer_A')
  if (!triggerA) {
    console.log('Trigger_Answer_A not found, check the name in the entity tree')
    return
  }

const triggerB = engine.getEntityOrNullByName('Trigger_Answer_B')
if (!triggerB) {
    console.log('Trigger_Answer_B not found, check the name in the entity tree')
    return
  }

const triggerC = engine.getEntityOrNullByName('Trigger_Answer_C')
if (!triggerC) {
    console.log('Trigger_Answer_C not found, check the name in the entity tree')
    return
  }

const triggerD = engine.getEntityOrNullByName('Trigger_Answer_D')
if (!triggerD) {
    console.log('Trigger_Answer_D not found, check the name in the entity tree')
    return
  }

  getTriggerEvents(triggerA).on(TriggerType.ON_PLAYER_ENTERS_AREA, () => {
    SetCurrentAnswer(1)
  })

  getTriggerEvents(triggerB).on(TriggerType.ON_PLAYER_ENTERS_AREA, () => {
    SetCurrentAnswer(2)
  })

  getTriggerEvents(triggerC).on(TriggerType.ON_PLAYER_ENTERS_AREA, () => {
    SetCurrentAnswer(3)
  })

  getTriggerEvents(triggerD).on(TriggerType.ON_PLAYER_ENTERS_AREA, () => {
    SetCurrentAnswer(4)
  })
}