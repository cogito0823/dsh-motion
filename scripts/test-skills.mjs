#!/usr/bin/env node
/**
 * 技能注册单元测试：包内三个 skill 能被发现、按需读取，并注册到 ctx.skills。
 * 不依赖 Harness：用一个最小的 ctx.skills 桩验证 provider 契约。
 */
import assert from 'node:assert/strict'
import { existsSync, statSync } from 'node:fs'
import { sep } from 'node:path'

import {
  BUNDLED_SKILL_RANK,
  PROVIDER_NAME,
  SKILLS_ROOT,
  createSkillProvider,
  listSkillCandidates,
  parseSkillMarkdown,
  registerSkills,
} from '../lib/skills.js'

const candidates = listSkillCandidates()
const names = candidates.map((item) => item.name)

assert.deepEqual(
  names,
  ['animation-router', 'design-spec', 'qa-rubric'],
  '应发现三个 skill',
)

for (const candidate of candidates) {
  assert.equal(candidate.provider, PROVIDER_NAME)
  assert.equal(candidate.source, 'bundled')
  assert.equal(candidate.rank, BUNDLED_SKILL_RANK)
  assert.equal(candidate.resourceBase.kind, 'directory')
  assert.ok(existsSync(candidate.resourceBase.path), `${candidate.name} resourceBase 应存在`)
  assert.ok(statSync(candidate.locator).isFile(), `${candidate.name} locator 应是文件`)
  assert.ok(candidate.description.length > 10, `${candidate.name} description 太短`)
  assert.ok(
    candidate.resourceBase.path.startsWith(SKILLS_ROOT.split(sep).join('/')),
    `${candidate.name} 应位于包内 skills/`,
  )
}

// 正文按需读取，且去掉 frontmatter
const provider = createSkillProvider()
const listed = await provider.list()
assert.equal(listed.length, 3)
const body = await provider.get(listed[0])
assert.ok(body.content.length > 100)
assert.ok(!body.content.startsWith('---'), 'get 应去掉 frontmatter')
assert.ok(body.content.includes('#'), 'get 应返回 markdown 正文')
assert.equal(body.name, listed[0].name)

await assert.rejects(
  () => provider.get({ name: 'not-a-real-skill' }),
  /unknown skill/,
  '未知 skill 应报错',
)

// frontmatter 解析：引号、描述里的冒号、缺少字段
const parsed = parseSkillMarkdown('---\nname: demo-skill\ndescription: "a: b"\n---\n\n# Hi\n')
assert.equal(parsed.name, 'demo-skill')
assert.equal(parsed.description, 'a: b')
assert.equal(parsed.content, '# Hi\n')
assert.throws(() => parseSkillMarkdown('# no frontmatter'), /frontmatter/)
assert.throws(
  () => parseSkillMarkdown('---\nname: Bad Name\ndescription: x\n---\n'),
  /名称非法/,
)

// 注册契约：registerProvider 只调用一次，provider 能 list/get
let registered = 0
let factory = null
const ctx = {
  get(name) {
    if (name !== 'skills') return undefined
    return {
      registerProvider(make) {
        registered += 1
        factory = make
        return () => {}
      },
    }
  },
}
const dispose = registerSkills(ctx)
assert.equal(typeof dispose, 'function')
assert.equal(registered, 1)
const live = factory()
assert.equal(live.name, PROVIDER_NAME)
assert.equal((await live.list()).length, 3)

// skills 服务缺失时不应抛
assert.doesNotThrow(() => registerSkills({ get: () => undefined }))

// 也支持直接挂属性（ctx.inject 子作用域）
let propertyRegistrations = 0
registerSkills({ skills: { registerProvider: () => { propertyRegistrations += 1 } } })
assert.equal(propertyRegistrations, 1)

console.log('ok  skills: discovery / frontmatter / provider / registration')
