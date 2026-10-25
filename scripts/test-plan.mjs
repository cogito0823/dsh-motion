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

test('竖屏 + 旁白：已推断的画幅/交付不再问', () => {
  const ids = vertical.questions.map((q) => q.id)
  assert.deepEqual(ids, ['style', 'audience', 'narration'])
  assert.equal(vertical.assumptions.aspect, '9:16')
  assert.equal(vertical.assumptions.delivery, 'narrated')
  assert.equal(vertical.assumptions.captions, true)
})

test('风格选项来自路由，至少两个', () => {
  const style = vertical.questions.find((q) => q.id === 'style')
  assert.ok(style)
  assert.ok(style.options.length >= 2)
  assert.match(style.options[0].label, /数据叙事/)
})

test('受众选项按竖屏平台排序', () => {
  const audience = vertical.questions.find((q) => q.id === 'audience')
  assert.ok(audience)
  assert.match(audience.options[0].label, /大众科普/)
  assert.equal(vertical.assumptions.audience, 'general')
})

test('旁白给语言 + 声音选项', () => {
  const narration = vertical.questions.find((q) => q.id === 'narration')
  assert.ok(narration)
  assert.match(narration.options[0].label, /中文 · 中性/)
  assert.equal(vertical.assumptions.narration.voice, 'neutral')
})

test('点名风格时不再问风格', () => {
  const named = planQuestions('用 3b1b 讲矩阵')
  assert.equal(named.questions.some((q) => q.id === 'style'), false)
  assert.equal(named.assumptions.style, '3b1b')
})

test('几何证明：风格优先 blueprint，且不超过 4 题', () => {
  const p = planQuestions('三角形 证明')
  const style = p.questions.find((q) => q.id === 'style')
  assert.ok(style)
  assert.match(style.options[0].label, /蓝图/)
  assert.ok(p.questions.length <= 4)
})

test('完全没命中时给默认 + 让你决定', () => {
  const unknown = planQuestions('做个咖啡广告')
  const style = unknown.questions.find((q) => q.id === 'style')
  assert.ok(style)
  assert.ok(style.options.some((o) => o.label.includes('让你决定')))
  assert.equal(unknown.questions.some((q) => q.id === 'audience'), false)
})

test('时长从 brief 推断', () => {
  assert.equal(planQuestions('做一条 30 秒的几何证明').assumptions.durationSec, 30)
})

test('brief 已说明画幅时不重复问', () => {
  const p = planQuestions('做一条 16:9 的欧拉公式短片')
  assert.equal(p.questions.some((q) => q.id === 'aspect'), false)
  assert.equal(p.assumptions.aspect, '16:9')
})

test('brief 已说明英文旁白时不重复问', () => {
  const p = planQuestions('做一条英文旁白的导数短片')
  assert.equal(p.questions.some((q) => q.id === 'narration'), false)
})

if (failed > 0) {
  console.error(`\n${failed} test(s) failed`)
  process.exit(1)
}
console.log('\ntest-plan passed')
