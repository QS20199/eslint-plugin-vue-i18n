/**
 * @author kazuya kawaguchi (a.k.a. kazupon)
 */
import { parse, AST as VAST } from 'vue-eslint-parser'
import type { AST as JSONAST } from 'jsonc-eslint-parser'
import { parseJSON, getStaticJSONValue } from 'jsonc-eslint-parser'
import type { StaticLiteral } from '../utils/index'
import { isParent$tCall, isTemplateLiteral } from '../utils/index'
import {
  getStaticLiteralValue,
  isStaticLiteral,
  defineTemplateBodyVisitor,
  getLocaleMessages,
  getStaticAttributes,
  getVueObjectType,
  isI18nBlock,
  isVElement
} from '../utils/index'
import type {
  JSXText,
  RuleContext,
  RuleFixer,
  Variable,
  RuleListener,
  Fix,
  I18nLocaleMessageDictionary,
  Range,
  JSXElement
} from '../types'
import { isKebabCase, pascalCase } from '../utils/casing'
import { createRule } from '../utils/rule'
import { toRegExp } from '../utils/regexp'

type LiteralValue = VAST.ESLintLiteral['value']
type TemplateOptionValueNode = StaticLiteral
type NodeScope = 'template' | 'template-option' | 'jsx'
type TargetAttrs = { name: RegExp; attrs: Set<string> }
type Config = {
  attributes: TargetAttrs[]
  ignorePattern: RegExp
  ignoreNodes: string[]
  ignoreText: string[]

  // 配置对于复杂文本节点(同时包含{{xxx}}和子html元素的节点), 是否要启用自动修复
  // 这一类节点如果自动修复为i18n节点后, 可能会过于冗长
  // 建议是先关闭该选项, 然后人工对复杂节点进行一轮优化(如对某些文字用span包裹)后, 再启用自动修复
  allowFixComplicatedTextElement: boolean
}
type Quotes = Set<'"' | "'" | '`'>
function getFixQuote(quotes: Quotes, code: string) {
  if (!code.includes('\n')) {
    for (const q of ["'", '"'] as const) {
      if (!quotes.has(q) && !code.includes(q)) {
        return q
      }
    }
  }
  if (!quotes.has('`') && !code.includes('`')) {
    return '`'
  }
  return null
}
const hasOnlyWhitespace = (value: string) => /^[\r\n\s\t\f\v]+$/.test(value)
const INNER_START_OFFSET = '<template>'.length

/**
 * Get the attribute to be verified from the element name.
 */
function getTargetAttrs(tagName: string, config: Config): Set<string> {
  const result = []
  for (const { name, attrs } of config.attributes) {
    name.lastIndex = 0
    if (name.test(tagName)) {
      result.push(...attrs)
    }
  }
  if (isKebabCase(tagName)) {
    result.push(...getTargetAttrs(pascalCase(tagName), config))
  }

  return new Set(result)
}

function calculateRange(
  node:
    | StaticLiteral
    | VAST.VText
    | JSXText
    | VAST.VLiteral
    | VAST.VIdentifier
    | VAST.VDirectiveKey
    | VAST.VElement,
  base: TemplateOptionValueNode | null
): Range {
  const range = node.range
  if (!base) {
    return range
  }
  const offset = base.range[0] + 1 /* quote */ - INNER_START_OFFSET
  return [offset + range[0], offset + range[1]]
}
function calculateLoc(
  node: StaticLiteral | VAST.VText | JSXText | VAST.VLiteral | VAST.VElement,
  base: TemplateOptionValueNode | null,
  context: RuleContext
) {
  if (!base) {
    return node.loc
  }
  const range = calculateRange(node, base)
  return {
    start: context.getSourceCode().getLocFromIndex(range[0]),
    end: context.getSourceCode().getLocFromIndex(range[1])
  }
}

function testValue(value: LiteralValue, config: Config): boolean {
  if (typeof value === 'string') {
    return (
      value === '' ||
      hasOnlyWhitespace(value) ||
      config.ignorePattern.test(value.trim()) ||
      config.ignoreText.includes(value.trim())
    )
  } else {
    return true
  }
}

