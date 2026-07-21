
import { engine, Entity, Transform} from '@dcl/sdk/ecs'
import {} from '@dcl/sdk/math'
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

    // 
    this.curTime -= dt
    var elapsed = this.curTime % this.travelTime
    var angle = (elapsed / this.travelTime) * Math.PI * 2
    mutableTransform.rotation.z = Math.cos(angle)
    mutableTransform.rotation.w = Math.sin(angle)

    mutableTransform.position.z = GetCurrentState() == 'question' ? -4.75 : -5
  }
}
