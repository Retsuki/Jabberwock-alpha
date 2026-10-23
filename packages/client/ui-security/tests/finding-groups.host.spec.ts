import { Context } from '@deepseek-ai/cordis'
import type { WorkspaceId } from '@deepseek-ai/dsh-workspace/types'
import { describe, expect, it, onTestFinished, vi } from 'vitest'
import type { SecurityFinding, SecurityFindingState } from '../src/finding-types.ts'
import { automaticFindingKey, projectFindingGroups, withFindingTriage } from '../src/finding-groups.ts'
import { SecurityFindingsService } from '../src/security-findings.ts'

const identity = { workspaceId: 'workspace' as WorkspaceId, taskId: 'task' }
function finding(id: string, change: Partial<SecurityFinding> = {}): SecurityFinding {
  return { ...identity, id, workerRunId: `worker-${id}`, assetId: 'asset', status: 'open', title: 'Exposure', summary: 'Observed exposure',
    severity: 'high', proof: 'retained proof', remediation: 'Remove exposure', createdAt: 1, updatedAt: 1,
    evidence: { method: 'GET', requestContext: 'anonymous', url: 'https://example.org/?id=1', status: 200, headers: {}, body: 'retained proof', bytes: 14 },
    ...change }
}
async function fixture(findings: SecurityFinding[], onWrite: () => void | Promise<void> = () => {}) {
  const ctx = new Context()
  onTestFinished(() => ctx.fiber.dispose())
  const states = new Map<string, SecurityFindingState>()
  for (const row of findings) {
    const key = JSON.stringify([row.workspaceId, row.taskId])
    const state = states.get(key) ?? { findings: [], retests: [] }
    state.findings.push(structuredClone(row)); states.set(key, state)
  }
  ctx.provide('storageDomain', { open: async () => ({
    table: () => ({ entries: () => states.entries(),
      put: async (id: string, state: SecurityFindingState) => { await onWrite(); states.set(id, structuredClone(state)) } }),
    close: async () => {},
  }) } as never)
  ctx.provide('securityRecords', { read: () => ({ tasks: [{ id: 'task', archived: false }], assets: [] }) } as never)
  ctx.provide('securityWorkers', { read: () => ({ runs: [] }) } as never)
  ctx.provide('workspaceRegistry', { get: () => ({ path: '/tmp' }) } as never)
  for (const name of ['securityConversations', 'securitySetup', 'agents', 'agentEngines', 'sessions', 'sessionPersistence'] as const) {
    ctx.provide(name, {} as never)
  }
  await ctx.plugin(SecurityFindingsService)
  return ctx.securityFindings
}

