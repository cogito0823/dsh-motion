import assert from 'node:assert/strict'
import { planQuestions } from './plan-questions.mjs'

let failed = 0
function test(name, fn) {
  try {
    fn()
    console.log(`ok   ${name}`)
  } catch (error) {
    failed++
    console.log(`FAIL ${name}`)
    console.error(`     ${String(error.message).split('\n')[0]}`)
  }
}

const vertical = planQuestions('做一条竖屏抖音短片，讲导数，要旁白')

test('竖屏 + 旁白：选项顺序跟随 brief', () => {
  assert.match(vertical.questions[0].options[0].label, /9:16/)
  assert.match(vertical.questions[1].options[0].label, /旁白/)
  assert.equal(vertical.assumptions.aspect, '9:16')
  assert.equal(vertical.assumptions.delivery, 'narrated')
  assert.equal(vertical.assumptions.captions, true)
})

test('风格选项来自路由，至少两个', () => {
  const style = vertical.questions.find((q) => q.id === 'style')
  assert.ok(style)
  assert.ok(style.options.length >= 2)
  assert.match(style.options[0].label, /数据叙事|瑞士|3b1b|白板|蓝图/)
})

test('点名风格时不再问风格', () => {
  const named = planQuestions('用 3b1b 讲矩阵')
  assert.equal(named.questions.some((q) => q.id === 'style'), false)
  assert.equal(named.assumptions.style, '3b1b')
})

test('高置信度但未点名，仍给风格选项', () => {
  const p = planQuestions('三角形 证明')
  const style = p.questions.find((q) => q.id === 'style')
  assert.ok(style)
  assert.match(style.options[0].label, /蓝图/)
})

test('完全没命中时给默认 + 让你决定', () => {
  const unknown = planQuestions('做个咖啡广告')
  const style = unknown.questions.find((q) => q.id === 'style')
  assert.ok(style)
  assert.ok(style.options.some((o) => o.label.includes('让你决定')))
})

test('时长从 brief 推断', () => {
  assert.equal(planQuestions('做一条 30 秒的几何证明').assumptions.durationSec, 30)
})

test('最多三个问题', () => {
  assert.ok(vertical.questions.length <= 3)
})

if (failed > 0) {
  console.error(`\n${failed} test(s) failed`)
  process.exit(1)
}
console.log('\ntest-plan passed')