// parent is directive (e.g <p v-xxx="..."></p>)
function checkVAttributeDirective(
  context: RuleContext,
  node: VAST.VExpressionContainer & {
    parent: VAST.VDirective
  },
  config: Config,
  baseNode: TemplateOptionValueNode | null,
  scope: NodeScope
) {
  const attrNode = node.parent
  if (attrNode.key && attrNode.key.type === 'VDirectiveKey') {
    if (
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore -- for vue-eslint-parser v5
      (attrNode.key.name === 'text' ||
        // for vue-eslint-parser v6+
        attrNode.key.name.name === 'text') &&
      node.expression
    ) {
      checkExpressionContainerText(
        context,
        node.expression,
        config,
        baseNode,
        scope
      )
    }

    if (
      node.expression &&
      attrNode.key.name.name === 'bind' &&
      attrNode.key.argument?.type === 'VIdentifier' &&
      getTargetAttrs(attrNode.parent.parent.rawName, config).has(
        attrNode.key.argument.name
      )
    ) {
      checkVAttribute(context, attrNode, config, baseNode, scope)
    }
  }
}

function checkVExpressionContainer(
  context: RuleContext,
  node: VAST.VExpressionContainer,
  config: Config,
  baseNode: TemplateOptionValueNode | null,
  scope: NodeScope
) {
  if (!node.expression) {
    return
  }

  if (node.parent && node.parent.type === 'VElement') {
    // parent is element (e.g. <p>{{ ... }}</p>)
    checkExpressionContainerText(
      context,
      node.expression,
      config,
      baseNode,
      scope
    )
  } else if (
    node.parent &&
    node.parent.type === 'VAttribute' &&
    node.parent.directive
  ) {
    checkVAttributeDirective(
      context,
      node as VAST.VExpressionContainer & {
        parent: VAST.VDirective
      },
      config,
      baseNode,
      scope
    )
  }
}
function checkExpressionContainerText(
  context: RuleContext,
  expression: Exclude<VAST.VExpressionContainer['expression'], null>,
  config: Config,
  baseNode: TemplateOptionValueNode | null,
  scope: NodeScope
) {
  VAST.traverseNodes(expression, {
    enterNode(node) {
      if (isStaticLiteral(node)) {
        checkLiteral(context, node, config, baseNode, scope)
      }
    },
    leaveNode(node, parent) {}
  })
}

function checkLiteral(
  context: RuleContext,
  literal: StaticLiteral,
  config: Config,
  baseNode: TemplateOptionValueNode | null,
  scope: NodeScope
) {
  if (isParent$tCall(literal)) {
    return
  }

  if (
    literal.parent &&
    ['Property', 'ImportDeclaration'].includes(literal.parent.type)
  ) {
    return
  }

  const value = getStaticLiteralValue(literal)

  if (testValue(value, config)) {
    return
  }
  const valueStr = String(value).trim()

  const loc = calculateLoc(literal, baseNode, context)
  context.report({
    loc,
    message: `raw text '${valueStr}' is used`,
    fix: fixer => {
      if (scope === 'template-option') {
        if (!withoutEscape(context, baseNode)) {
          return null
        }
      } else if (scope !== 'template') {
        return null
      }
      const replaceRange = calculateRange(literal, baseNode)

      return fixer.replaceTextRange(replaceRange, `$t('${valueStr}')`)
    }
  })
}

