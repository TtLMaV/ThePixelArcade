
import { engine, Entity, TextShape } from '@dcl/sdk/ecs'
import {} from '@dcl/sdk/math'

export class DrawText {
  /**
   * Properties
   * Define class fields you want to reuse across methods.
   * Example usage: this.myVariable
   */
   // private myVariable: boolean = true

   private OneSecTimer: number = 0
   private TextString: string = ''

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
    
  ) {}

  /**
   * start()
   * Called once when the script is initialized.
   */
  start() {
    // Script initialization
    //console.log("DrawText initialized for entity:", this.entity);
  }

  /**
   * update(dt)
   * Called every frame.
   * @param dt - (optional) Delta time since last frame (in seconds)
   */
  update(dt: number) {
    // Called every frame
    const mutableText = TextShape.getMutable(this.entity)
    mutableText.text = this.TextString
    this.OneSecTimer += dt
    if(this.OneSecTimer > 0.3)
    {
      this.OneSecTimer = 0
      this.TextString += '.'
      if(this.TextString.length > 3)
      {
        this.TextString = '.'
      }
    }
  }
}
