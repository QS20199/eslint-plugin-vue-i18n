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
          message: `raw text '测试%{slot0}%{slot1}测试' is used`,
          line: 1
        }
      ],
      output: `<template><p :rules="[{required: true, message: $t(\`测试%{slot0}%{slot1}测试\`, { slot0: var1, slot1: var2 + 1 })}]"></p></template>`
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
      code: `<template><p>{{ { a: { b: '测试' } }['a']['b'] }}</p></template>`,
      errors: [
        {
          message: `raw text '测试' is used`,
          line: 1
        }
      ],
      output: `<template><p>{{ { a: { b: $t('测试') } }['a']['b'] }}</p></template>`
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
      code: `<template><div>测试1{{ var1 }}测试2</div></template>`,
      errors: [
        {
          message: `raw text '测试1%{slot0}测试2' is used`,
          line: 1
        }
      ],
      output: `<template><div>{{ $t(\`测试1%{slot0}测试2\`, { slot0: var1 }) }}</div></template>`
    },
    {
      code: `<template><div>用户{{ var1 }}进行了<span>{{ var2 }}</span>操作</div></template>`,
      options: [
        {
          allowFixComplicatedTextElement: true
        }
      ],
      errors: [
        {
          message: `raw text '用户%{slot0}进行了%{slot1}操作' is used`,
          line: 1
        }
      ],
      output: `<template><i18n path="用户%{slot0}进行了%{slot1}操作" tag="div"><template slot="slot0">{{ var1 }}</template><span slot="slot1">{{ var2 }}</span></i18n></template>`
    },
    {
      code: `<template><div>
              文本1
              <div>文本2</div>
              <div>文本3</div>
              文本4
            </div></template>`,
      options: [
        {
          allowFixComplicatedTextElement: true
        }
      ],
      errors: [
        {
          message: `raw text '文本1 %{slot0} %{slot1} 文本4' is used`
        },
        {
          message: `raw text '文本2' is used`
        },
        {
          message: `raw text '文本3' is used`
        }
      ],
      output: `<template><i18n path="文本1 %{slot0} %{slot1} 文本4" tag="div"><div slot="slot0">文本2</div><div slot="slot1">文本3</div></i18n></template>`
    },
    {
      code: `<template><div>文本1<br />文本2</div></template>`,
      errors: [
        {
          message: `raw text '文本1' is used`
        },
        {
          message: `raw text '文本2' is used`
        }
      ],
      output: `<template><div>{{ $t(\`文本1\`) }}<br />{{ $t(\`文本2\`) }}</div></template>`
    },
    {
      code: `<script>const a = '文本1';$tips('文本2');$tips({ msg: '文本3' });const b = \`文本4\`;</script>`,
      errors: [
        {
          message: `raw text '文本1' is used`
        },
        {
          message: `raw text '文本2' is used`
        },
        {
          message: `raw text '文本3' is used`
        },
        {
          message: `raw text '文本4' is used`
        }
      ],
      output: `<script>const a = $t(\`文本1\`);$tips($t(\`文本2\`));$tips({ msg: $t(\`文本3\`) });const b = $t(\`文本4\`);</script>`
    },
    {
      code: `<script>const a = \`文本1\${var1}\`;$tips(\`文本2\${var1}\`);$tips({ msg: \`文本3\${var1}\` });</script>`,
      errors: [
        {
          message: `raw text '文本1%{slot0}' is used`
        },
        {
          message: `raw text '文本2%{slot0}' is used`
        },
        {
          message: `raw text '文本3%{slot0}' is used`
        }
      ],
      output: `<script>const a = $t(\`文本1%{slot0}\`, { slot0: var1 });$tips($t(\`文本2%{slot0}\`, { slot0: var1 }));$tips({ msg: $t(\`文本3%{slot0}\`, { slot0: var1 }) });</script>`
    },
    {
      code: `<script>$tips({ content: <div>测试</div> })</script>`,
      errors: [
        {
          message: `raw text '测试' is used`
        }
      ],
      output: `<script>$tips({ content: <div>{ $t(\`测试\`) }</div> })</script>`
    },
    {
      code: `<script>$tips({ content: <div label="测试"></div> })</script>`,
      options: [
        {
          attributes: {
            '/.+/': ['label']
          }
        }
      ],
      errors: [
        {
          message: `raw text '测试' is used`
        }
      ],
      output: `<script>$tips({ content: <div label={$t(\`测试\`)}></div> })</script>`
    },
    {
      code: `<script>$tips({ content: <div>
          文本1
          <div>文本2</div>
          <div>文本3</div>
          文本4
        </div> })</script>`,
      options: [
        {
          allowFixComplicatedTextElement: true
        }
      ],
      errors: [
        {
          message: `raw text '文本1 %{slot0} %{slot1} 文本4' is used`
        },
        {
          message: `raw text '文本2' is used`
        },
        {
          message: `raw text '文本3' is used`
        }
      ],
      output: `<script>$tips({ content: <i18n path="文本1 %{slot0} %{slot1} 文本4" tag="div"><div slot="slot0">文本2</div><div slot="slot1">文本3</div></i18n> })</script>`
    },
    {
      code: `<script>$tips({ content: <div>测试1{var1}测试2</div> })</script>`,
      errors: [
        {
          message: `raw text '测试1%{slot0}测试2' is used`,
          line: 1
        }
      ],
      output: `<script>$tips({ content: <div>{ $t(\`测试1%{slot0}测试2\`, { slot0: var1 }) }</div> })</script>`
    }
  ]
})