// check attribute like <p label="xx"></p> or <p :label="'xx' + var1"></p>
function checkVAttribute(
  context: RuleContext,
  attribute: VAST.VAttribute | VAST.VDirective,
  config: Config,
  baseNode: TemplateOptionValueNode | null,
  scope: NodeScope
) {
  VAST.traverseNodes(attribute, {
    enterNode(node) {
      if (isStaticLiteral(node) || isTemplateLiteral(node)) {
        const literal = node
        // check if it's $t call
        if (isParent$tCall(literal)) {
          return
        }

        const value = isStaticLiteral(literal)
          ? getStaticLiteralValue(literal)
          : getTemplateLiteralValueAndInterpolation(context, literal).value
        if (testValue(value, config)) {
          return
        }
        const valueStr = String(value).trim()

        const loc = calculateLoc(literal, baseNode, context)
        context.report({
          loc,
          message: `raw text '${valueStr}' is used`,
          fix: fixer => {
            if (scope === 'template-option') {
              if (!withoutEscape(context, baseNode)) {
                return null
              }
            } else if (scope !== 'template') {
              return null
            }
            const literalRange = calculateRange(literal, baseNode)
            const contentRange = [
              literalRange[0] + 1,
              literalRange[1] - 1
            ] as Range
            const keyRange = calculateRange(attribute.key, baseNode)

            if (attribute.directive) {
              if (isStaticLiteral(literal)) {
                return [
                  fixer.replaceTextRange(literalRange, `$t(\`${valueStr}\`)`)
                ]
              } else {
                // templateLiteral
                const { interpolation } =
                  getTemplateLiteralValueAndInterpolation(context, literal)
                return [
                  fixer.replaceTextRange(
                    literalRange,
                    interpolation
                      ? `$t(\`${valueStr}\`, ${interpolation})`
                      : `$t(\`${valueStr}\`)`
                  )
                ]
              }
            } else {
              return [
                fixer.insertTextBeforeRange(keyRange, ':'),
                fixer.replaceTextRange(contentRange, `$t(\`${valueStr}\`)`)
              ]
            }
          }
        })
      }
    },
    leaveNode() {
      // noop
    }
  })
}

function checkText(
  context: RuleContext,
  textNode: VAST.VText | JSXText,
  config: Config,
  baseNode: TemplateOptionValueNode | null,
  scope: NodeScope
) {
  const value = textNode.value.trim()
  if (testValue(value, config)) {
    return
  }

  const loc = calculateLoc(textNode, baseNode, context)
  context.report({
    loc,
    message: `raw text '${value}' is used`,
    fix: fixer => {
      if (scope === 'template-option') {
        if (!withoutEscape(context, baseNode)) {
          return null
        }
      }
      const replaceRange = calculateRange(textNode, baseNode)

      const before = `${scope === 'jsx' ? '{' : '{{'} $t(\``
      const after = `\`) ${scope === 'jsx' ? '}' : '}}'}`
      return fixer.replaceTextRange(replaceRange, before + value + after)
    }
  })
}

