import fs from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { Tool, ToolResult } from "./Tool.js";

type RecoveryKind = "backup" | "deletedFile" | "deletedFolder" | "move";
type RecoveryEntry = {
  recoveryId: string;
  kind: RecoveryKind;
  originalPath: string;
  storedPath?: string;
  newPath?: string;
  createdAt: string;
  consumed?: boolean;
};
type SearchItem = { name: string; path: string; type: "file" | "folder" };

/** NEXA filesystem tool. All paths are restricted to configured allowed roots. */
export class FileTool implements Tool {
  name = "file";
  private readonly allowedRoots: string[];
  private readonly recoveryDirectory: string;

  constructor(allowedRoots: string[] = [process.cwd()]) {
    if (!allowedRoots.length) throw new Error("At least one allowed filesystem root is required.");
    this.allowedRoots = allowedRoots.map((root) => path.resolve(root));
    this.recoveryDirectory = path.join(this.allowedRoots[0], ".nexa-recovery");
  }

  private normalized(value: string): string {
    const resolved = path.resolve(value);
    return process.platform === "win32" ? resolved.toLowerCase() : resolved;
  }

  private within(candidate: string, root: string): boolean {
    const relative = path.relative(this.normalized(root), this.normalized(candidate));
    return relative === "" || (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
  }

  private async realRoots(): Promise<string[]> {
    const result: string[] = [];
    for (const root of this.allowedRoots) {
      // A missing allowed root does not grant access to a different location.
      try { result.push(await fs.realpath(root)); }
      catch { /* Missing roots cannot be used until they exist. */ }
    }
    return result;
  }

  private lexical(requested: string): string {
    if (!requested || typeof requested !== "string") throw new Error("Path is required.");
    const target = path.isAbsolute(requested) ? path.resolve(requested) : path.resolve(this.allowedRoots[0], requested);
    if (!this.allowedRoots.some((root) => this.within(target, root))) {
      throw new Error(`Access denied. Path is outside allowed folders: ${target}`);
    }
    return target;
  }

  private async nearestExisting(requested: string): Promise<string> {
    let current = requested;
    while (true) {
      try { await fs.lstat(current); return current; }
      catch (error) {
        if (!this.isCode(error, "ENOENT") && !this.isCode(error, "ENOTDIR")) throw error;
        const parent = path.dirname(current);
        if (parent === current) throw new Error(`No existing parent for path: ${requested}`);
        current = parent;
      }
    }
  }

  private async secure(requested: string, mustExist = false): Promise<string> {
    const target = this.lexical(requested);
    if (mustExist) await fs.lstat(target);
    const ancestor = await this.nearestExisting(target);
    let actual: string;
    try { actual = await fs.realpath(ancestor); }
    catch { throw new Error(`Access denied. Cannot resolve real path: ${ancestor}`); }
    if (!(await this.realRoots()).some((root) => this.within(actual, root))) {
      throw new Error(`Access denied. Real path escapes allowed folders: ${target} -> ${actual}`);
    }
    return target;
  }

  private isCode(error: unknown, code: string): boolean {
    return !!error && typeof error === "object" && "code" in error && (error as { code?: unknown }).code === code;
  }

  private async exists(target: string): Promise<boolean> {
    try { await fs.lstat(target); return true; }
    catch (error) { if (this.isCode(error, "ENOENT")) return false; throw error; }
  }

  private async protectRoot(target: string): Promise<void> {
    if (this.allowedRoots.some((root) => this.normalized(root) === this.normalized(target))) {
      throw new Error(`Protected allowed root: ${target}`);
    }
    // Do not expose the internal recovery store or allow deletion of its ancestor.
    if (this.within(target, this.recoveryDirectory) || this.within(this.recoveryDirectory, target)) {
      throw new Error(`Protected NEXA recovery storage: ${target}`);
    }
    const realTarget = await fs.realpath(target).catch(() => null);
    if (realTarget && (await this.realRoots()).some((root) => this.normalized(root) === this.normalized(realTarget))) {
      throw new Error(`Protected allowed real root: ${target}`);
    }
  }

  private async regularFile(requested: string): Promise<string> {
    const target = await this.secure(requested, true);
    const info = await fs.lstat(target);
    if (!info.isFile() || info.isSymbolicLink()) throw new Error(`Expected a regular file: ${target}`);
    return target;
  }

  private async directory(requested: string): Promise<string> {
    const target = await this.secure(requested, true);
    const info = await fs.lstat(target);
    if (!info.isDirectory() || info.isSymbolicLink()) throw new Error(`Expected a directory: ${target}`);
    return target;
  }

  private async createParent(target: string): Promise<void> {
    const parent = path.dirname(target);
    await this.secure(parent);
    await fs.mkdir(parent, { recursive: true });
    await this.secure(parent, true);
  }

  private async emptyDestination(target: string): Promise<void> {
    if (await this.exists(target)) throw new Error(`Destination already exists: ${target}. Nothing was overwritten.`);
  }

  private async ensureRecoveryDirectory(): Promise<void> {
    await this.secure(this.recoveryDirectory);
    await fs.mkdir(this.recoveryDirectory, { recursive: true });
    await this.secure(this.recoveryDirectory, true);
    const info = await fs.lstat(this.recoveryDirectory);
    if (!info.isDirectory() || info.isSymbolicLink()) throw new Error("Invalid NEXA recovery directory.");
  }

  private async saveRecovery(entry: RecoveryEntry): Promise<void> {
    await this.ensureRecoveryDirectory();
    const metadata = path.join(this.recoveryDirectory, `${entry.recoveryId}.json`);
    await fs.writeFile(metadata, JSON.stringify(entry, null, 2), { flag: "wx", encoding: "utf8" });
  }

  private async makeBackup(target: string): Promise<string> {
    await this.ensureRecoveryDirectory();
    const recoveryId = randomUUID();
    const storedPath = path.join(this.recoveryDirectory, `${recoveryId}.bak`);
    await fs.copyFile(target, storedPath, constants.COPYFILE_EXCL);
    try {
      await this.saveRecovery({ recoveryId, kind: "backup", originalPath: target, storedPath, createdAt: new Date().toISOString() });
    } catch (error) { await fs.rm(storedPath, { force: true }); throw error; }
    return recoveryId;
  }

  private async registerMove(originalPath: string, newPath: string): Promise<string> {
    const recoveryId = randomUUID();
    await this.saveRecovery({ recoveryId, kind: "move", originalPath, newPath, createdAt: new Date().toISOString() });
    return recoveryId;
  }

  async createFolder(folderPath: string): Promise<ToolResult> {
    const target = await this.secure(folderPath);
    await this.protectRoot(target);
    await this.emptyDestination(target);
    await fs.mkdir(target, { recursive: true });
    await this.directory(target);
    return { success: true, message: `Folder created: ${target}`, data: { path: target } };
  }

  async createFile(filePath: string, content = ""): Promise<ToolResult> {
    const target = await this.secure(filePath);
    await this.protectRoot(target);
    await this.createParent(target);
    await fs.writeFile(target, content, { flag: "wx", encoding: "utf8" });
    await this.regularFile(target);
    return { success: true, message: `File created: ${target}`, data: { path: target } };
  }

  async readFile(filePath: string): Promise<ToolResult> {
    const target = await this.regularFile(filePath);
    const content = await fs.readFile(target, "utf8");
    return { success: true, message: `File read: ${target}`, data: { path: target, content } };
  }

  async writeFile(filePath: string, content: string): Promise<ToolResult> {
    const target = await this.regularFile(filePath);
    await this.protectRoot(target);
    const recoveryId = await this.makeBackup(target);
    await fs.writeFile(target, content, { encoding: "utf8" });
    return { success: true, message: `File updated: ${target}`, data: { path: target, recoveryId } };
  }

  async editFile(filePath: string, search: string, replacement: string, replaceAll = false): Promise<ToolResult> {
    if (!search) throw new Error("Exact search text cannot be empty.");
    const target = await this.regularFile(filePath);
    await this.protectRoot(target);
    const original = await fs.readFile(target, "utf8");
    const occurrences = original.split(search).length - 1;
    if (!occurrences) throw new Error("Exact search text was not found. No changes made.");
    if (occurrences > 1 && !replaceAll) throw new Error(`${occurrences} matches found. Set replaceAll to true to change all matches.`);
    const updated = replaceAll ? original.split(search).join(replacement) : original.replace(search, replacement);
    const recoveryId = await this.makeBackup(target);
    await fs.writeFile(target, updated, "utf8");
    return { success: true, message: `Updated ${occurrences} occurrence(s) in ${target}`, data: { path: target, matches: occurrences, recoveryId } };
  }

  async listFiles(folderPath = "."): Promise<ToolResult> {
    const target = await this.directory(folderPath);
    const items = (await fs.readdir(target, { withFileTypes: true })).map((item) => ({
      name: item.name, type: item.isSymbolicLink() ? "link" : item.isDirectory() ? "folder" : "file",
    }));
    return { success: true, message: `Found ${items.length} items.`, data: { path: target, items } };
  }

  async fileExists(requestedPath: string): Promise<ToolResult> {
    const target = await this.secure(requestedPath);
    const found = await this.exists(target);
    return { success: true, message: found ? "Path exists." : "Path does not exist.", data: { path: target, exists: found } };
  }

  async searchFiles(folderPath: string, query: string, maxResults = 100): Promise<ToolResult> {
    const base = await this.directory(folderPath);
    if (!query.trim()) throw new Error("Search query cannot be empty.");
    if (!Number.isInteger(maxResults) || maxResults < 1 || maxResults > 100) throw new Error("maxResults must be 1 to 100.");
    const items: SearchItem[] = [];
    const pending: Array<{ folder: string; depth: number }> = [{ folder: base, depth: 0 }];
    let inspected = 0;
    let truncated = false;
    while (pending.length && inspected < 20000 && items.length < maxResults) {
      const { folder, depth } = pending.pop()!;
      const entries = await fs.readdir(folder, { withFileTypes: true });
      for (const entry of entries) {
        if (++inspected > 20000) { truncated = true; break; }
        if (entry.isSymbolicLink()) continue;
        const absolute = path.join(folder, entry.name);
        if (entry.name.toLowerCase().includes(query.toLowerCase())) {
          items.push({ name: entry.name, path: absolute, type: entry.isDirectory() ? "folder" : "file" });
          if (items.length >= maxResults) { truncated = true; break; }
        }
        if (entry.isDirectory() && depth < 20) pending.push({ folder: absolute, depth: depth + 1 });
        else if (entry.isDirectory()) truncated = true;
      }
    }
    if (pending.length || inspected >= 20000) truncated = true;
    return { success: true, message: `Found ${items.length} matching items.`, data: { path: base, query, items, truncated } };
  }

  private async checkDestination(oldPath: string, newPath: string, sourceIsFolder: boolean): Promise<string> {
    const destination = await this.secure(newPath);
    await this.protectRoot(destination);
    await this.emptyDestination(destination);
    if (this.normalized(oldPath) === this.normalized(destination)) throw new Error("Source and destination are identical.");
    if (sourceIsFolder && this.within(destination, oldPath)) throw new Error("Cannot place a folder inside itself.");
    return destination;
  }

  async renameFile(oldPath: string, newPath: string): Promise<ToolResult> {
    const source = await this.secure(oldPath, true);
    await this.protectRoot(source);
    const info = await fs.lstat(source);
    if (info.isSymbolicLink()) throw new Error("Renaming symbolic links is not supported.");
    const destinationInput = path.isAbsolute(newPath) ? newPath : path.resolve(path.dirname(source), newPath);
    const dest = await this.checkDestination(source, destinationInput, info.isDirectory());
    await this.createParent(dest);
    await this.emptyDestination(dest);
    // Record the undo information BEFORE moving so a metadata failure
    // cannot turn a successful rename into an unreported change.
    const recoveryId = await this.registerMove(source, dest);
    try {
      await fs.rename(source, dest); // EXDEV fails closed; no destructive cross-drive fallback.
    } catch (error) {
      await fs.rm(path.join(this.recoveryDirectory, `${recoveryId}.json`), { force: true }).catch(() => {});
      throw error;
    }
    await this.secure(dest, true);
    return { success: true, message: `Renamed/moved: ${source} → ${dest}`, data: { oldPath: source, newPath: dest, recoveryId } };
  }

  async moveFile(oldPath: string, newPath: string): Promise<ToolResult> {
    return this.renameFile(oldPath, newPath);
  }

  async copyFile(oldPath: string, newPath: string): Promise<ToolResult> {
    const source = await this.regularFile(oldPath);
    const dest = await this.checkDestination(source, newPath, false);
    await this.createParent(dest);
    await fs.copyFile(source, dest, constants.COPYFILE_EXCL);
    await this.regularFile(dest);
    return { success: true, message: `File copied: ${source} → ${dest}`, data: { oldPath: source, newPath: dest } };
  }

  private async copyDirectoryTree(source: string, dest: string): Promise<void> {
    // Fail closed on symlinks and Windows junctions in recursive copies.
    await fs.mkdir(dest);
    for (const entry of await fs.readdir(source, { withFileTypes: true })) {
      const from = path.join(source, entry.name);
      const to = path.join(dest, entry.name);
      const info = await fs.lstat(from);
      if (info.isSymbolicLink()) throw new Error(`Folder contains a symbolic link/junction: ${from}`);
      await this.secure(from, true);
      if (info.isDirectory()) await this.copyDirectoryTree(from, to);
      else if (info.isFile()) await fs.copyFile(from, to, constants.COPYFILE_EXCL);
      else throw new Error(`Unsupported entry in folder copy: ${from}`);
    }
  }

  async copyFolder(oldPath: string, newPath: string): Promise<ToolResult> {
    const source = await this.directory(oldPath);
    const dest = await this.checkDestination(source, newPath, true);
    await this.createParent(dest);
    try { await this.copyDirectoryTree(source, dest); }
    catch (error) { await fs.rm(dest, { recursive: true, force: true }).catch(() => {}); throw error; }
    await this.directory(dest);
    return { success: true, message: `Folder copied: ${source} → ${dest}`, data: { oldPath: source, newPath: dest } };
  }

  private async softDelete(requested: string, folder: boolean): Promise<ToolResult> {
    const source = folder ? await this.directory(requested) : await this.regularFile(requested);
    await this.protectRoot(source);
    await this.ensureRecoveryDirectory();
    const recoveryId = randomUUID();
    const storedPath = path.join(this.recoveryDirectory, `${recoveryId}.trash`);
    await fs.rename(source, storedPath); // No permanent removal; fails safely across volumes.
    try {
      await this.saveRecovery({
        recoveryId, kind: folder ? "deletedFolder" : "deletedFile",
        originalPath: source, storedPath, createdAt: new Date().toISOString(),
      });
    } catch (error) {
      await fs.rename(storedPath, source).catch(() => {});
      throw error;
    }
    return { success: true, message: `${folder ? "Folder" : "File"} moved to NEXA recovery: ${source}`, data: { path: source, recoveryId } };
  }

  async deleteFile(filePath: string): Promise<ToolResult> {
    return this.softDelete(filePath, false);
  }

  async deleteFolder(folderPath: string): Promise<ToolResult> {
    return this.softDelete(folderPath, true);
  }

  async restoreFile(recoveryId: string): Promise<ToolResult> {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(recoveryId)) {
      throw new Error("Invalid recovery ID.");
    }
    await this.ensureRecoveryDirectory();
    const metadataPath = path.join(this.recoveryDirectory, `${recoveryId}.json`);
    const entry = JSON.parse(await fs.readFile(metadataPath, "utf8")) as RecoveryEntry;
    if (entry.recoveryId !== recoveryId || entry.consumed) throw new Error("Recovery record is unavailable or already used.");
    const original = await this.secure(entry.originalPath);
    await this.protectRoot(original);
    if (entry.kind === "backup") {
      if (!entry.storedPath || this.normalized(path.dirname(entry.storedPath)) !== this.normalized(this.recoveryDirectory)) {
        throw new Error("Invalid recovery backup path.");
      }
      const backup = await this.regularFile(entry.storedPath);
      if (await this.exists(original)) {
        await this.regularFile(original);
        await this.makeBackup(original); // Preserve current version before restoring.
      } else await this.createParent(original);
      await fs.copyFile(backup, original);
      return { success: true, message: `Previous version restored: ${original}`, data: { path: original, recoveryId } };
    }
    if (entry.kind === "move") {
      if (!entry.newPath) throw new Error("Invalid move recovery record.");
      const moved = await this.secure(entry.newPath, true);
      await this.protectRoot(moved);
      await this.emptyDestination(original);
      await this.createParent(original);
      await fs.rename(moved, original);
      entry.consumed = true;
      await fs.writeFile(metadataPath, JSON.stringify(entry, null, 2));
      return { success: true, message: `Move undone: ${original}`, data: { path: original, recoveryId } };
    }
    if (entry.kind !== "deletedFile" && entry.kind !== "deletedFolder") throw new Error("Unknown recovery record kind.");
    if (!entry.storedPath || this.normalized(path.dirname(entry.storedPath)) !== this.normalized(this.recoveryDirectory)) {
      throw new Error("Invalid recovery item path.");
    }
    const stored = await this.secure(entry.storedPath, true);
    await this.emptyDestination(original);
    await this.createParent(original);
    await fs.rename(stored, original);
    entry.consumed = true;
    await fs.writeFile(metadataPath, JSON.stringify(entry, null, 2));
    return { success: true, message: `Restored: ${original}`, data: { path: original, recoveryId } };
  }

