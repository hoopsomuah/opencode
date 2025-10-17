import z from "zod/v4"
import { spawn } from "child_process"
import { Tool } from "./tool"
import DESCRIPTION from "./pwsh.txt"
import { Permission } from "../permission"
import { Filesystem } from "../util/filesystem"
import { lazy } from "../util/lazy"
import { Log } from "../util/log"
import { Wildcard } from "../util/wildcard"
import { $ } from "bun"
import { Instance } from "../project/instance"
import { Agent } from "../agent/agent"

const MAX_OUTPUT_LENGTH = 30_000
const DEFAULT_TIMEOUT = 1 * 60 * 1000
const MAX_TIMEOUT = 10 * 60 * 1000
const SIGKILL_TIMEOUT_MS = 200

const log = Log.create({ service: "pwsh-tool" })

let cachedShell: string | null | undefined

const detectPwsh = async (): Promise<string | null> => {
  if (cachedShell !== undefined) return cachedShell

  const pwsh = await $`which pwsh`
    .quiet()
    .nothrow()
    .text()
    .then((x) => x.trim())
    .catch(() => "")
  if (pwsh) {
    cachedShell = "pwsh"
    return cachedShell
  }

  if (process.platform === "win32") {
    const ps = await $`where.exe powershell`
      .quiet()
      .nothrow()
      .text()
      .then((x) => x.trim())
      .catch(() => "")
    if (ps) {
      cachedShell = "powershell"
      return cachedShell
    }
  }

  cachedShell = null
  return null
}

const ALIAS_TO_CMDLET: Record<string, string> = {
  rm: "Remove-Item",
  del: "Remove-Item",
  erase: "Remove-Item",
  rd: "Remove-Item",
  ri: "Remove-Item",
  rmdir: "Remove-Item",
  mv: "Move-Item",
  move: "Move-Item",
  mi: "Move-Item",
  cp: "Copy-Item",
  copy: "Copy-Item",
  ci: "Copy-Item",
  mkdir: "New-Item",
  md: "New-Item",
  ni: "New-Item",
  ren: "Rename-Item",
  rni: "Rename-Item",
  cd: "Set-Location",
  chdir: "Set-Location",
  sl: "Set-Location",
  sc: "Set-Content",
  ac: "Add-Content",
  clc: "Clear-Content",
  iex: "Invoke-Expression",
  icm: "Invoke-Command",
  wget: "Invoke-WebRequest",
  curl: "Invoke-WebRequest",
  iwr: "Invoke-WebRequest",
  start: "Start-Process",
  saps: "Start-Process",
}

const DANGEROUS_CMDLETS = [
  "Remove-Item",
  "Move-Item",
  "Copy-Item",
  "New-Item",
  "Rename-Item",
  "Set-Content",
  "Add-Content",
  "Clear-Content",
  "Out-File",
  "Invoke-Expression",
  "Invoke-Command",
  "Invoke-WebRequest",
  "Start-Process",
  "Set-ExecutionPolicy",
  "Set-ItemProperty",
  "Remove-ItemProperty",
  "New-ItemProperty",
]

const parsePowerShellCommand = (command: string): { cmdlets: string[]; paths: string[] } => {
  const cmdlets: string[] = []
  const paths: string[] = []

  const cmdletPattern = /\b([A-Z][a-z]+-[A-Z][a-z]+)\b/g
  const aliasPattern =
    /\b(rm|del|erase|rd|ri|rmdir|mv|move|mi|cp|copy|ci|mkdir|md|ni|ren|rni|cd|chdir|sl|sc|ac|clc|iex|icm|wget|curl|iwr|start|saps)\b/gi
  const pathPattern = /-(?:Path|LiteralPath|Destination)\s+["']?([^"'\s;|]+)["']?/gi

  let match
  while ((match = cmdletPattern.exec(command)) !== null) {
    cmdlets.push(match[1])
  }

  while ((match = aliasPattern.exec(command)) !== null) {
    const alias = match[1].toLowerCase()
    const cmdlet = ALIAS_TO_CMDLET[alias]
    if (cmdlet && !cmdlets.includes(cmdlet)) {
      cmdlets.push(cmdlet)
    }
  }

  while ((match = pathPattern.exec(command)) !== null) {
    paths.push(match[1])
  }

  return { cmdlets, paths }
}

export { parsePowerShellCommand }