function checkComplicatedTextElement(
  context: RuleContext,
  node: VAST.VElement | JSXElement,
  config: Config,
  baseNode: TemplateOptionValueNode | null,
  scope: NodeScope
) {
  if (
    node.children.some(
      v =>
        (v.type === 'JSXText' || v.type === 'VText') &&
        !testValue(v.value, config)
    ) === false
  ) {
    return
  }

  let slotIdx = 0
  const hasSubElement = node.children.some(
    subNode => subNode.type === 'VElement' || subNode.type === 'JSXElement'
  )
  const interpolationValues: string[] = []
  const interpolationElements: string[] = []
  const nodeDesc = node.children
    .map((subNode, nodeIdx) => {
      if (subNode.type === 'JSXText' || subNode.type === 'VText') {
        let nodeValue = subNode.value
        // 模拟html空格类字符表现: 多于1个字符的空格, 始终表现为1个空格, 首尾除外
        if (nodeIdx === 0) {
          nodeValue = nodeValue.replace(/^\s*/, '')
        } else {
          nodeValue = nodeValue.replace(/^\s{2,}/, ' ')
        }
        if (nodeIdx === node.children.length - 1) {
          nodeValue = nodeValue.replace(/\s*$/, '')
        } else {
          nodeValue = nodeValue.replace(/\s{2,}$/, ' ')
        }
        return nodeValue
      }

      if (subNode.type === 'VElement' || subNode.type === 'JSXElement') {
        const key = `slot${slotIdx++}`
        interpolationElements.push(
          // 给子组件添加slot属性
          `${context
            .getSourceCode()
            .getText(subNode)
            .replace(/^(\S+?)(\s|>)/, `$1 slot="${key}"$2`)}`
        )
        return `%{${key}}`
      }
      if (
        (subNode.type === 'VExpressionContainer' ||
          subNode.type === 'JSXExpressionContainer') &&
        subNode.expression
      ) {
        const key = `slot${slotIdx++}`
        if (hasSubElement) {
          if (config.allowFixComplicatedTextElement) {
            interpolationElements.push(
              `<template slot="${key}">${context
                .getSourceCode()
                .getText(subNode)}</template>`
            )
          }
        } else {
          interpolationValues.push(
            `${key}: ${context.getSourceCode().getText(subNode.expression)}`
          )
        }
        return `%{${key}}`
      }
    })
    .join('')

  const subNodesRange: Range = [
    node.children[0].range[0],
    node.children[node.children.length - 1].range[1]
  ]
  const subNodesLoc: VAST.LocationRange = {
    start: context.getSourceCode().getLocFromIndex(subNodesRange[0]),
    end: context.getSourceCode().getLocFromIndex(subNodesRange[1])
  }

  context.report({
    loc: hasSubElement ? node.loc : subNodesLoc,
    message: `raw text '${nodeDesc}' is used`,
    fix: fixer => {
      if (scope === 'template-option') {
        if (!withoutEscape(context, baseNode)) {
          return null
        }
      }
      if (!hasSubElement) {
        // 没有子组件的场景, 转换为$t('...', {slot0: '...'})
        const interpolationStr = `{ ${interpolationValues.join(', ')} }`
        const before = scope === 'jsx' ? '{' : '{{'
        const after = scope === 'jsx' ? '}' : '}}'
        const result = `${before} $t(\`${nodeDesc}\`, ${interpolationStr}) ${after}`
        return fixer.replaceTextRange(subNodesRange, result)
      } else {
        // 有子组件的场景, 并且配置允许, 则转换为i18n块
        if (!config.allowFixComplicatedTextElement) return null
        const tagName =
          node.type === 'JSXElement' ? node.openingElement.name.name : node.name
        const result = [
          `<i18n path="${nodeDesc}" tag="${tagName}">`,
          ...interpolationElements,
          `</i18n>`
        ].join('')
        return fixer.replaceTextRange(node.range, result)
      }
    }
  })
}

function findVariable(variables: Variable[], name: string) {
  return variables.find(variable => variable.name === name)
}

function getComponentTemplateValueNode(
  context: RuleContext,
  node: VAST.ESLintObjectExpression
): TemplateOptionValueNode | null {
  const templateNode = node.properties.find(
    (p): p is VAST.ESLintProperty =>
      p.type === 'Property' &&
      p.key.type === 'Identifier' &&
      p.key.name === 'template'
  )

  if (templateNode) {
    if (isStaticLiteral(templateNode.value)) {
      return templateNode.value
    } else if (templateNode.value.type === 'Identifier') {
      const templateVariable = findVariable(
        context.getScope().variables,
        templateNode.value.name
      )
      if (templateVariable) {
        const varDeclNode = templateVariable.defs[0]
          .node as VAST.ESLintVariableDeclarator
        if (varDeclNode.init) {
          if (isStaticLiteral(varDeclNode.init)) {
            return varDeclNode.init
          }
        }
      }
    }
  }

  return null
}

function getComponentTemplateNode(node: TemplateOptionValueNode) {
  return parse(`<template>${getStaticLiteralValue(node)}</template>`, {})
    .templateBody!
}

function withoutEscape(
  context: RuleContext,
  baseNode: TemplateOptionValueNode | null
) {
  if (!baseNode) {
    return false
  }
  const sourceText = context.getSourceCode().getText(baseNode).slice(1, -1)
  const templateText = `${getStaticLiteralValue(baseNode)}`
  return sourceText === templateText
}

type I18nBlockInfo = {
  attrs: { [name: string]: string | undefined }
  i18n: VAST.VElement
  offsets: {
    getLoc: (index: number) => { line: number; column: number }
    getIndex: (index: number) => number
  }
  objects: JSONAST.JSONObjectExpression[]
}

