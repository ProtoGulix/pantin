# Translatable symbol import warnings

Phase: PLC bridge (after phase 7). ADR: 0064.

## Why

A proposal of a PLC symbol import carries its warnings as English sentences
(`SymbolMatch.warnings: string[]`, packages/protocol/src/symbol-import.ts), for example the
REAL against LREAL remark. The viewer shows them as they come, so the French import window
has English sentences in it. The other problems of the I/O view carry a code the viewer
translates.

The same holds for the reason of a refused entry of the apply answer
(`SkippedAssignment.reason`, packages/protocol/src/symbol-import.ts): it is English free text
that the window shows as it is.

## What

Give each warning and each refusal reason a code and its parameters in the protocol (`{ code, values, message }`),
keep the English message for the CLI, and translate the code in the viewer. It changes a
public response schema, so it needs the user's agreement and its fixtures.

## When

With the next change of the symbol import contract, or when a French user reports it.
