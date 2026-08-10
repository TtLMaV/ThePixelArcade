import { engine, Entity, Transform} from '@dcl/sdk/ecs'
import { Quaternion, Scalar } from '@dcl/sdk/math'
import { GetCurrentState } from '../../../src/index'

export class RotateCamera {
  constructor(
    public src: string,     // DO NOT REMOVE
    public entity: Entity,   // DO NOT REMOVE
    public travelTime: number,
    private curTime: number,
    private minYAngle: number,
    private maxYAngle: number,
  ) {}
  
  update(dt: number) {
    // Called every frame
    const myEntity = this.entity
    const mutableTransform = Transform.getMutable(myEntity)

    // 
    this.curTime -= dt
    var elapsed = (this.curTime % this.travelTime) / this.travelTime
    var angle = Scalar.lerp(this.minYAngle, this.maxYAngle, (1 + Math.cos(elapsed * Math.PI * 2)) / 2)
    mutableTransform.rotation = Quaternion.fromEulerDegrees(0, angle, 340)
  }
}