// 分析总结:
// 有i18n块, 有相同value, 返回null
// 有i18n块, 无相同value, 返回[{...}]
// 没有i18n块, 返回[]
function getFixableI18nBlocks(
  context: RuleContext,
  newKey: string
): I18nBlockInfo[] | null {
  const df = context.parserServices.getDocumentFragment?.()
  if (!df) {
    return null
  }
  const i18nBlocks: I18nBlockInfo[] = []
  for (const i18n of df.children.filter(isI18nBlock)) {
    const attrs = getStaticAttributes(i18n)
    if (
      attrs.src != null ||
      (attrs.lang != null && attrs.lang !== 'json' && attrs.lang !== 'json5') // Do not support yaml
    ) {
      return null
    }
    const textNode = i18n.children[0]
    const sourceString =
      textNode != null && textNode.type === 'VText' && textNode.value
    if (!sourceString) {
      return null
    }
    try {
      const ast = parseJSON(sourceString)
      const root = ast.body[0].expression
      if (root.type !== 'JSONObjectExpression') {
        // Maybe invalid messages
        return null
      }
      const objects: JSONAST.JSONObjectExpression[] = []
      if (attrs.locale) {
        objects.push(root)
      } else {
        for (const prop of root.properties) {
          if (prop.value.type !== 'JSONObjectExpression') {
            // Maybe invalid messages
            return null
          }
          objects.push(prop.value)
        }
      }

      // check for new key
      // If there are duplicate keys, the addition will be stopped.
      for (const objNode of objects) {
        if (
          objNode.properties.some(prop => {
            const keyValue = `${getStaticJSONValue(prop.key)}`
            return keyValue === newKey
          })
        ) {
          return null
        }
      }

      const offset = textNode.range[0]

      const getIndex = (index: number): number => offset + index
      i18nBlocks.push({
        attrs,
        i18n,
        objects,
        offsets: {
          getLoc: (index: number) => {
            return context.getSourceCode().getLocFromIndex(getIndex(index))
          },
          getIndex
        }
      })
    } catch {
      return null
    }
  }

  return i18nBlocks
}

function* generateFixAddI18nBlock(
  context: RuleContext,
  fixer: RuleFixer,
  i18nBlocks: I18nBlockInfo[],
  resource: string,
  replaceFixes: Fix[]
): IterableIterator<Fix> {
  const text = JSON.stringify(resource)
  const df = context.parserServices.getDocumentFragment!()!
  const tokenStore = context.parserServices.getTemplateBodyTokenStore()

  if (!i18nBlocks.length) {
    let baseToken: VAST.VElement | VAST.Token = df.children.find(isVElement)!
    let beforeToken = tokenStore.getTokenBefore(baseToken, {
      includeComments: true
    })
    while (beforeToken && beforeToken.type === 'HTMLComment') {
      baseToken = beforeToken
      beforeToken = tokenStore.getTokenBefore(beforeToken, {
        includeComments: true
      })
    }
    yield fixer.insertTextBeforeRange(
      baseToken.range,
      `<i18n>\n{\n  "en": {\n    ${text}: ${text}\n  }\n}\n</i18n>\n\n`
    )
    yield* replaceFixes

    return
  }
  const replaceFix = replaceFixes[0]

  const after = i18nBlocks.find(e => replaceFix.range[1] < e.i18n.range[0])
  for (const { i18n, offsets, objects } of i18nBlocks) {
    if (after && after.i18n === i18n) {
      yield* replaceFixes
    }
    for (const objectNode of objects) {
      const first = objectNode.properties[0]

      let indent =
        /^\s*/.exec(
          context.getSourceCode().lines[
            offsets.getLoc(objectNode.range[0]).line - 1
          ]
        )![0] + '  '
      let next = ''
      if (first) {
        if (objectNode.loc.start.line === first.loc.start.line) {
          next = ',\n' + indent
        } else {
          indent = /^\s*/.exec(
            context.getSourceCode().lines[
              offsets.getLoc(first.range[0]).line - 1
            ]
          )![0]
          next = ','
        }
      }

      yield fixer.insertTextAfterRange(
        [
          offsets.getIndex(objectNode.range[0]),
          offsets.getIndex(objectNode.range[0] + 1)
        ],
        `\n${indent}${text}: ${text}${next}`
      )
    }
  }

  if (after == null) {
    yield* replaceFixes
  }
}

