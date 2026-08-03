const suite = process.argv[2] ?? 'database-backed';

if (process.env.DATABASE_URL === undefined || process.env.DATABASE_URL.trim() === '') {
  process.stderr.write(
    `DATABASE_URL is required for the ${suite} suite; refusing to report skipped tests as success.\n`,
  );
  process.exitCode = 1;
}
