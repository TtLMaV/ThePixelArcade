
import { engine, Entity, Transform} from '@dcl/sdk/ecs'
import {} from '@dcl/sdk/math'

export class NewScript {
  /**
   * Properties
   * Define class fields you want to reuse across methods.
   * Example usage: this.myVariable
   */
   // private myVariable: boolean = true

  /**
   * Constructor / Inputs
   * Parameters declared here appear in the Script component UI in Creator Hub.
   * Supported types: Entity, String, Number, Boolean, ActionCallback.
   *
   * Note: After editing this file, click the refresh icon in the Script component UI
   * to see updated inputs.
   *
   * The `src` and `entity` fields in the constructor are required by internal references.
   */
  constructor(
    public src: string,     // DO NOT REMOVE
    public entity: Entity,   // DO NOT REMOVE
    // Add your custom inputs below
    public centreX: number,
    public centreZ: number,
    public radius: number,
    public travelTime: number,
    private curTime: number,
  ) {}

  /**
   * start()
   * Called once when the script is initialized.
   */
  start() {
    // Script initialization
    //console.log("NewScript initialized for entity:", this.entity);

    //
    this.curTime = 0
  }

  /**
   * update(dt)
   * Called every frame.
   * @param dt - (optional) Delta time since last frame (in seconds)
   */
  update(dt: number) {
    // Called every frame
    const myEntity = this.entity

    //
    const mutableTransform = Transform.getMutable(myEntity)

    // 
    this.curTime += dt
    var elapsed = this.curTime % this.travelTime
    var angle = (elapsed / this.travelTime) * Math.PI * 2
    mutableTransform.position.x = this.centreX + Math.cos(angle) * this.radius
    mutableTransform.position.z = this.centreZ + Math.sin(angle) * this.radius
  }
}
