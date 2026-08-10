
import { engine, Entity, Transform} from '@dcl/sdk/ecs'
import {Quaternion} from '@dcl/sdk/math'
import { GetCurrentState } from '../../../src/index'

export class TimerSpin {
  constructor(
    public src: string,     // DO NOT REMOVE
    public entity: Entity,   // DO NOT REMOVE
    public travelTime: number,
    private curTime: number,
  ) {}
  
  start() {
    this.curTime = 0
  }
  
  update(dt: number) {
  // Called every frame
  const myEntity = this.entity
  const mutableTransform = Transform.getMutable(myEntity)

  this.curTime -= dt
  const elapsed = this.curTime % this.travelTime
  
  // Calculate degrees (0 to 360)
  const angleInDegrees = (elapsed / this.travelTime) * 360

  // 1. Create the local Z-axis spin rotation in degrees
  const spinRotation = Quaternion.fromEulerDegrees(0, 0, angleInDegrees)

  // 2. Define your base rotation (e.g., if you rotated the object on the Y axis by 90 degrees)
  const baseRotation = Quaternion.fromEulerDegrees(0, 217.50, 0)

  // 3. Multiply: Base * Spin rotates along the local Z-axis
  mutableTransform.rotation = Quaternion.multiply(baseRotation, spinRotation)

  mutableTransform.position.z = GetCurrentState() == 'question' || GetCurrentState() == 'genre' ? -4.48 : -5
  }
}