export const PwshTool = Tool.define("pwsh", {
  description: DESCRIPTION,
  parameters: z.object({
    command: z.string().describe("The PowerShell command to execute"),
    timeout: z.number().describe("Optional timeout in milliseconds").optional(),
    description: z
      .string()
      .describe(
        "Clear, concise description of what this command does in 5-10 words. Examples:\nInput: Get-ChildItem\nOutput: Lists files in current directory\n\nInput: Get-Process\nOutput: Shows running processes\n\nInput: Test-Path file.txt\nOutput: Checks if file exists\n\nInput: New-Item -ItemType Directory -Path test\nOutput: Creates directory 'test'",
      ),
  }),
  async execute(params, ctx) {
    const timeout = Math.min(params.timeout ?? DEFAULT_TIMEOUT, MAX_TIMEOUT)
    const shellPath = await detectPwsh()

    if (!shellPath) {
      throw new Error(
        "PowerShell is not available on this system. Please install PowerShell Core (pwsh) or use the bash tool instead.",
      )
    }

    const { cmdlets, paths } = parsePowerShellCommand(params.command)
    const permissions = await Agent.get(ctx.agent).then((x) => x.permission.bash)

    for (const path of paths) {
      const resolved = await $`realpath ${path}`
        .quiet()
        .nothrow()
        .text()
        .then((x) => x.trim())
      log.info("resolved path", { path, resolved })
      if (resolved && !Filesystem.contains(Instance.directory, resolved)) {
        throw new Error(
          `This command references paths outside of ${Instance.directory} so it is not allowed to be executed.`,
        )
      }
    }

    const askPatterns = new Set<string>()
    for (const cmdlet of cmdlets) {
      if (cmdlet === "Set-Location") continue

      const action = Wildcard.all(cmdlet, permissions)
      if (action === "deny") {
        throw new Error(
          `The user has specifically restricted access to this command, you are not allowed to execute it. Here is the configuration: ${JSON.stringify(permissions)}`,
        )
      }
      if (action === "ask" || DANGEROUS_CMDLETS.includes(cmdlet)) {
        askPatterns.add(`${cmdlet} *`)
      }
    }

    if (askPatterns.size > 0) {
      const patterns = Array.from(askPatterns)
      await Permission.ask({
        type: "pwsh",
        pattern: patterns,
        sessionID: ctx.sessionID,
        messageID: ctx.messageID,
        callID: ctx.callID,
        title: params.command,
        metadata: {
          command: params.command,
          patterns,
        },
      })
    }

    const proc = spawn(shellPath, ["-NoProfile", "-NonInteractive", "-Command", params.command], {
      cwd: Instance.directory,
      stdio: ["ignore", "pipe", "pipe"],
      detached: process.platform !== "win32",
    })

    let output = ""

    ctx.metadata({
      metadata: {
        output: "",
        description: params.description,
      },
    })

    const append = (chunk: Buffer) => {
      output += chunk.toString()
      ctx.metadata({
        metadata: {
          output,
          description: params.description,
        },
      })
    }

    proc.stdout?.on("data", append)
    proc.stderr?.on("data", append)

    let timedOut = false
    let aborted = false
    let exited = false

    const killTree = async () => {
      const pid = proc.pid
      if (!pid || exited) {
        return
      }

      if (process.platform === "win32") {
        await new Promise<void>((resolve) => {
          const killer = spawn("taskkill", ["/pid", String(pid), "/f", "/t"], { stdio: "ignore" })
          killer.once("exit", resolve)
          killer.once("error", resolve)
        })
        return
      }

      try {
        process.kill(-pid, "SIGTERM")
        await Bun.sleep(SIGKILL_TIMEOUT_MS)
        if (!exited) {
          process.kill(-pid, "SIGKILL")
        }
      } catch (_e) {
        proc.kill("SIGTERM")
        await Bun.sleep(SIGKILL_TIMEOUT_MS)
        if (!exited) {
          proc.kill("SIGKILL")
        }
      }
    }

    if (ctx.abort.aborted) {
      aborted = true
      await killTree()
    }

    const abortHandler = () => {
      aborted = true
      void killTree()
    }

    ctx.abort.addEventListener("abort", abortHandler, { once: true })

    const timeoutTimer = setTimeout(() => {
      timedOut = true
      void killTree()
    }, timeout)

    await new Promise<void>((resolve, reject) => {
      const cleanup = () => {
        clearTimeout(timeoutTimer)
        ctx.abort.removeEventListener("abort", abortHandler)
      }

      proc.once("exit", () => {
        exited = true
        cleanup()
        resolve()
      })

      proc.once("error", (error) => {
        exited = true
        cleanup()
        reject(error)
      })
    })

    if (output.length > MAX_OUTPUT_LENGTH) {
      output = output.slice(0, MAX_OUTPUT_LENGTH)
      output += "\n\n(Output was truncated due to length limit)"
    }

    if (timedOut) {
      output += `\n\n(Command timed out after ${timeout} ms)`
    }

    if (aborted) {
      output += "\n\n(Command was aborted)"
    }

    return {
      title: params.command,
      metadata: {
        output,
        exit: proc.exitCode,
        description: params.description,
      },
      output,
    }
  },
})
