# Remove `pantin io migrate`

Phase: debt (due: 0.2.0 shipped, the commands are still there). ADR: 0045, 0049 point 8.

`pantin io migrate` and its frozen parser (`packages/cli/src/legacy-csv/`,
`io-migrate.ts` and their tests, plus `packages/cli/fixtures/gvl-equivalence/
io.csv` and `io-modules.json`) exist only to convert the io.csv and
io-modules.json of ADR 0045 (ADR 0049 point 8). No such file is committed in
the repository, so one release is enough for users to migrate. After that
release, delete the command, the parser and its tests, and the core's
`legacy_io_files` problem (`core/src/store/io-files.ts`,
`domain/io-evaluation.ts`, `service/io-operations.ts`) with it.
