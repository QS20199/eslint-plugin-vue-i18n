import type { MaybeNode } from './eslint'

export interface JSXText extends MaybeNode {
  type: 'JSXText'
  value: string
  raw: string
  parent: MaybeNode
}

export interface JSXElement extends MaybeNode {
  type: 'JSXElement'
  value: string
  parent: MaybeNode
  children: (JSXText | JSXElement)[]
  openingElement: {
    name: {
      name: string
    }
  }
}