describe('evidence-preserving finding groups', () => {
  it('does not write storage during unchanged polling', async () => {
    let writes = 0
    const service = await fixture([finding('a'), finding('b')], () => { writes++ })
    await service.read(identity)
    expect(writes).toBe(1)
    await service.read(identity)
    await service.read(identity)
    expect(writes).toBe(1)
  })
  it('automatically links exact anonymous repeats with stable id tie-breaking and retains both proofs', async () => {
    const service = await fixture([finding('b'), finding('a')])
    const state = await service.read(identity)
    const groups = projectFindingGroups(state.findings)
    expect(groups).toHaveLength(1)
    expect(groups[0]!.finding.id).toBe('a')
    expect(groups[0]!.related[0]).toMatchObject({ id: 'b', workerRunId: 'worker-b', proof: 'retained proof', duplicateOfFindingId: 'a' })
    expect((await service.read(identity)).findings).toHaveLength(2)
  })
  it('does not auto-link unknown context, credentials, POST, different URLs, methods, proofs or titles', () => {
    const base = finding('a')
    for (const evidence of [
      { ...base.evidence, requestContext: undefined }, { ...base.evidence, requestContext: 'authenticated' as const },
      { ...base.evidence, method: 'POST' },
    ]) expect(automaticFindingKey({ ...base, evidence })).toBeUndefined()
    for (const candidate of [
      finding('b', { assetId: 'other' }), finding('b', { taskId: 'other' }), finding('b', { proof: 'different proof' }),
      finding('b', { severity: 'critical' }),
      finding('b', { title: 'A different problem' }), finding('b', { evidence: { ...base.evidence, method: 'HEAD' } }),
      finding('b', { evidence: { ...base.evidence, url: 'https://example.org/?id=2' } }),
    ]) expect(automaticFindingKey(candidate)).not.toBe(automaticFindingKey(base))
  })
  it('preserves explicit unlink and open triage across later imports and reads', async () => {
    const service = await fixture([finding('a'), finding('b')])
    await service.read(identity)
    await service.linkDuplicate({ ...identity, findingId: 'b' })
    expect((await service.read(identity)).findings.find(row => row.id === 'b')).toMatchObject({ status: 'open', duplicateReview: 'separate' })
    await service.linkDuplicate({ ...identity, findingId: 'b', canonicalFindingId: 'a' })
    await service.setStatus({ ...identity, findingId: 'b', status: 'open' })
    expect(projectFindingGroups((await service.read(identity)).findings)).toHaveLength(2)
  })
  it('preserves representative triage and refuses self, cross-asset, cross-task and cyclic links', async () => {
    const service = await fixture([finding('a', { status: 'confirmed' }), finding('b', { title: 'Alternate description' }),
      finding('other-asset', { assetId: 'other' }), finding('other-task', { taskId: 'other' })])
    await expect(service.linkDuplicate({ ...identity, findingId: 'a', canonicalFindingId: 'a' })).rejects.toThrow('Invalid representative')
    await expect(service.linkDuplicate({ ...identity, findingId: 'b', canonicalFindingId: 'other-asset' })).rejects.toThrow('Invalid representative')
    await expect(service.linkDuplicate({ ...identity, findingId: 'b', canonicalFindingId: 'other-task' })).rejects.toThrow('Invalid representative')
    const state = await service.linkDuplicate({ ...identity, findingId: 'b', canonicalFindingId: 'a' })
    expect(state.findings.find(row => row.id === 'a')!.status).toBe('confirmed')
    await expect(service.linkDuplicate({ ...identity, findingId: 'a', canonicalFindingId: 'b' })).rejects.toThrow('Invalid representative')
    await expect(service.setStatus({ ...identity, findingId: 'a', status: 'duplicate' })).rejects.toThrow('representative')
  })
  it('keeps broken and cross-asset links visible rather than silently hiding evidence', () => {
    const rows = [finding('a'), finding('b', { status: 'duplicate', duplicateOfFindingId: 'missing' }),
      finding('c', { status: 'duplicate', duplicateOfFindingId: 'a', assetId: 'other' })]
    expect(projectFindingGroups(rows)).toHaveLength(3)
  })
  it('does not overwrite owner triage or silently merge a new occurrence into a fixed finding', async () => {
    const service = await fixture([finding('a', { status: 'fixed' }), finding('b'), finding('c', { status: 'confirmed' })])
    expect(projectFindingGroups((await service.read(identity)).findings)).toHaveLength(3)
  })
  it('keeps linked evidence attached when representative triage becomes false-positive or fixed', async () => {
    const service = await fixture([finding('a'), finding('b')])
    await service.read(identity)
    for (const status of ['false-positive', 'fixed'] as const) {
      await service.setStatus({ ...identity, findingId: 'a', status })
      const groups = projectFindingGroups((await service.read(identity)).findings)
      expect(groups).toHaveLength(1)
      expect(groups[0]!.finding.status).toBe(status)
      expect(groups[0]!.related.map(row => row.id)).toEqual(['b'])
    }
  })
  it('separates only the retested child when its independent retest marks it fixed', () => {
    const original = finding('b', { status: 'duplicate', duplicateOfFindingId: 'a' })
    const fixed = withFindingTriage(original, 'fixed', 10)
    expect(fixed).toMatchObject({ id: 'b', workerRunId: 'worker-b', status: 'fixed', duplicateReview: 'separate', proof: original.proof })
    expect(fixed.duplicateOfFindingId).toBeUndefined()
    expect(fixed.evidence).toEqual(original.evidence)
    expect(original.duplicateOfFindingId).toBe('a')
    expect(projectFindingGroups([finding('a'), fixed])).toHaveLength(2)
  })
  it('rechecks representative children when triage is queued behind a concurrent link', async () => {
    const started = Promise.withResolvers<undefined>()
    const resume = Promise.withResolvers<undefined>()
    let writes = 0
    const service = await fixture([finding('a'), finding('b', { title: 'Different wording' })], async () => {
      if (++writes === 1) { started.resolve(undefined); await resume.promise }
    })
    const snapshot = await service.read(identity)
    const read = vi.spyOn(service, 'read').mockResolvedValue(snapshot)
    const linking = service.linkDuplicate({ ...identity, findingId: 'b', canonicalFindingId: 'a' })
    await started.promise
    const changing = service.setStatus({ ...identity, findingId: 'a', status: 'duplicate' })
    const rejected = expect(changing).rejects.toThrow('representative')
    resume.resolve(undefined)
    await linking
    await rejected
    read.mockRestore()
    const groups = projectFindingGroups((await service.read(identity)).findings)
    expect(groups).toHaveLength(1)
    expect(groups[0]!.finding).toMatchObject({ id: 'a', status: 'open' })
    expect(groups[0]!.related.map(value => value.id)).toEqual(['b'])
  })
})
