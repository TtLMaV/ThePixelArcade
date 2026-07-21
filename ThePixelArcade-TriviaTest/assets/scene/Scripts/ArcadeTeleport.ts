import { engine } from '@dcl/sdk/ecs'
import { getTriggerEvents } from '@dcl/asset-packs/dist/events'
import { TriggerType } from '@dcl/asset-packs'
import { movePlayerTo } from '~system/RestrictedActions'
import { Vector3 } from '@dcl/sdk/math'
import { UpdateText, UpdateShowUI} from '../../../src/ui'

// TeleportPositionSettings
const teleportPosition_1 = Vector3.create(0, 1, 7.5)
const TeleportCameraTarget_1 = Vector3.create(0, 1, 6.5)
const teleportPosition_2 = Vector3.create(-5, 1, 60)
const TeleportCameraTarget_2 = Vector3.create(-4, 1, 60)
const TeleportCountdown = 5
let teleportID = 0

let isCountingDown = false
let timeRemaining = 0

export function main() {

    // Teleporter 1
    const trigger1 = engine.getEntityOrNullByName('Trigger_Arcade1')
    if (!trigger1) {
        console.log('Trigger_Arcade1 not found, check the name in the entity tree')
        return
    }
    getTriggerEvents(trigger1).on(TriggerType.ON_PLAYER_ENTERS_AREA, () => {
        teleportID = 1
        startCountdown()
    })
    getTriggerEvents(trigger1).on(TriggerType.ON_PLAYER_LEAVES_AREA, () => {
        teleportID = 0
        cancelCountdown()
    })

    // Teleporter 2
    const trigger2 = engine.getEntityOrNullByName('Trigger_Arcade1_Rtrn')
    if (!trigger2) {
        console.log('Trigger_Arcade1_Rtrn not found, check the name in the entity tree')
        return
    }
    getTriggerEvents(trigger2).on(TriggerType.ON_PLAYER_ENTERS_AREA, () => {
        teleportID = 2
        startCountdown()
    })
    getTriggerEvents(trigger2).on(TriggerType.ON_PLAYER_LEAVES_AREA, () => {
        teleportID = 0
        cancelCountdown()
    })

    // Ticks the countdown every frame
    engine.addSystem((dt: number) => {
        if (!isCountingDown) return   
        timeRemaining -= dt   
        // Log the whole-second mark so you can see the countdown in the console.
        const secondsLeft = Math.ceil(timeRemaining)
        if (secondsLeft !== lastLoggedSecond && secondsLeft >= 0) {
            lastLoggedSecond = secondsLeft
            UpdateShowUI(true)
            if(teleportID == 1) {UpdateText("Teleporting To Trivia: ", secondsLeft)}
            if(teleportID == 2) {UpdateText("Teleporting To Hub: ", secondsLeft)}
            //console.log(`Teleporting in ${secondsLeft}...`)
        } 
        if (timeRemaining <= 0) {
            isCountingDown = false
            teleportPlayer()
        }
    })
}

let lastLoggedSecond = -1

function startCountdown() {
    if (isCountingDown) return // already running, ignore re-triggers

    isCountingDown = true
    timeRemaining = TeleportCountdown
    lastLoggedSecond = -1

    UpdateShowUI(true)
    if(teleportID == 1) {UpdateText("Teleporting To Trivia: ", TeleportCountdown)}
    if(teleportID == 2) {UpdateText("Teleporting To Hub: ", TeleportCountdown)}
    //console.log(`Teleporting in ${COUNTDOWN_SECONDS}...`)
}

function cancelCountdown() {
    if (!isCountingDown) return

    isCountingDown = false
    UpdateShowUI(false)
    //console.log('Teleport cancelled, player left the trigger area')
}

async function teleportPlayer() {
    //console.log('Teleporting now!')
    UpdateShowUI(false)
    if(teleportID == 1)
    {
        await movePlayerTo({
            newRelativePosition: teleportPosition_1,
            cameraTarget: TeleportCameraTarget_1,
        })
    }
    if(teleportID == 2)
    {
        await movePlayerTo({
            newRelativePosition: teleportPosition_2,
            cameraTarget: TeleportCameraTarget_2,
        })
    }
}