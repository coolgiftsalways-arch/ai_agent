# Run from S:\ai-agent-project; place FileFastPath_Improved.ts and FileResultFormatter.ts alongside this script.
$ErrorActionPreference = 'Stop'
$root = (Get-Location).Path
$agent = Join-Path $root 'src\agent\Agent.ts'
$parser = Join-Path $root 'src\agent\FileFastPath.ts'
$formatter = Join-Path $root 'src\agent\FileResultFormatter.ts'
$parserSource = Join-Path $PSScriptRoot 'FileFastPath_Improved.ts'
$formatterSource = Join-Path $PSScriptRoot 'FileResultFormatter.ts'
foreach ($item in @($agent,$parser,$parserSource,$formatterSource)) { if (-not (Test-Path -LiteralPath $item)) { throw "Missing file: $item" } }
$utf8 = New-Object System.Text.UTF8Encoding($false)
$content = [IO.File]::ReadAllText($agent)
$oldImport = 'import { detectFastFileCommand } from "./FileFastPath.js";'
$methodStart = '  /** Execute simple file commands without Qwen3 8B, but NEVER bypass permissions. */'
$methodEnd = '  async run('
if (-not $content.Contains($oldImport) -or -not $content.Contains($methodStart) -or -not $content.Contains($methodEnd)) { throw 'The current Agent.ts does not match the expected existing File Fast Path; nothing changed. Please share your updated Agent.ts.' }
$start = $content.IndexOf($methodStart)
$end = $content.IndexOf($methodEnd, $start)
if ($end -le $start) { throw 'Could not identify the File Fast Path method; nothing changed.' }
$method = @'
  /** Handle safe file commands directly using the existing validation and permissions. */
  private async tryFastFileCommand(userInput: string): Promise<string | null> {
    const resolved = resolveFastFileCommand(userInput);
    if (resolved.status === "unmatched") return null;
    if (resolved.status === "ambiguous") {
      return this.generatedPrivateFinalAnswer(resolved.message);
    }
    const command = resolved.command;
    const started = performance.now();
    console.log(`[FileFastPath] ${command.toolName}`, command.args);
    const validation = validateAgentToolCall(command.toolName, command.args);
    if (!validation.success) {
      return this.generatedPrivateFinalAnswer(`File command rejected: ${validation.message}`);
    }
    const request = mapAgentToolCall(command.toolName, validation.args);
    if (!request || request.tool !== "file") {
      return this.generatedPrivateFinalAnswer("File command mapping is unavailable.");
    }
    // Never call FileTool directly: existing Executor checks permissions.
    const result = await this.executor.execute(request);
    console.log(`[FileFastPath] Completed in ${((performance.now() - started) / 1000).toFixed(2)}s`);
    if (!result.success && this.isPermissionDenied(result)) {
      return this.generatedPrivateFinalAnswer("Permission denied. The file action was not performed.");
    }
    // Do not store arbitrary file contents or directory inventories in SQLite memory.
    return this.generatedPrivateFinalAnswer(formatFileResult(command.toolName, result));
  }

'@
$patched = $content.Replace($oldImport, 'import { resolveFastFileCommand } from "./FileFastPath.js";' + "`r`n" + 'import { formatFileResult } from "./FileResultFormatter.js";')
$replacedStart = $patched.IndexOf($methodStart)
$replacedEnd = $patched.IndexOf($methodEnd, $replacedStart)
$patched = $patched.Substring(0, $replacedStart) + $method + "`r`n" + $patched.Substring($replacedEnd)
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
Copy-Item -LiteralPath $agent -Destination "$agent.backup-$stamp" -ErrorAction Stop
Copy-Item -LiteralPath $parser -Destination "$parser.backup-$stamp" -ErrorAction Stop
[IO.File]::WriteAllText($agent, $patched, $utf8)
[IO.File]::WriteAllText($parser, [IO.File]::ReadAllText($parserSource), $utf8)
[IO.File]::WriteAllText($formatter, [IO.File]::ReadAllText($formatterSource), $utf8)
Write-Host 'NEXA file-resolution and formatting patch installed. Original files backed up.'
Write-Host 'Now run: npm run electron:build'
