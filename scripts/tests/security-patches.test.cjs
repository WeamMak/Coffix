const assert = require('node:assert/strict');
const { createHash, generateKeyPairSync, sign } = require('node:crypto');
const fs = require('node:fs');
const { createRequire } = require('node:module');
const path = require('node:path');
const { test } = require('node:test');

// Resolve through the real mobile build tools, not an unrelated hoisted copy.
function dependency(chain) {
  let requireFrom = createRequire(path.resolve('mobile/package.json'));
  let packageFile;
  for (const name of chain) {
    packageFile = requireFrom.resolve(`${name}/package.json`);
    requireFrom = createRequire(packageFile);
  }
  return { module: requireFrom('./'), directory: path.dirname(packageFile) };
}

const bracesPackage = dependency([
  '@react-native/metro-config', 'metro-config', 'metro', 'metro-file-map', 'micromatch', 'braces',
]);
const braces = bracesPackage.module;

test('CVE-2026-93687: hostile brace patterns fail before exhausting the stack', () => {
  const pattern = '{'.repeat(4000) + 'a,b' + '}'.repeat(4000);
  for (const operation of [braces.compile, braces.expand]) {
    assert.throws(() => operation(pattern), /exceeds max depth/);
  }
});

test('braces enforces the nesting boundary across braces, parentheses, and direct AST input', () => {
  for (const [open, close] of [['{', '}'], ['(', ')'], ['{(', ')}']]) {
    const pattern = count => open.repeat(count) + 'a' + close.repeat(count);
    const boundary = 100 / open.length;
    assert.doesNotThrow(() => braces.parse(pattern(boundary)));
    for (const options of [{}, { maxDepth: 10000 }, { maxDepth: Infinity }]) {
      assert.throws(() => braces.parse(pattern(boundary + 1), options), /exceeds max depth/);
    }
    assert.throws(() => braces.parse(pattern(4), { maxDepth: 3 }), /exceeds max depth/);
  }
  const nestedAst = () => {
    let node = { type: 'text', value: 'a' };
    for (let i = 0; i < 101; i++) node = { type: 'paren', nodes: [node] };
    return { type: 'root', nodes: [node] };
  };
  for (const operation of [braces.compile, braces.expand, braces.stringify]) {
    assert.throws(() => operation(nestedAst()), /exceeds max depth/);
  }
});

test('braces preserves ordinary build patterns, escaping, and numeric ranges', () => {
  assert.deepEqual(braces.expand('src/{app,lib}/*.{js,ts}'), [
    'src/app/*.js', 'src/app/*.ts', 'src/lib/*.js', 'src/lib/*.ts',
  ]);
  assert.deepEqual(braces.expand('file{1..3}'), ['file1', 'file2', 'file3']);
  assert.equal(braces.compile('file{a,b}'), 'file(a|b)');
  assert.equal(braces.stringify(braces.parse('literal\\{brace\\}')), 'literal{brace}');
});

const forgePackage = dependency(['expo', '@expo/cli', 'node-forge']);
const forge = forgePackage.module;

test('CVE-2026-85393: reject a signature with extra nested DigestAlgorithm data', () => {
  const vector = require('./forge-malformed-signature.json');
  const key = forge.pki.setRsaPublicKey(
    new forge.jsbn.BigInteger(vector.modulusHex, 16),
    new forge.jsbn.BigInteger(String(vector.exponent)),
  );
  const digest = forge.md.sha256.create().update(vector.message).digest().getBytes();
  // Exercise normal verification, including padding checks.
  assert.throws(
    () => key.verify(digest, forge.util.hexToBytes(vector.signatureHex)),
    /does not contain a valid RSASSA-PKCS1-v1_5 DigestInfo/,
  );
});

test('node-forge still verifies valid SHA-256 RSA signatures and rejects changed messages', () => {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const message = 'Coffix dependency patch compatibility';
  const signature = sign('sha256', Buffer.from(message), privateKey).toString('binary');
  const key = forge.pki.publicKeyFromPem(publicKey.export({ type: 'spki', format: 'pem' }));
  const digest = text => forge.md.sha256.create().update(text).digest().getBytes();
  assert.equal(key.verify(digest(message), signature), true);
  assert.equal(key.verify(digest(message + '!'), signature), false);
});

test('reviewed patches match the installed code used by Metro and Expo', () => {
  const sourceRoot = path.resolve(__dirname, '../..');
  const manifest = JSON.parse(fs.readFileSync(path.join(sourceRoot, 'patches/security-fixes.json')));
  const packages = { braces: bracesPackage, 'node-forge': forgePackage };
  assert.deepEqual(manifest.fixes.map(fix => fix.package).sort(), Object.keys(packages).sort());
  const sha256 = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  for (const fix of manifest.fixes) {
    const installed = packages[fix.package];
    assert.ok(installed, `Unexpected patched package: ${fix.package}`);
    const metadata = JSON.parse(fs.readFileSync(path.join(installed.directory, 'package.json')));
    assert.equal(metadata.version, fix.version);
    assert.equal(sha256(path.join(sourceRoot, fix.patch)), fix.patchSha256, fix.patch);
    assert.ok(Object.keys(fix.files).length > 0);
    for (const [file, expected] of Object.entries(fix.files)) {
      assert.equal(sha256(path.join(installed.directory, file)), expected, `${fix.package}/${file}`);
    }
  }
});
