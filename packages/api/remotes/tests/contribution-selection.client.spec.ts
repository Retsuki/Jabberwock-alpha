import { Context } from '@deepseek-ai/cordis'
import type { TypertRemoteContribution } from '@deepseek-ai/dsh-typert-protocol'
import { expect, it, vi } from 'vitest'
import { apply } from '../src/client/index.ts'

it('mounts the subscription quota namespace in every ordinary Client assembly and disposes it', async () => {
  const ctx = new Context()
  const contributions: TypertRemoteContribution[] = []
  const disposed: string[] = []
  const mount = vi.fn(async (contribution: TypertRemoteContribution) => {
    contributions.push(contribution)
    return async () => { disposed.push(contribution.package) }
  })
  ctx.provide('remote', { $mount: mount })
  try {
    const dispose = await apply(ctx)
    const quota = contributions.find(contribution => contribution.package === '@deepseek-ai/dsh-subscription-engines')
    expect(quota?.descriptors.map(descriptor => `${descriptor.namespace}/${descriptor.method}`)).toEqual([
      'subscriptionQuota/read', 'subscriptionQuota/refresh',
    ])
    await dispose()
    expect(disposed).toEqual(contributions.map(contribution => contribution.package).reverse())
  } finally { await ctx.fiber.dispose() }
})
