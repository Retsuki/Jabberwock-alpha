/** Product-owned security workflows exposed through the shared skill registry. */
import { readFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Context } from '@deepseek-ai/cordis'
import { BUNDLED_SKILL_RANK, type SkillCandidate } from '@deepseek-ai/dsh-skill'
import { parse } from 'yaml'
import z from 'zod'

const names = ['security-task', 'security-plan', 'security-investigate', 'security-status', 'security-report'] as const
const metadata = z.object({ name: z.enum(names), description: z.string().min(1) })

function document(raw: string): { name: string; description: string; content: string } {
  const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/u.exec(raw)
  if (frontmatter?.[1] === undefined) throw new Error('Bundled security skill has no frontmatter')
  return { ...metadata.parse(parse(frontmatter[1])), content: raw.slice(frontmatter[0].length).trim() }
}

/**
 * Register bundled descriptions globally and load only the selected workflow and shared rules.
 * @param ctx Host scope owning the skill-provider lifetime.
 * @param assetRoot Product assets directory; tests may supply an isolated package fixture.
 */
export function registerSecuritySkills(ctx: Context, assetRoot = fileURLToPath(new URL('../assets/security-skills/', import.meta.url))): void {
  const candidates: SkillCandidate[] = names.map((name) => {
    const path = join(assetRoot, name, 'SKILL.md')
    const skill = document(readFileSync(path, 'utf8'))
    if (skill.name !== name) throw new Error(`Bundled security skill name does not match ${name}`)
    return { name, description: skill.description, provider: 'jabberwock-security', source: 'bundled',
      rank: BUNDLED_SKILL_RANK, invocation: { modelInvocable: true, userInvocable: true }, locator: path }
  })
  ctx.skills.registerProvider(() => ({
    name: 'jabberwock-security',
    list: () => Promise.resolve(candidates),
    async get(candidate, options) {
      const { locator, rank: _rank, ...summary } = candidate
      if (typeof locator !== 'string') throw new Error('Bundled security skill locator is not a file')
      const [raw, shared] = await Promise.all([
        readFile(locator, { encoding: 'utf8', signal: options.signal }),
        readFile(join(assetRoot, 'shared.md'), { encoding: 'utf8', signal: options.signal }),
      ])
      const skill = document(raw)
      return { ...summary, content: `${shared.trim()}\n\n${skill.content}` }
    },
  }))
}
