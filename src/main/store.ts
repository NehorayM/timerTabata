import fs from 'node:fs'
import path from 'node:path'
import type { z } from 'zod'

export type LoadSource = 'file' | 'backup' | 'default'

export interface LoadResult<T> {
  data: T
  source: LoadSource
  /** Set when a corrupt/invalid file was found (and moved aside). */
  problem?: string
}

function sleepSync(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}

/** Writes via temp file + fsync + rename; keeps the previous good file as `.bak`. */
export function writeFileAtomic(file: string, contents: string | Buffer): void {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const tmp = `${file}.tmp-${process.pid}-${Date.now()}`
  const fd = fs.openSync(tmp, 'w')
  try {
    fs.writeFileSync(fd, contents)
    fs.fsyncSync(fd)
  } finally {
    fs.closeSync(fd)
  }
  if (fs.existsSync(file)) {
    try {
      fs.copyFileSync(file, `${file}.bak`)
    } catch {
      /* backup is best effort */
    }
  }
  // Windows can transiently refuse a rename (antivirus/indexer handles); retry briefly.
  for (let attempt = 0; ; attempt++) {
    try {
      fs.renameSync(tmp, file)
      return
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code
      if (attempt >= 5 || (code !== 'EPERM' && code !== 'EBUSY' && code !== 'EACCES')) {
        fs.rmSync(tmp, { force: true })
        throw err
      }
      sleepSync(20 * (attempt + 1))
    }
  }
}

/** A versioned JSON document validated with a zod schema. */
export class JsonFile<T> {
  readonly file: string

  constructor(
    dir: string,
    name: string,
    private readonly schema: z.ZodType<T, z.ZodTypeDef, unknown>,
    private readonly defaults: () => T
  ) {
    this.file = path.join(dir, name)
  }

  load(): LoadResult<T> {
    const primary = this.tryRead(this.file)
    if (primary.ok) return { data: primary.data, source: 'file' }
    if (primary.missing) return { data: this.defaults(), source: 'default' }
    // Corrupt or invalid: keep the evidence, then try the backup.
    const aside = `${this.file}.corrupt-${Date.now()}`
    try {
      fs.renameSync(this.file, aside)
    } catch {
      /* ignore */
    }
    const backup = this.tryRead(`${this.file}.bak`)
    const problem = `${path.basename(this.file)} was unreadable (${primary.error}); saved as ${path.basename(aside)}`
    if (backup.ok) {
      this.save(backup.data)
      return { data: backup.data, source: 'backup', problem }
    }
    return { data: this.defaults(), source: 'default', problem }
  }

  save(data: T): void {
    const parsed = this.schema.parse(data)
    writeFileAtomic(this.file, JSON.stringify(parsed, null, 2))
  }

  remove(): void {
    fs.rmSync(this.file, { force: true })
  }

  private tryRead(file: string): { ok: true; data: T } | { ok: false; missing: boolean; error: string } {
    let raw: string
    try {
      raw = fs.readFileSync(file, 'utf8')
    } catch (err) {
      const missing = (err as NodeJS.ErrnoException).code === 'ENOENT'
      return { ok: false, missing, error: String(err) }
    }
    try {
      const r = this.schema.safeParse(JSON.parse(raw))
      if (r.success) return { ok: true, data: r.data }
      return { ok: false, missing: false, error: 'schema validation failed' }
    } catch {
      return { ok: false, missing: false, error: 'invalid JSON' }
    }
  }
}