function extractMessageKeys(
  context: RuleContext,
  targetValue: string
): string[] {
  const keys = new Set<string>()
  const localeMessages = getLocaleMessages(context, {
    ignoreMissingSettingsError: true
  })
  for (const localeMessage of localeMessages.localeMessages) {
    for (const locale of localeMessage.locales) {
      const messages = localeMessage.getMessagesFromLocale(locale)
      for (const key of extractMessageKeysFromObject(messages, [])) {
        keys.add(key)
      }
    }
  }
  return [...keys].sort()

  function* extractMessageKeysFromObject(
    messages: I18nLocaleMessageDictionary,
    paths: string[]
  ): Iterable<string> {
    for (const key of Object.keys(messages)) {
      const value = messages[key]
      if (value == null) {
        continue
      }
      if (typeof value !== 'object') {
        if (targetValue === value) {
          yield [...paths, key].join('.')
        }
      } else {
        yield* extractMessageKeysFromObject(value, [...paths, key])
      }
    }
  }
}

/**
 * Parse attributes option
 */
function parseTargetAttrs(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  options: any
) {
  const regexps: TargetAttrs[] = []
  for (const tagName of Object.keys(options)) {
    const attrs: Set<string> = new Set(options[tagName])
    regexps.push({
      name: toRegExp(tagName),
      attrs
    })
  }
  return regexps
}

/**
 * `测试${var1}测试` -> $t(`测试%{slot0}测试`, {slot0: var1})
 */
function getTemplateLiteralValueAndInterpolation(
  context: RuleContext,
  node: VAST.ESLintTemplateLiteral
): {
  value: VAST.ESLintLiteral['value']
  interpolation: string | null
} {
  const items = [...node.expressions, ...node.quasis].sort(
    (n1, n2) => n1.range[0] - n2.range[0]
  )
  let idx = 0
  const interpolation: string[] = []
  const value = items
    .map(item => {
      if (item.type === 'TemplateElement') {
        return item.value.raw
      } else {
        const key = `slot${idx++}`
        interpolation.push(`${key}: ${context.getSourceCode().getText(item)}`)
        return `%{${key}}`
      }
    })
    .join('')

  return {
    value,
    interpolation: interpolation.length
      ? `{ ${interpolation.join(', ')} }`
      : null
  }
}

