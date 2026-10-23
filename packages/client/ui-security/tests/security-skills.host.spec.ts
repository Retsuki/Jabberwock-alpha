import { cp, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import SkillRegistry from '@deepseek-ai/dsh-skill'
import { describe, expect, it } from 'vitest'
import { registerSecuritySkills } from '../src/security-skills.ts'

const assets = fileURLToPath(new URL('../assets/security-skills/', import.meta.url))

describe('product security workflows', () => {
  it('discovers five workflows in unrelated workspaces and loads only the selected body', async () => {
    const ctx = new Context()
    const root = await mkdtemp(join(tmpdir(), 'security-skill-product-'))
    try {
      await cp(assets, root, { recursive: true })
      await ctx.plugin(SkillRegistry)
      registerSecuritySkills(ctx, root)
      const catalog = await ctx.skills.list({ cwd: '/other/project' })
      expect(catalog.map(skill => skill.name)).toEqual(['security-investigate', 'security-plan', 'security-report', 'security-status', 'security-task'])
      expect(catalog.every(skill => skill.source === 'bundled' && !('content' in skill))).toBe(true)
      await writeFile(join(root, 'security-report', 'SKILL.md'), 'unavailable unrelated body')
      const loaded = await ctx.skills.get('security-plan', { cwd: '/another/project' })
      expect(loaded?.content).toContain('## 利用条件')
      expect(loaded?.content).toContain('`plan` に `taskId`')
      expect(loaded?.content).not.toContain('計画だけを依頼する操作が無い')
      await expect(ctx.skills.get('security-report')).rejects.toThrow('no frontmatter')
    } finally {
      await ctx.fiber.dispose()
      await rm(root, { recursive: true, force: true })
    }
  })

  it('keeps shared rules in one resource and removes the provider with its owning scope', async () => {
    const ctx = new Context()
    try {
      await ctx.plugin(SkillRegistry)
      const provider = await ctx.plugin({ name: 'security-workflow-test', inject: ['skills'], apply: (scope: Context) => { registerSecuritySkills(scope) } })
      for (const skill of await ctx.skills.list()) {
        const loaded = await ctx.skills.get(skill.name)
        expect(loaded?.content.match(/## 利用条件/gu)).toHaveLength(1)
        expect(loaded?.content).toContain('保存ファイルの直接編集')
      }
      await provider.dispose()
      expect(await ctx.skills.list()).toEqual([])
    } finally { await ctx.fiber.dispose() }
  })
})
