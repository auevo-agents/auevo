const fs = require("fs");
const path = require("path");

function findImports(importPath) {
  const candidates = [
    path.join(__dirname, "node_modules", importPath),
    path.join(__dirname, importPath),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return fs.readFileSync(c, "utf8");
  }
  return null;
}

// Recursively resolve all imports into the sources map so the standard-json
// input is self-contained (no importCallback needed at compile time).
function collectSources(entry, sources, seen) {
  if (seen.has(entry)) return;
  seen.add(entry);
  const content = entry.startsWith("src/")
    ? fs.readFileSync(entry, "utf8")
    : findImports(entry);
  if (content === null) throw new Error("missing: " + entry);
  sources[entry] = { content };

  const importRe = /import\s+(?:\{[^}]*\}\s+from\s+)?["']([^"']+)["']/g;
  let m;
  while ((m = importRe.exec(content))) {
    let dep = m[1];
    if (dep.startsWith(".")) {
      dep = path.normalize(path.join(path.dirname(entry), dep)).replace(/\\/g, "/");
    }
    collectSources(dep, sources, seen);
  }
}

const target = process.argv[2] || "src/DcaVault.sol";
const sources = {};
collectSources(target, sources, new Set());

const input = {
  language: "Solidity",
  sources,
  settings: {
    optimizer: { enabled: true, runs: 200 },
    outputSelection: {
      "*": {
        "*": [
          "abi",
          "evm.bytecode.object",
          "evm.bytecode.sourceMap",
          "evm.deployedBytecode.object",
          "evm.deployedBytecode.sourceMap",
        ],
        "": ["ast"],
      },
    },
  },
};

fs.writeFileSync("standard-input.json", JSON.stringify(input, null, 2));
console.log("wrote standard-input.json with", Object.keys(sources).length, "sources");