function create(context: RuleContext): RuleListener {
  const options = context.options[0] || {}

  const config: Config = {
    attributes: [],
    ignorePattern: /^([^\u4e00-\u9fa5])+$/, // 排除不是中文的字符
    ignoreNodes: [],
    ignoreText: [],
    allowFixComplicatedTextElement: false
  }

  if (options.ignorePattern) {
    config.ignorePattern = new RegExp(options.ignorePattern, 'u')
  }

  if (options.ignoreNodes) {
    config.ignoreNodes = options.ignoreNodes
  }

  if (options.ignoreText) {
    config.ignoreText = options.ignoreText
  }
  if (options.attributes) {
    config.attributes = parseTargetAttrs(options.attributes)
  }
  if (options.allowFixComplicatedTextElement) {
    config.allowFixComplicatedTextElement = true
  }

  const templateVisitor = {
    // :attr="xxx" or <div>{{...}}</div>
    VExpressionContainer(
      node: VAST.VExpressionContainer,
      baseNode: TemplateOptionValueNode | null = null,
      scope: NodeScope = 'template'
    ) {
      checkVExpressionContainer(context, node, config, baseNode, scope)
    },

    // attr="xxx"
    VAttribute(
      node: VAST.VAttribute,
      baseNode: TemplateOptionValueNode | null = null,
      scope: NodeScope = 'template'
    ) {
      if (node.directive) {
        return
      }
      const tagName = node.parent.parent.rawName
      const attrName = node.key.name
      if (!getTargetAttrs(tagName, config).has(attrName)) {
        return
      }

      checkVAttribute(context, node, config, baseNode, scope)
    },

    VElement(
      node: VAST.VElement,
      baseNode: TemplateOptionValueNode | null = null,
      scope: NodeScope = 'template'
    ) {
      if (!node.children.length) return

      // handle pure text element
      // e.g <div>text</div>
      if (node.children.length === 1 && node.children[0].type === 'VText') {
        if (config.ignoreNodes.includes(node.name)) {
          return
        }
        checkText(context, node.children[0], config, baseNode, scope)
      }

      if (
        node.children.length > 1 &&
        node.children.some(v => v.type === 'VText')
      ) {
        // handle pure text with <br>
        if (
          node.children.every(
            v =>
              v.type === 'VText' || (v.type === 'VElement' && v.name === 'br')
          )
        ) {
          node.children
            .filter(v => v.type === 'VText')
            .forEach(v =>
              checkText(context, v as VAST.VText, config, baseNode, scope)
            )
        } else {
          // handle text element with other element
          // e.g <div>text<span>text2</span></div>
          checkComplicatedTextElement(context, node, config, baseNode, scope)
        }
      }
    }
  }

  return defineTemplateBodyVisitor(context, templateVisitor, {
    // script block or scripts
    JSXElement(
      node: JSXElement,
      baseNode: TemplateOptionValueNode | null = null,
      scope: NodeScope = 'jsx'
    ) {
      if (!node.children.length) return

      // handle pure text element
      // e.g <div>text</div>
      if (node.children.length === 1 && node.children[0].type === 'JSXText') {
        if (config.ignoreNodes.includes(node.openingElement.name.name)) {
          return
        }
        checkText(context, node.children[0], config, baseNode, scope)
      }

      // handle text element with other element
      // e.g <div>text<span>text2</span></div>
      if (
        node.children.length > 1 &&
        node.children.some(v => v.type === 'JSXText')
      ) {
        checkComplicatedTextElement(context, node, config, baseNode, scope)
      }
    },
    Literal(node: VAST.ESLintLiteral) {
      if (isParent$tCall(node)) {
        return
      }

      if (
        node.parent &&
        ['Property', 'ImportDeclaration'].includes(node.parent.type)
      ) {
        return
      }

      const value = getStaticLiteralValue(node)
      if (testValue(value, config)) {
        return
      }
      const valueStr = String(value).trim()

      const loc = calculateLoc(node, null, context)
      context.report({
        loc,
        message: `raw text '${valueStr}' is used`,
        fix: fixer => {
          const literalRange = calculateRange(node, null)
          const contentRange = [literalRange[0], literalRange[1]] as Range
          return [fixer.replaceTextRange(contentRange, `$t(\`${valueStr}\`)`)]
        }
      })
    },
    TemplateLiteral(node: VAST.ESLintTemplateLiteral) {
      if (isParent$tCall(node)) {
        return
      }

      if (node.parent && node.parent.type === 'Property') {
        return
      }

      const value = getTemplateLiteralValueAndInterpolation(context, node).value
      if (testValue(value, config)) {
        return
      }
      const valueStr = String(value).trim()

      const loc = calculateLoc(node, null, context)
      context.report({
        loc,
        message: `raw text '${valueStr}' is used`,
        fix: fixer => {
          const literalRange = calculateRange(node, null)
          const { interpolation } = getTemplateLiteralValueAndInterpolation(
            context,
            node
          )
          return [
            fixer.replaceTextRange(
              literalRange,
              interpolation
                ? `$t(\`${valueStr}\`, ${interpolation})`
                : `$t(\`${valueStr}\`)`
            )
          ]
        }
      })
    }
  })
}

export = createRule({
  meta: {
    type: 'suggestion',
    docs: {
      description: 'disallow to string literal in template or JSX',
      category: 'Recommended',
      url: 'https://eslint-plugin-vue-i18n.intlify.dev/rules/no-raw-text.html',
      recommended: true
    },
    fixable: 'code',
    hasSuggestions: true,
    schema: [
      {
        type: 'object',
        properties: {
          attributes: {
            type: 'object',
            patternProperties: {
              '^(?:\\S+|/.*/[a-z]*)$': {
                type: 'array',
                items: { type: 'string' },
                uniqueItems: true
              }
            },
            additionalProperties: false
          },
          ignoreNodes: {
            type: 'array'
          },
          ignorePattern: {
            type: 'string'
          },
          ignoreText: {
            type: 'array'
          }
        }
      }
    ]
  },
  create
})
