# Deferred Claude UI contracts

The three `.claude-reference.ts` files are the copied Claude status-line tests. Their implementations live under Claude's hooks/ and have no OpenCode TUI implementation yet. Their content is preserved here as migration input, not counted as passing or skipped native tests. Restore equivalent executable tests alongside the native TUI implementation before claiming UI parity. The native board backend and plugin tests do not prove those contracts.

The binary tests use OpenCode's installed bin/ layout and explicit native-binary override, not Claude's versioned plugin-cache data directory. Release download and checksum contracts remain deferred with native release packaging.
