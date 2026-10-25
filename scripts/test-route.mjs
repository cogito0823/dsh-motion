import assert from 'node:assert/strict'
import { loadRegistry, routeStyle } from './route-style.mjs'

const registry = loadRegistry()
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

test('点名风格优先', () => {
  const r = routeStyle('用 3b1b 风格讲单位圆', registry)
  assert.equal(r.recommendation, '3b1b')
  assert.equal(r.confidence, 'high')
})

test('几何证明路由到 blueprint', () => {
  const r = routeStyle('三角形 证明', registry)
  assert.equal(r.recommendation, 'blueprint')
  assert.equal(r.confidence, 'high')
})

test('欧拉公式路由到 swiss', () => {
  assert.equal(routeStyle('欧拉公式', registry).recommendation, 'swiss-motion')
})

test('科学解释路由到 whiteboard', () => {
  assert.equal(routeStyle('为什么 天空 是 蓝的', registry).recommendation, 'whiteboard')
})

test('无命中时回退默认并要求确认', () => {
  const r = routeStyle('做个咖啡广告', registry)
  assert.equal(r.recommendation, registry.default)
  assert.equal(r.needsConfirmation, true)
})

test('返回 top 3', () => {
  assert.equal(routeStyle('切线', registry).ranked.length, 3)
})

if (failed > 0) {
  console.error(`\n${failed} test(s) failed`)
  process.exit(1)
}
console.log('\ntest-route passed')
