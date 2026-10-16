# Run from S:\ai-agent-project after downloading FileFastPath.ts and this script
$ErrorActionPreference = 'Stop'
$root = (Get-Location).Path
$agentPath = Join-Path $root 'src\agent\Agent.ts'
$fastPath = Join-Path $root 'src\agent\FileFastPath.ts'
if (-not (Test-Path $agentPath)) { throw "Missing $agentPath. Run from your project folder." }
if (-not (Test-Path $fastPath)) { throw "Missing $fastPath. Copy downloaded FileFastPath.ts to src\agent first." }
$utf8 = New-Object System.Text.UTF8Encoding($false)
$source = [System.IO.File]::ReadAllText($agentPath)
if ($source.Contains('tryFastFileCommand(')) { Write-Host 'File Fast Path already installed; no changes made.'; exit 0 }
$importAnchor = 'import { Executor } from "./Executor.js";'
if (-not $source.Contains($importAnchor)) { throw 'Import anchor missing; Agent.ts left unchanged.' }
$runAnchor = '  async run('
if (-not $source.Contains($runAnchor)) { throw 'run() anchor missing; Agent.ts left unchanged.' }
$invokeAnchor = '    const fastGmailAnswer = await this.tryFastGmailCommand(userInput);'
if (-not $source.Contains($invokeAnchor)) { throw 'Gmail fast-path anchor missing; Agent.ts left unchanged.' }
$method = @'
  /** Execute simple file commands without Qwen3 8B, but NEVER bypass permissions. */
  private async tryFastFileCommand(userInput: string): Promise<string | null> {
    const command = detectFastFileCommand(userInput);
    if (!command) return null;
    const started = performance.now();
    console.log(`[FileFastPath] ${command.toolName}`, command.args);

    const validation = validateAgentToolCall(command.toolName, command.args);
    if (!validation.success) {
      return this.generatedFinalAnswer(`File command rejected: ${validation.message}`);
    }
    const request = mapAgentToolCall(command.toolName, validation.args);
    if (!request || request.tool !== "file") {
      return this.generatedFinalAnswer("File command mapping is unavailable.");
    }
    // Existing Executor invokes PermissionManager before the registered FileTool.
    const result = await this.executor.execute(request);
    console.log(`[FileFastPath] Completed in ${((performance.now() - started) / 1000).toFixed(2)}s`);
    if (!result.success) {
      const detail = this.isPermissionDenied(result)
        ? "Permission denied. The file action was not performed."
        : `File operation failed: ${String(result.message ?? "Unknown error")}`;
      return this.generatedPrivateFinalAnswer(detail);
    }

    if (command.toolName === "file_read_file" || command.toolName === "file_list_files") {
      const data = result.data;
      const detail = data === undefined || data === null
        ? String(result.message ?? "Operation succeeded.")
        : typeof data === "string" ? data : JSON.stringify(data, null, 2);
      // File contents and listings aren't automatically saved to long-term memory.
      return this.generatedPrivateFinalAnswer(detail);
    }
    return this.generatedFinalAnswer(String(result.message ?? "File action completed."));
  }

'@
$source = $source.Replace($importAnchor, $importAnchor + "`r`n" + 'import { detectFastFileCommand } from "./FileFastPath.js";')
$source = $source.Replace($runAnchor, $method + $runAnchor)
$source = $source.Replace($invokeAnchor, '    const fastFileAnswer = await this.tryFastFileCommand(userInput);' + "`r`n" + '    if (fastFileAnswer !== null) return fastFileAnswer;' + "`r`n`r`n" + $invokeAnchor)
$backup = "$agentPath.backup-before-file-fast-path"
if (Test-Path $backup) { throw "Backup already exists at $backup. Rename it before rerunning to avoid overwriting." }
[System.IO.File]::Copy($agentPath, $backup)
[System.IO.File]::WriteAllText($agentPath, $source, $utf8)
Write-Host "File Fast Path installed. Backup: $backup"
Write-Host 'Next run: npm run electron:build'
