import { AttachmentId, type ImageAttachmentRef } from '@deepseek-ai/dsh-attachment'
import { Context, Service } from '@deepseek-ai/cordis'
import type { Agent, EngineRunRequest } from '@deepseek-ai/dsh-agent'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { Session, SessionId } from '@deepseek-ai/dsh-session'
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import UserQuestionService, { type AskUserQuestionAnswer } from '@deepseek-ai/dsh-user-questions'
import { describe, expect, it, onTestFinished, vi } from 'vitest'
import SubscriptionEngines from '../src/index.ts'
import { claudePromptContent, codexPromptInput, nativeHistorySharingProjection, nativePrompt } from '../src/shared.ts'

async function setup() {
  const ctx = new Context()
  onTestFinished(() => ctx.fiber.dispose())
  await ctx.plugin(SessionProjectionRegistry)
  ctx.sessionProjections.register(nativeHistorySharingProjection)
  await ctx.plugin(UserQuestionService)
  const answer = vi.fn(async (): Promise<AskUserQuestionAnswer> => ({
    answers: [{ id: 'native-history-sharing', selected: ['この会話では常に許可する'] }],
  }))
  vi.spyOn(ctx.userQuestions, 'ask').mockImplementation(() => answer())
  return { ctx, answer }
}

function request(ctx: Context, session = Session.create(SessionId('sharing-owner'))): EngineRunRequest {
  if (session.deriveMessages().length === 0) {
    session.append('user/message', createUserMessage({
      content: [{ type: 'text', text: 'previous' }], source: { kind: 'user' },
    }), { surfaceOp: 'append' })
  }
  const unsupported = (): never => { throw new Error('unused Agent operation') }
  const agent: Agent = {
    id: session.id, session, ctx, options: {}, status: 'idle',
    inbox: {
      nextTurn: [], nextStep: [], clear: unsupported, append: unsupported,
      prepend: unsupported, replace: unsupported, remove: unsupported, splice: unsupported,
    },
    send: unsupported, followup: unsupported, steer: unsupported, inject: unsupported, cancel: unsupported,
    whenIdle: async () => {}, runMaintenance: task => task(new AbortController().signal),
  }
  return { agent, model: 'default', turn: 1, step: 1, signal: new AbortController().signal,
    messages: [createUserMessage({ content: [{ type: 'text', text: 'current' }], source: { kind: 'user' } })] }
}

