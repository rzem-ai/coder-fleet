/** The runtime depends on this small interface rather than the plugin SDK. */
export interface FleetSession {
  id: string
  parentID?: string
  agent?: string
  location: { directory: string }
}
export interface FleetMessage {
  id: string
  type: string
  content?: { type: string; text?: string }[]
  text?: string
  payload?: { text?: string }
}
export interface LifecycleHost {
  get(sessionID: string): Promise<FleetSession>
  context(sessionID: string): Promise<readonly FleetMessage[]>
  prompt(sessionID: string, text: string): Promise<unknown>
  read(key: string): Promise<any>
  write(key: string, value: any): Promise<void>
  board(action: string, input: { cwd: string; sessionID: string; [key: string]: unknown }): Promise<Record<string, any>>
}

export function messageText(message: FleetMessage): string {
  return message.content?.filter((part) => part.type === "text").map((part) => part.text ?? "").join("\n") ?? message.text ?? message.payload?.text ?? ""
}

export class FleetLifecycle {
  private pending = new Map<string, Promise<unknown>>()
  constructor(private host: LifecycleHost, private roles: Set<string>) {}

  private async serial<T>(id: string, action: () => Promise<T>): Promise<T> {
    const prior = this.pending.get(id) ?? Promise.resolve()
    const next = prior.catch(() => {}).then(action)
    this.pending.set(id, next)
    try { return await next } finally { if (this.pending.get(id) === next) this.pending.delete(id) }
  }

  async start(sessionID: string): Promise<string> {
    return this.serial(sessionID, async () => {
      const session = await this.host.get(sessionID)
      if (!session.agent || !this.roles.has(session.agent)) return ""
      const input = { cwd: session.location.directory, sessionID, parentID: session.parentID, agent: session.agent }
      const key = `lifecycle/start/${sessionID}`
      const stored = await this.host.read(key)
      if (stored) return stored.context ?? ""
      // A toggle controls the next spawn, not the next step of an already
      // running child. Resumes are checked by the subagent tool hook too.
      const policy = await this.host.board("check", input)
      let context = ""
      if (session.parentID) {
        const messages = await this.host.context(sessionID)
        const prompt = messages.filter((message) => message.type === "user").map(messageText).join("\n")
        const result = await this.host.board("start", { ...input, prompt })
        context = [result.directory ? `Board directory: ${result.directory}. Specs live in specs/ and run articles in runs/ there.` : "", result.card ? `Bound board item: ${result.card}.` : "", result.warning].filter(Boolean).join("\n")
      } else {
        const result = await this.host.board("session", input)
        context = result.context ?? ""
      }
      context = [policy.warning, context].filter(Boolean).join("\n")
      await this.host.write(key, { context })
      return context
    })
  }

  async finish(sessionID: string): Promise<void> {
    await this.serial(sessionID, async () => {
      const session = await this.host.get(sessionID)
      if (!session.parentID || !session.agent || !this.roles.has(session.agent) || session.agent === "lead") return
      const messages = await this.host.context(sessionID)
      const last = [...messages].reverse().find((message) => message.type === "assistant")
      if (!last) throw new Error(`fleet: ${sessionID} stopped without an assistant message`)
      const key = `lifecycle/finish/${sessionID}/${last.id}`
      if (await this.host.read(key)) return
      const result = await this.host.board("finish", {
        cwd: session.location.directory, sessionID, parentID: session.parentID, agent: session.agent, text: messageText(last), messageID: last.id,
      })
      if (!result.valid) {
        const retryKey = `lifecycle/retry/${sessionID}`
        const retries = (await this.host.read(retryKey)) ?? 0
        // Record before prompting: the prompt can immediately start a new run.
        await this.host.write(key, { valid: false })
        if (retries >= 3) {
          await this.host.prompt(session.parentID, `Fleet handoff failed after three correction attempts for ${sessionID}. Do not treat the run as success. ${result.reason}`)
          return
        }
        await this.host.write(retryKey, retries + 1)
        await this.host.prompt(sessionID, `Re-emit the handoff only; do not run tools or repeat the work. ${result.reason}`)
        return
      }
      await this.host.write(key, { valid: true })
      await this.host.write(`lifecycle/retry/${sessionID}`, 0)
    })
  }
}
