const suite = process.argv[2] ?? 'unknown';
process.stderr.write(
  `Verification suite "${suite}" is intentionally unavailable before its approved implementation stage.\n`,
);
process.exitCode = 2;
