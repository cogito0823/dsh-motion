import assert from 'node:assert/strict'
import { QUESTION_IDS, briefFromAnswers, planQuestions } from './plan-questions.mjs'

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

const BRIEFS = [
  '生成一段讲微积分的动画',
  '做一条竖屏抖音短片，讲导数，要旁白',
  '用 3b1b 讲矩阵',
  '三角形 证明',
  '做个咖啡广告',
  '做一条 30 秒的几何证明',
  '做一条英文旁白的导数短片',
  '做一条 4K、50 帧的频道包装',
]

const vertical = planQuestions('做一条竖屏抖音短片，讲导数，要旁白')

test('固定七题：任何 brief 都是同样题目、同样顺序', () => {
  for (const brief of BRIEFS) {
    const plan = planQuestions(brief)
    assert.equal(plan.questions.length, QUESTION_IDS.length)
    assert.deepEqual(plan.questions.map((q) => q.id), QUESTION_IDS)
  }
})

test('每题都有默认项，且默认项排第一并标“推荐”', () => {
  for (const brief of BRIEFS) {
    for (const question of planQuestions(brief).questions) {
      assert.ok(question.options.length >= 2, `${question.id} 选项太少`)
      assert.match(question.options[0].label, /推荐/, `${question.id} 默认项没标推荐`)
      assert.ok(question.options.every((option) => option.value), `${question.id} 有选项缺 value`)
    }
  }
})

test('竖屏 + 旁白：画幅/交付已推断，仍作为默认项呈现', () => {
  assert.equal(vertical.assumptions.aspect, '9:16')
  assert.equal(vertical.assumptions.size, '1080x1920')
  assert.equal(vertical.assumptions.delivery, 'narrated')
  assert.equal(vertical.assumptions.captions, true)
  assert.equal(vertical.questions.find((q) => q.id === 'aspect').options[0].value, '1080x1920')
})

test('风格选项来自路由，至少两个 + 让你决定', () => {
  const style = vertical.questions.find((q) => q.id === 'style')
  assert.ok(style.options.length >= 3)
  assert.match(style.options[0].label, /数据叙事/)
  assert.ok(style.options.some((option) => option.label.includes('让你决定')))
})

test('受众选项按竖屏平台排序', () => {
  const audience = vertical.questions.find((q) => q.id === 'audience')
  assert.match(audience.options[0].label, /大众科普/)
  assert.equal(vertical.assumptions.audience, 'general')
})

test('旁白给语言 + 声音选项，并留“不需要旁白”', () => {
  const narration = vertical.questions.find((q) => q.id === 'narration')
  assert.match(narration.options[0].label, /中文 · 中性/)
  assert.ok(narration.options.some((option) => option.value === 'none'))
  assert.equal(vertical.assumptions.narration.voice, 'neutral')
})

test('点名风格：仍问，但默认就是他点的那个', () => {
  const named = planQuestions('用 3b1b 讲矩阵')
  const style = named.questions.find((q) => q.id === 'style')
  assert.equal(style.options[0].value, '3b1b')
  assert.equal(named.assumptions.style, '3b1b')
})

test('几何证明：风格默认蓝图', () => {
  const style = planQuestions('三角形 证明').questions.find((q) => q.id === 'style')
  assert.match(style.options[0].label, /蓝图/)
})

test('题材没命中时给默认 + 让你决定', () => {
  const unknown = planQuestions('做个咖啡广告')
  const style = unknown.questions.find((q) => q.id === 'style')
  assert.ok(style.options.some((option) => option.label.includes('让你决定')))
})

test('时长从 brief 推断，并作为默认项', () => {
  const plan = planQuestions('做一条 30 秒的几何证明')
  assert.equal(plan.assumptions.durationSec, 30)
  assert.equal(plan.questions.find((q) => q.id === 'duration').options[0].value, '30s')
})

test('brief 已说明画幅时默认项就是它', () => {
  const plan = planQuestions('做一条 16:9 的欧拉公式短片')
  assert.equal(plan.assumptions.aspect, '16:9')
  assert.equal(plan.questions.find((q) => q.id === 'aspect').options[0].value, '1920x1080')
})

test('4K / 50 帧从 brief 识别', () => {
  const plan = planQuestions('做一条 4K、50 帧的频道包装')
  assert.equal(plan.questions.find((q) => q.id === 'aspect').options[0].value, '3840x2160')
  assert.equal(plan.questions.find((q) => q.id === 'fps').options[1].value, '50')
})

test('帧率默认是“自动”，手选只给通用整数档', () => {
  const fps = vertical.questions.find((q) => q.id === 'fps')
  assert.equal(fps.options[0].value, 'auto')
  const manual = fps.options.filter((option) => option.value !== 'auto')
    .map((option) => Number(option.value))
  assert.ok(manual.every((value) => [24, 25, 30, 50, 60].includes(value)))
})

test('gateMode 按体量/旁白推断', () => {
  assert.equal(vertical.assumptions.gateMode, 'standard')
  assert.equal(planQuestions('做一条 10 秒欧拉公式，静音').assumptions.gateMode, 'light')
  assert.equal(planQuestions('做一条 90 秒的微积分讲解').assumptions.gateMode, 'full')
})

test('briefFromAnswers：默认值折成可落账的 brief', () => {
  const plan = planQuestions('生成一段讲微积分的动画')
  const brief = briefFromAnswers(plan, {})
  assert.deepEqual(
    {
      duration: brief.duration,
      aspect: brief.aspect,
      fps: brief.fps,
      delivery: brief.delivery,
      style: brief.style,
      audience: brief.audience,
      narration: brief.narration,
    },
    {
      duration: '60s',
      aspect: '1920x1080',
      fps: '30fps',
      delivery: 'narrated',
      style: '3b1b',
      audience: 'high',
      narration: 'zh-neutral',
    },
  )
})

test('briefFromAnswers：只出帧时帧率记 N/A，旁白记 none', () => {
  const plan = planQuestions('做一条静音短片，讲光')
  const brief = briefFromAnswers(plan, { delivery: '先出帧' })
  assert.equal(brief.delivery, 'frames')
  assert.equal(brief.fps, 'N/A')
  assert.equal(brief.narration, 'none')
})

test('briefFromAnswers：按 label 也能对上（ask_user_question 的返回形态）', () => {
  const plan = planQuestions('生成一段讲微积分的动画')
  const brief = briefFromAnswers(plan, {
    duration: '45 秒',
    fps: '60 fps',
    narration: ['英文 · 中性'],
  })
  assert.equal(brief.duration, '45s')
  assert.equal(brief.fps, '60fps')
  assert.equal(brief.narration, 'en-neutral')
  assert.equal(brief.durationSec, 45)
})

if (failed > 0) {
  console.error(`\n${failed} test(s) failed`)
  process.exit(1)
}
console.log('\ntest-plan passed')