  async execute(action: string, parameters: Record<string, unknown>): Promise<ToolResult> {
    try {
      const str = (key: string) => String(parameters[key] ?? "");
      switch (action) {
        case "createFolder": return await this.createFolder(str("path"));
        case "createFile": return await this.createFile(str("path"), str("content"));
        case "readFile": return await this.readFile(str("path"));
        case "writeFile": return await this.writeFile(str("path"), str("content"));
        case "editFile": return await this.editFile(str("path"), str("search"), str("replacement"), parameters.replaceAll === true);
        case "listFiles": return await this.listFiles(str("path") || ".");
        case "fileExists": return await this.fileExists(str("path"));
        case "searchFiles": return await this.searchFiles(str("path"), str("query"), parameters.maxResults === undefined ? 100 : Number(parameters.maxResults));
        case "renameFile": return await this.renameFile(str("oldPath"), str("newPath"));
        case "moveFile": return await this.moveFile(str("oldPath"), str("newPath"));
        case "copyFile": return await this.copyFile(str("oldPath"), str("newPath"));
        case "copyFolder": return await this.copyFolder(str("oldPath"), str("newPath"));
        case "deleteFile": return await this.deleteFile(str("path"));
        case "deleteFolder": return await this.deleteFolder(str("path"));
        case "restoreFile": return await this.restoreFile(str("recoveryId"));
        default: return { success: false, message: `Unknown FileTool action: ${action}` };
      }
    } catch (error) {
      return { success: false, message: error instanceof Error ? error.message : String(error) };
    }
  }
}