describe('native history-sharing consent', () => {
  it.each(['claude', 'codex'] as const)('shares text history in a fresh %s Session under explicit profile permission', async (engine) => {
    const { ctx, answer } = await setup()
    const turn = request(ctx)
    expect(await nativePrompt(ctx, turn, engine, false, 'allow')).toContain('previous')
    expect(answer).not.toHaveBeenCalled()
    const sharingEvent = turn.agent.session.snapshotEvents().find(event =>
      event.type === 'engine/activity' && event.data.kind === 'history-sharing-policy')
    expect(sharingEvent?.data).toMatchObject({
      engine, kind: 'history-sharing-policy', detail: JSON.stringify({ owner: turn.agent.session.id, decision: 'allow', scope: 'profile' }),
    })
    const sharing = ctx.sessionProjections.stateOf(turn.agent.session, 'nativeHistorySharing')
    if (sharing === undefined) throw new Error('History-sharing projection missing')
    expect(sharing.providers[engine]).not.toBe(true)
  })
  it('keeps profile permission separate from the other provider and conversation-level consent', async () => {
    const { ctx, answer } = await setup()
    answer.mockResolvedValue({ answers: [{ id: 'native-history-sharing', selected: ['拒否する'] }] })
    const turn = request(ctx)
    await nativePrompt(ctx, turn, 'claude', false, 'allow')
    await expect(nativePrompt(ctx, turn, 'codex', false, 'ask')).rejects.toThrow('not approved')
    await expect(nativePrompt(ctx, turn, 'claude', false, 'ask')).rejects.toThrow('not approved')
    expect(answer).toHaveBeenCalledTimes(2)
  })
  it('does not log profile sharing when resuming or when the Session has no prior history', async () => {
    const { ctx, answer } = await setup()
    const resumed = request(ctx)
    expect(await nativePrompt(ctx, resumed, 'claude', true, 'allow')).toBe('current')
    const fresh = { ...request(ctx), agent: { ...resumed.agent, session: Session.create(SessionId('empty-sharing')) } }
    expect(await nativePrompt(ctx, fresh, 'codex', false, 'allow')).toBe('current')
    expect(answer).not.toHaveBeenCalled()
    expect(fresh.agent.session.snapshotEvents().some(event => event.type === 'engine/activity')).toBe(false)
  })

  it('ignores sharing decisions from other engine identities', async () => {
    const { ctx, answer } = await setup()
    const turn = request(ctx)
    turn.agent.session.append('engine/activity', { engine: 'deepseek-official', turn: 0, step: 0, kind: 'history-sharing', detail: JSON.stringify({ owner: turn.agent.session.id, decision: 'always' }) })
    await nativePrompt(ctx, turn, 'claude', false)
    expect(answer).toHaveBeenCalledOnce()
  })
  it('replays always consent for the exact Session and provider', async () => {
    const { ctx, answer } = await setup()
    const first = request(ctx)
    await nativePrompt(ctx, first, 'claude', false)
    const restored = Session.create(first.agent.session.id, first.agent.session.snapshotEvents())
    await nativePrompt(ctx, request(ctx, restored), 'claude', false)
    expect(answer).toHaveBeenCalledOnce()
    await nativePrompt(ctx, request(ctx, restored), 'codex', false)
    expect(answer).toHaveBeenCalledTimes(2)
  })

  it('does not inherit a parent decision in a fork with another Session id', async () => {
    const { ctx, answer } = await setup()
    const parent = request(ctx)
    await nativePrompt(ctx, parent, 'claude', false)
    const child = Session.create(SessionId('sharing-child'), parent.agent.session.snapshotEvents())
    await nativePrompt(ctx, request(ctx, child), 'claude', false)
    expect(answer).toHaveBeenCalledTimes(2)
  })

  it('asks again after a once-only decision', async () => {
    const { ctx, answer } = await setup()
    answer.mockResolvedValue({ answers: [{ id: 'native-history-sharing', selected: ['今回だけ許可する'] }] })
    const turn = request(ctx)
    await nativePrompt(ctx, turn, 'claude', false)
    await nativePrompt(ctx, turn, 'claude', false)
    expect(answer).toHaveBeenCalledTimes(2)
  })

  it('does not bootstrap when denied', async () => {
    const { ctx, answer } = await setup()
    answer.mockResolvedValue({ answers: [{ id: 'native-history-sharing', selected: ['拒否する'] }] })
    const turn = request(ctx)
    await expect(nativePrompt(ctx, turn, 'claude', false)).rejects.toThrow('not approved')
    expect(turn.agent.session.snapshotEvents().some(event => event.type === 'engine/bootstrap')).toBe(false)
  })

  it.each([
    { answers: [{ id: 'native-history-sharing', selected: ['この会話では常に許可する'], custom: '拒否' }] },
    { answers: [
      { id: 'native-history-sharing', selected: ['この会話では常に許可する'] },
      { id: 'native-history-sharing', selected: ['拒否する'] },
    ] },
  ])('rejects ambiguous consent answers', async (result) => {
    const { ctx, answer } = await setup()
    answer.mockResolvedValue(result)
    const turn = request(ctx)
    await expect(nativePrompt(ctx, turn, 'claude', false)).rejects.toThrow('not approved')
    expect(turn.agent.session.snapshotEvents().some(event => event.type === 'engine/bootstrap')).toBe(false)
  })

  it('does not persist consent or bootstrap after cancellation', async () => {
    const { ctx, answer } = await setup()
    const abort = new AbortController()
    const turn = { ...request(ctx), signal: abort.signal }
    answer.mockImplementation(async () => {
      abort.abort(new Error('cancelled'))
      return { answers: [{ id: 'native-history-sharing', selected: ['この会話では常に許可する'] }] }
    })
    await expect(nativePrompt(ctx, turn, 'claude', false)).rejects.toThrow('cancelled')
    expect(turn.agent.session.snapshotEvents().some(event => event.type === 'engine/bootstrap' || event.type === 'engine/activity')).toBe(false)
  })
})

const imageRef: ImageAttachmentRef = {
  attachmentId: AttachmentId(`sha256:${'a'.repeat(64)}`), mediaType: 'image/png', bytes: 3, width: 1, height: 1,
}

class ImageStore extends Service {
  readImage = vi.fn(async (_ref: ImageAttachmentRef, _signal?: AbortSignal) => ({ ref: imageRef, data: new Uint8Array([1, 2, 3]) }))
  constructor(ctx: Context) { super(ctx, 'attachments') }
}

function imageTurn(ctx: Context, content: EngineRunRequest['messages'][number]['content']): EngineRunRequest {
  const turn = request(ctx)
  return { ...turn, messages: [createUserMessage({ content, source: { kind: 'user' } })] }
}

