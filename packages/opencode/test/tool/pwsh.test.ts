import { describe, expect, test, beforeAll } from "bun:test"
import path from "path"
import { PwshTool } from "../../src/tool/pwsh"
import { Log } from "../../src/util/log"
import { Instance } from "../../src/project/instance"
import { $ } from "bun"

const ctx = {
  sessionID: "test",
  messageID: "",
  toolCallID: "",
  agent: "build",
  abort: AbortSignal.any([]),
  metadata: () => {},
}

const pwsh = await PwshTool.init()
const projectRoot = path.join(__dirname, "../..")
Log.init({ print: false })

let pwshAvailable = false

beforeAll(async () => {
  const result = await $`which pwsh`.quiet().nothrow().text()
  pwshAvailable = !!result.trim()
  if (!pwshAvailable) {
    console.warn("PowerShell not found - skipping pwsh tests")
  }
})

describe("tool.pwsh", () => {
  test("basic command execution", async () => {
    if (!pwshAvailable) return

    await Instance.provide({
      directory: projectRoot,
      fn: async () => {
        const result = await pwsh.execute(
          {
            command: "Write-Output 'test'",
            description: "Echo test message",
          },
          ctx,
        )
        expect(result.metadata.exit).toBe(0)
        expect(result.metadata.output).toContain("test")
      },
    })
  })

  test("Get-Location should work", async () => {
    if (!pwshAvailable) return

    await Instance.provide({
      directory: projectRoot,
      fn: async () => {
        const result = await pwsh.execute(
          {
            command: "Get-Location",
            description: "Get current directory",
          },
          ctx,
        )
        expect(result.metadata.exit).toBe(0)
        expect(result.metadata.output).toBeTruthy()
      },
    })
  })

  test("pipeline operations", async () => {
    if (!pwshAvailable) return

    await Instance.provide({
      directory: projectRoot,
      fn: async () => {
        const result = await pwsh.execute(
          {
            command: "1..3 | ForEach-Object { Write-Output $_ }",
            description: "Test pipeline",
          },
          ctx,
        )
        expect(result.metadata.exit).toBe(0)
        expect(result.metadata.output).toContain("1")
        expect(result.metadata.output).toContain("2")
        expect(result.metadata.output).toContain("3")
      },
    })
  })

  test("cmdlet parsing - dangerous cmdlets detected", async () => {
    if (!pwshAvailable) return

    await Instance.provide({
      directory: projectRoot,
      fn: async () => {
        const { parsePowerShellCommand } = await import("../../src/tool/pwsh")
        const testCommand = "Remove-Item -Path test.txt"
        const parsed = parsePowerShellCommand(testCommand)

        expect(parsed.cmdlets).toContain("Remove-Item")
        expect(parsed.paths).toContain("test.txt")
      },
    })
  })

  test("path outside project root should fail", async () => {
    if (!pwshAvailable) return

    await Instance.provide({
      directory: projectRoot,
      fn: async () => {
        expect(
          pwsh.execute(
            {
              command: "Set-Location -Path /tmp",
              description: "Try to navigate outside project",
            },
            ctx,
          ),
        ).rejects.toThrow("outside of")
      },
    })
  })

  test("error handling - invalid command", async () => {
    if (!pwshAvailable) return

    await Instance.provide({
      directory: projectRoot,
      fn: async () => {
        const result = await pwsh.execute(
          {
            command: "Get-NonExistentCmdlet",
            description: "Test error handling",
          },
          ctx,
        )
        expect(result.metadata.exit).not.toBe(0)
      },
    })
  })

  test.skip("timeout handling", async () => {
    if (!pwshAvailable) return

    await Instance.provide({
      directory: projectRoot,
      fn: async () => {
        const result = await pwsh.execute(
          {
            command: "Start-Sleep -Seconds 3",
            description: "Test timeout",
            timeout: 500,
          },
          ctx,
        )
        expect(result.metadata.output).toContain("timed out")
      },
    })
  })
})
