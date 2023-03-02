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
      ]
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
      ]
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
      ]
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
      ]
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
      ]
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
          message: `raw text '测试%{attr1}%{attr2}测试' is used`,
          line: 1
        }
      ]
    }
  ]
})