describe('native image input', () => {
  it('keeps text and multiple verified images ordered for both providers', async () => {
    const { ctx } = await setup()
    const store = new ImageStore(ctx)
    const turn = imageTurn(ctx, [{ type: 'text', text: 'before' }, { type: 'image', attachment: imageRef }, { type: 'text', text: 'after' }, { type: 'image', attachment: imageRef }])
    const prompt = await nativePrompt(ctx, turn, 'claude', true)
    expect(store.readImage).toHaveBeenCalledWith(imageRef, turn.signal)
    expect(claudePromptContent(prompt)).toEqual([
      { type: 'text', text: 'before' }, { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'AQID' } },
      { type: 'text', text: 'after' }, { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'AQID' } },
    ])
    expect(codexPromptInput(prompt)).toEqual([
      { type: 'text', text: 'before', text_elements: [] }, { type: 'image', url: 'data:image/png;base64,AQID' },
      { type: 'text', text: 'after', text_elements: [] }, { type: 'image', url: 'data:image/png;base64,AQID' },
    ])
  })

  it('supports image-only turns and authorized text bootstrap without persisting image bytes', async () => {
    const { ctx } = await setup()
    new ImageStore(ctx)
    const turn = imageTurn(ctx, [{ type: 'image', attachment: imageRef }])
    const prompt = await nativePrompt(ctx, turn, 'claude', false)
    const content = claudePromptContent(prompt)
    if (typeof content === 'string') throw new Error('Expected mixed image input')
    expect(content[0]?.type).toBe('text')
    if (content[0]?.type === 'text') expect(content[0].text).toContain('previous')
    expect(content.slice(1)).toEqual([{ type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'AQID' } }])
    expect(JSON.stringify(turn.agent.session.snapshotEvents())).not.toContain('AQID')
  })

  it('does not reread older images for a resumed text followup or new-provider text bootstrap', async () => {
    const { ctx } = await setup()
    const store = new ImageStore(ctx)
    const turn = request(ctx)
    turn.agent.session.append('user/message', createUserMessage({ content: [{ type: 'image', attachment: imageRef }], source: { kind: 'user' } }), { surfaceOp: 'append' })
    expect(await nativePrompt(ctx, turn, 'claude', true)).toBe('current')
    expect(await nativePrompt(ctx, turn, 'codex', false, 'allow')).toContain('previous')
    expect(store.readImage).not.toHaveBeenCalled()
    expect(claudePromptContent('plain')).toBe('plain')
    expect(codexPromptInput('plain')).toEqual([{ type: 'text', text: 'plain', text_elements: [] }])
  })

  it('stops before native submission for absent or corrupt stored images', async () => {
    const { ctx } = await setup()
    const turn = imageTurn(ctx, [{ type: 'image', attachment: imageRef }])
    await expect(nativePrompt(ctx, turn, 'claude', true)).rejects.toThrow('storage is not available')
    const store = new ImageStore(ctx)
    store.readImage.mockRejectedValue(new Error('Image digest does not match'))
    await expect(nativePrompt(ctx, turn, 'codex', true)).rejects.toThrow('digest does not match')
  })

  it('honors cancellation before and after the attachment read', async () => {
    const { ctx } = await setup()
    const store = new ImageStore(ctx)
    const abort = new AbortController()
    const turn = { ...imageTurn(ctx, [{ type: 'image', attachment: imageRef }]), signal: abort.signal }
    store.readImage.mockImplementation(async () => { abort.abort(new Error('cancelled image')); return { ref: imageRef, data: new Uint8Array([1]) } })
    await expect(nativePrompt(ctx, turn, 'claude', true)).rejects.toThrow('cancelled image')
    store.readImage.mockClear()
    await expect(nativePrompt(ctx, turn, 'codex', true)).rejects.toThrow('cancelled image')
    expect(store.readImage).not.toHaveBeenCalled()
  })
})

describe('provider history-sharing configuration', () => {
  it('keeps legacy profiles ungranted and defaults configured provider leaves to ask', () => {
    const legacy = SubscriptionEngines.Config({ codexCommand: 'codex' })
    expect(legacy.historySharing?.claude?.get()).toBe('ask')
    expect(legacy.historySharing?.codex?.get()).toBe('ask')
    const config = SubscriptionEngines.Config({ historySharing: { claude: 'allow' } })
    expect(config.historySharing?.claude?.get()).toBe('allow')
    expect(config.historySharing?.codex?.get()).toBe('ask')
    expect(() => { Reflect.apply(SubscriptionEngines.Config, undefined, [{ historySharing: { claude: 'always' } }]) }).toThrow()
  })
})
