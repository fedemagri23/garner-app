import { readdir, readFile, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';

const SRC = join(process.cwd(), 'src');

/**
 * The module boundary rule, enforced rather than documented.
 *
 * A domain module may depend on another module's *domain* types and ports —
 * that is how auth reads users. It may never reach into another module's
 * `infrastructure/`, because that is the module's private choice of Prisma
 * client, cache or adapter, and depending on it welds the two together and
 * blocks later extraction into a service.
 */
async function collectSourceFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir);
  const files: string[] = [];

  for (const entry of entries) {
    const full = join(dir, entry);
    const info = await stat(full);

    if (info.isDirectory()) {
      files.push(...(await collectSourceFiles(full)));
    } else if (entry.endsWith('.ts')) {
      files.push(full);
    }
  }

  return files;
}

/** Top-level module a source file belongs to, e.g. `auth` or `common`. */
function moduleOf(file: string): string {
  return relative(SRC, file).split('/')[0];
}

const IMPORT_PATTERN = /from\s+'([^']+)'/g;

describe('module boundaries', () => {
  let files: string[];

  beforeAll(async () => {
    files = await collectSourceFiles(SRC);
  });

  it('has source files to inspect', () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it('no module imports another module’s infrastructure', async () => {
    const violations: string[] = [];

    for (const file of files) {
      const owner = moduleOf(file);
      const contents = await readFile(file, 'utf8');

      for (const [, specifier] of contents.matchAll(IMPORT_PATTERN)) {
        if (!specifier.startsWith('.')) {
          continue;
        }

        // Resolve the specifier against the importing file to find which
        // module it actually lands in.
        const resolved = relative(
          SRC,
          join(file, '..', specifier),
        );

        if (resolved.startsWith('..')) {
          continue; // outside src (e.g. the generated Prisma clients)
        }

        const [target, ...rest] = resolved.split('/');

        if (target !== owner && rest.includes('infrastructure')) {
          violations.push(
            `${relative(SRC, file)} imports ${target}/infrastructure`,
          );
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it('every domain module in the architecture is registered', async () => {
    const expected = [
      'auth',
      'security',
      'users',
      'products',
      'supermarkets',
      'shopping-lists',
      'shopping-sessions',
      'pricing',
      'contributions',
      'price-intelligence',
      'external-price-sources',
      'optimization',
      'notifications',
      'common',
    ];

    const present = await readdir(SRC);
    for (const module of expected) {
      expect(present).toContain(module);
    }
  });

  it('every domain module keeps the four architectural layers', async () => {
    const modules = (await readdir(SRC)).filter(
      (entry) => !entry.endsWith('.ts') && entry !== 'common',
    );

    for (const module of modules) {
      const layers = await readdir(join(SRC, module));
      expect(layers).toEqual(
        expect.arrayContaining([
          'domain',
          'application',
          'infrastructure',
          'presentation',
        ]),
      );
    }
  });
});
