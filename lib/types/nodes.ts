import { VStartTag } from 'vue-eslint-parser/ast'
import { MaybeNode } from './eslint'

export interface JSXText extends MaybeNode {
  type: 'JSXText'
  value: string
  raw: string
  parent: MaybeNode
}

export interface JSXExpressionContainer extends MaybeNode {
  type: 'JSXExpressionContainer'
  expression: MaybeNode
  parent: MaybeNode
}

export interface JSXElement extends MaybeNode {
  type: 'JSXElement'
  value: string
  parent: MaybeNode
  children: (JSXText | JSXElement | JSXExpressionContainer)[]
  openingElement: {
    name: {
      name: string
    }
  }
  startTag: VStartTag
}
