import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

export type MemoryType =
  | "user"
  | "assistant"
  | "tool"
  | "memory";

export interface MemoryRecord {
  id: number;
  type: MemoryType;
  content: string;
  createdAt: string;
}

export class MemoryDatabase {
  private db: DatabaseSync;

  constructor() {
    /*
    ==========================================
    DATABASE FOLDER
    ==========================================
    */

    const dataFolder = path.resolve(
      process.cwd(),
      "data"
    );

    mkdirSync(dataFolder, {
      recursive: true,
    });

    /*
    ==========================================
    DATABASE FILE
    ==========================================
    */

    const databasePath = path.join(
      dataFolder,
      "agent-memory.db"
    );

    /*
    ==========================================
    OPEN DATABASE
    ==========================================
    */

    this.db = new DatabaseSync(
      databasePath
    );

    /*
    ==========================================
    CREATE TABLE
    ==========================================
    */

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS memories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
  }

  /*
  ==========================================
  ADD MEMORY
  ==========================================
  */

  addMemory(
    type: MemoryType,
    content: string
  ): void {
    const statement =
      this.db.prepare(`
        INSERT INTO memories (
          type,
          content
        )
        VALUES (?, ?)
      `);

    statement.run(
      type,
      content
    );
  }

  /*
  ==========================================
  GET RECENT MEMORIES
  ==========================================
  */

  getRecentMemories(
    limit = 20
  ): MemoryRecord[] {
    const statement =
      this.db.prepare(`
        SELECT
          id,
          type,
          content,
          created_at AS createdAt
        FROM memories
        ORDER BY id DESC
        LIMIT ?
      `);

    const rows =
      statement.all(
        limit
      ) as unknown as MemoryRecord[];

    /*
    SQLite returns newest first.

    Reverse so memory is sent
    to the LLM oldest → newest.
    */

    return rows.reverse();
  }

  /*
  ==========================================
  SEARCH MEMORIES
  ==========================================
  */

  searchMemories(
    query: string,
    limit = 15
  ): MemoryRecord[] {
    /*
    Convert the user request into
    searchable words.
    */

    const words = query
      .toLowerCase()
      .replace(
  /[^a-z0-9:\\._-]+/g,
  " "
)
      .split(/\s+/)
      .filter(
        (word) =>
          word.length >= 3
      )
      .slice(0, 10);

    /*
    Nothing useful to search.
    */

    if (words.length === 0) {
      return [];
    }

    /*
    Build:

    LOWER(content) LIKE ?
    OR LOWER(content) LIKE ?
    ...
    */

    const conditions =
      words.map(
        () =>
          "LOWER(content) LIKE ?"
      );

    const sql = `
      SELECT
        id,
        type,
        content,
        created_at AS createdAt
      FROM memories
      WHERE ${conditions.join(" OR ")}
      ORDER BY id DESC
      LIMIT ?
    `;

    /*
    Example parameters:

    %project%
    %tattoo%
    %folder%
    15
    */

    const parameters: (
      | string
      | number
    )[] = [
      ...words.map(
        (word) =>
          `%${word}%`
      ),
      limit,
    ];

    const statement =
      this.db.prepare(sql);

    const rows =
      statement.all(
        ...parameters
      ) as unknown as MemoryRecord[];

    return rows;
  }

/*
==========================================
DELETE ONE MEMORY
==========================================
*/

deleteMemory(
  id: number
): boolean {
  const statement =
    this.db.prepare(`
      DELETE FROM memories
      WHERE id = ?
    `);

  const result =
    statement.run(id);

  return Number(
    result.changes
  ) > 0;
}

searchImportantMemories(
  query: string,
  limit = 10
): MemoryRecord[] {
  const words = query
    .toLowerCase()
    .replace(
      /[^a-z0-9:\\._-]+/g,
      " "
    )
    .split(/\s+/)
    .filter(
      (word) =>
        word.length >= 3
    )
    .slice(0, 10);

  if (words.length === 0) {
    return [];
  }

  const conditions =
    words.map(
      () =>
        "LOWER(content) LIKE ?"
    );

  const sql = `
    SELECT
      id,
      type,
      content,
      created_at AS createdAt
    FROM memories
    WHERE type = 'memory'
      AND (
        ${conditions.join(" OR ")}
      )
    ORDER BY id DESC
    LIMIT ?
  `;

  const parameters: (
    | string
    | number
  )[] = [
    ...words.map(
      (word) =>
        `%${word}%`
    ),
    limit,
  ];

  const statement =
    this.db.prepare(sql);

  return statement.all(
    ...parameters
  ) as unknown as MemoryRecord[];
}
  /*
  ==========================================
  CLEAR ALL MEMORY
  ==========================================
  */

  clearMemory(): void {
    this.db.exec(
      "DELETE FROM memories"
    );
  }

  /*
  ==========================================
  CLOSE DATABASE
  ==========================================
  */

  close(): void {
    this.db.close();
  }
}