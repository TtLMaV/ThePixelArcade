// src/ChangeText.ts
import { engine, Transform, TextShape, Entity, TransformType, Schemas } from '@dcl/sdk/ecs'
import { Vector3 } from '@dcl/sdk/math'

export const MainSignTag = engine.defineComponent('MainSignTagComponent', {
  id: Schemas.String // You can store data here, like a sign name
})

export class ChangeText {

  //
  constructor(
    public src: string,     // DO NOT REMOVE
    public entity: Entity,   // DO NOT REMOVE
    
  ) {}

  //
  public updateText(newText: string) {
    // Because the entity is part of this class instance, we just grab it directly
    const textShape = TextShape.getMutable(this.entity)
    textShape.text = newText
  }
}