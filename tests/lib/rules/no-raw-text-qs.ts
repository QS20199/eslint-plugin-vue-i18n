/**
 * @author kazuya kawaguchi (a.k.a. kazupon)
 */
import { RuleTester } from 'eslint'
import rule = require('../../../lib/rules/no-raw-text')

const tester = new RuleTester({
  parser: require.resolve('vue-eslint-parser'),
  parserOptions: {
    ecmaVersion: 2015,
    sourceType: 'module',
    ecmaFeatures: {
      jsx: true
    }
  }
})

tester.run('no-raw-text-qs', rule as never, {
  valid: [
    {
      code: `<template><p></p></template>`
    },
    {
      code: `<template><p :label="var1"></p></template>`,
      options: [
        {
          attributes: {
            '/.+/': ['label']
          }
        }
      ]
    },
    {
      code: `<template><p :label="$t('测试')"></p></template>`,
      options: [
        {
          attributes: {
            '/.+/': ['label']
          }
        }
      ]
    },
    {
      code: `<template><p :rules="[{message: $t('测试')}]"></p></template>`,
      options: [
        {
          attributes: {
            '/.+/': ['rules']
          }
        }
      ]
    }
  ],
  invalid: [
    {
      code: `<template><p label="测试"></p></template>`,
      options: [
        {
          attributes: {
            '/.+/': ['label']
          }
        }
      ],
      errors: [
        {
          message: `raw text '测试' is used`,
          line: 1
        }
      ],
      output: `<template><p :label="$t(\`测试\`)"></p></template>`
    },
    {
      code: `<template><p v-bind:label="'测试'"></p></template>`,
      options: [
        {
          attributes: {
            '/.+/': ['label']
          }
        }
      ],
      errors: [
        {
          message: `raw text '测试' is used`,
          line: 1
        }
      ],
      output: `<template><p v-bind:label="$t(\`测试\`)"></p></template>`
    },
    {
      code: `<template><p :label="'测试'"></p></template>`,
      options: [
        {
          attributes: {
            '/.+/': ['label']
          }
        }
      ],
      errors: [
        {
          message: `raw text '测试' is used`,
          line: 1
        }
      ],
      output: `<template><p :label="$t(\`测试\`)"></p></template>`
    },
    {
      code: `<template><p :label="'测试' + var1"></p></template>`,
      options: [
        {
          attributes: {
            '/.+/': ['label']
          }
        }
      ],
      errors: [
        {
          message: `raw text '测试' is used`,
          line: 1
        }
      ],
      output: `<template><p :label="$t(\`测试\`) + var1"></p></template>`
    },
    {
      code: `<template><p :rules="[{required: true, message: '测试'}]"></p></template>`,
      options: [
        {
          attributes: {
            '/.+/': ['rules']
          }
        }
      ],
      errors: [
        {
          message: `raw text '测试' is used`,
          line: 1
        }
      ],
      output: `<template><p :rules="[{required: true, message: $t(\`测试\`)}]"></p></template>`
    },
    {
      code: `<template><p :rules="[{required: true, message: \`测试\${var1}\${var2 + 1}测试\`}]"></p></template>`,
      options: [
        {
          attributes: {
            '/.+/': ['rules']
          }
        }
      ],
      errors: [
        {
          message: `raw text '测试%{attr0}%{attr1}测试' is used`,
          line: 1
        }
      ],
      output: `<template><p :rules="[{required: true, message: $t(\`测试%{attr0}%{attr1}测试\`, { attr0: var1, attr1: var2 + 1 })}]"></p></template>`
    },
    {
      code: `<template><p>测试</p></template>`,
      errors: [
        {
          message: `raw text '测试' is used`,
          line: 1
        }
      ],
      output: `<template><p>{{ $t(\`测试\`) }}</p></template>`
    },
    {
      code: `<template><div>{{ true ? '测试1' : true ? '测试2' : '测试3' }}</div></template>`,
      errors: [
        {
          message: `raw text '测试1' is used`,
          line: 1
        },
        {
          message: `raw text '测试2' is used`,
          line: 1
        },
        {
          message: `raw text '测试3' is used`,
          line: 1
        }
      ],
      output: `<template><div>{{ true ? $t('测试1') : true ? $t('测试2') : $t('测试3') }}</div></template>`
    },
    {
      code: `<template><div>
              文本1
              <div>文本2</div>
              <div>文本3</div>
              文本4
            </div></template>`,
      errors: [
        {
          message: `raw text '文本1 {0} {1} 文本4' is used`
        },
        {
          message: `raw text '文本2' is used`
        },
        {
          message: `raw text '文本3' is used`
        }
      ],
      output: `<template><i18n path="文本1 {0} {1} 文本4" tag="div"><div>文本2</div><div>文本3</div></i18n></template>`
    }
  ]
})
