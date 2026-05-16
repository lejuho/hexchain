/**
 * 잘못된 입력에 대해 witness 생성이 실패하는지 확인
 */
const { buildPoseidon } = require('circomlibjs')
const { wtns } = require('snarkjs')
const fs = require('fs')

async function tryWitness(label, input) {
  const tmpFile = `witness_test_${Date.now()}.wtns`
  try {
    await wtns.calculate(
      JSON.parse(fs.readFileSync('./input.json', 'utf8')),  // dummy — overridden
      './reveal_js/reveal.wasm',
      tmpFile,
    )
  } catch {}  // ignore

  // snarkjs wtns API 대신 generate_witness.js 직접 사용
  // Node.js child_process로 호출
  const { execSync } = require('child_process')
  const inputFile = `input_${label}.json`
  fs.writeFileSync(inputFile, JSON.stringify(input, null, 2))

  try {
    execSync(
      `node reveal_js/generate_witness.js reveal_js/reveal.wasm ${inputFile} ${tmpFile}`,
      { stdio: 'pipe' }
    )
    console.log(`[FAIL] ${label}: witness 생성 성공 — 거부됐어야 함!`)
  } catch (e) {
    console.log(`[OK]   ${label}: witness 거부됨 ✓`)
  } finally {
    if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile)
    if (fs.existsSync(inputFile)) fs.unlinkSync(inputFile)
  }
}

async function main() {
  const poseidon = await buildPoseidon()
  const F = poseidon.F

  // 정상 케이스 기준값
  const choices = [3n, 7n, 11n, 15n]
  const salt = 0x1234567890abcdefn
  const commitHash = F.toString(poseidon([...choices, salt]))
  const pickedMask = choices.reduce((m, c) => m | (1n << c), 0n)

  // 케이스 1: 중복 choices (3, 3, 11, 15)
  const dupChoices = [3n, 3n, 11n, 15n]
  const dupHash = F.toString(poseidon([...dupChoices, salt]))
  const dupMask = dupChoices.reduce((m, c) => m | (1n << c), 0n)
  await tryWitness('duplicate_choices', {
    choices: dupChoices.map(String),
    salt: salt.toString(),
    commitHash: dupHash,
    pickedMask: dupMask.toString(),
  })

  // 케이스 2: 범위 초과 choices (16)
  const outChoices = [3n, 7n, 11n, 16n]
  const outHash = F.toString(poseidon([...outChoices, salt]))
  const outMask = 0n  // 16은 uint16 범위 밖
  await tryWitness('out_of_range_choice', {
    choices: outChoices.map(String),
    salt: salt.toString(),
    commitHash: outHash,
    pickedMask: outMask.toString(),
  })

  // 케이스 3: pickedMask 위조 (올바른 choices, 틀린 mask)
  await tryWitness('wrong_pickedMask', {
    choices: choices.map(String),
    salt: salt.toString(),
    commitHash,
    pickedMask: (pickedMask + 1n).toString(),  // 1 더함
  })

  // 케이스 4: commitHash 위조
  await tryWitness('wrong_commitHash', {
    choices: choices.map(String),
    salt: salt.toString(),
    commitHash: (BigInt(commitHash) + 1n).toString(),
    pickedMask: pickedMask.toString(),
  })
}

main().catch(console.error)
