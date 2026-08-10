import { engine, LightSource, AudioSource } from '@dcl/sdk/ecs'
import { getTriggerEvents } from '@dcl/asset-packs/dist/events'
import { TriggerType } from '@dcl/asset-packs'
import { SetCurrentAnswer, GetCurrentAnswer } from '../../../src/index'

export function main() {
  //
  const triggerA = engine.getEntityOrNullByName('Trigger_Answer_A')
  if (!triggerA) {
    console.log('Trigger_Answer_A not found, check the name in the entity tree')
    return
  }

  //
  const triggerB = engine.getEntityOrNullByName('Trigger_Answer_B')
  if (!triggerB) {
    console.log('Trigger_Answer_B not found, check the name in the entity tree')
    return
  }

  //
  const triggerC = engine.getEntityOrNullByName('Trigger_Answer_C')
  if (!triggerC) {
    console.log('Trigger_Answer_C not found, check the name in the entity tree')
    return
  }

  //
  const triggerD = engine.getEntityOrNullByName('Trigger_Answer_D')
  if (!triggerD) {
    console.log('Trigger_Answer_D not found, check the name in the entity tree')
    return
  }

  //
  const LightA = engine.getEntityOrNullByName('Light_A')
  if (!LightA) {
    console.log('Light_A not found, check the name in the entity tree')
    return
  }

  //
  const LightB = engine.getEntityOrNullByName('Light_B')
  if (!LightB) {
    console.log('Light_B not found, check the name in the entity tree')
    return
  }

  //
  const LightC = engine.getEntityOrNullByName('Light_C')
  if (!LightC) {
    console.log('Light_C not found, check the name in the entity tree')
    return
  }

  //
  const LightD = engine.getEntityOrNullByName('Light_D')
  if (!LightD) {
    console.log('Light_D not found, check the name in the entity tree')
    return
  }

  // Sound Functions
  const soundEntityA = triggerA
  const soundEntityB = triggerB
  const soundEntityC = triggerC
  const soundEntityD = triggerD

  AudioSource.createOrReplace(soundEntityA, {
    audioClipUrl: '',
  })
  AudioSource.createOrReplace(soundEntityB, {
    audioClipUrl: '',
  })
  AudioSource.createOrReplace(soundEntityC, {
    audioClipUrl: '',
  })
  AudioSource.createOrReplace(soundEntityD, {
    audioClipUrl: '',
  })

  function playSelectSound(ID: number) {
    switch (ID) {
      case 1: AudioSource.playSound(soundEntityA, 'assets/sounds/Blip1.wav'); break
      case 2: AudioSource.playSound(soundEntityB, 'assets/sounds/Blip2.wav'); break
      case 3: AudioSource.playSound(soundEntityC, 'assets/sounds/Blip3.wav'); break
      case 4: AudioSource.playSound(soundEntityD, 'assets/sounds/Blip4.wav'); break
    }
  }

  //
  getTriggerEvents(triggerA).on(TriggerType.ON_PLAYER_ENTERS_AREA, () => {
    SetCurrentAnswer(1)
    let lightsource = LightSource.getMutable(LightA)
    lightsource.active = true
    playSelectSound(1)
  })

  //
  getTriggerEvents(triggerB).on(TriggerType.ON_PLAYER_ENTERS_AREA, () => {
    SetCurrentAnswer(2)
    let lightsource = LightSource.getMutable(LightB)
    lightsource.active = true
    playSelectSound(2)
  })

  //
  getTriggerEvents(triggerC).on(TriggerType.ON_PLAYER_ENTERS_AREA, () => {
    SetCurrentAnswer(3)
    let lightsource = LightSource.getMutable(LightC)
    lightsource.active = true
    playSelectSound(3)
  })

  //
  getTriggerEvents(triggerD).on(TriggerType.ON_PLAYER_ENTERS_AREA, () => {
    SetCurrentAnswer(4)
    let lightsource = LightSource.getMutable(LightD)
    lightsource.active = true
    playSelectSound(4)
  })

  //
  getTriggerEvents(triggerA).on(TriggerType.ON_PLAYER_LEAVES_AREA, () => {
    let lightsource = LightSource.getMutable(LightA)
    lightsource.active = false

    let thisAnsw = GetCurrentAnswer()
    if (thisAnsw == 1) {
      SetCurrentAnswer(0)
    }
  })

  //
  getTriggerEvents(triggerB).on(TriggerType.ON_PLAYER_LEAVES_AREA, () => {
    let lightsource = LightSource.getMutable(LightB)
    lightsource.active = false

    let thisAnsw = GetCurrentAnswer()
    if (thisAnsw == 2) {
      SetCurrentAnswer(0)
    }
  })

  //
  getTriggerEvents(triggerC).on(TriggerType.ON_PLAYER_LEAVES_AREA, () => {
    let lightsource = LightSource.getMutable(LightC)
    lightsource.active = false

    let thisAnsw = GetCurrentAnswer()
    if (thisAnsw == 3) {
      SetCurrentAnswer(0)
    }
  })

  //
  getTriggerEvents(triggerD).on(TriggerType.ON_PLAYER_LEAVES_AREA, () => {
    let lightsource = LightSource.getMutable(LightD)
    lightsource.active = false

    let thisAnsw = GetCurrentAnswer()
    if (thisAnsw == 4) {
      SetCurrentAnswer(0)
    }
  })
}