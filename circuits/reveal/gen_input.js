/**
 * reveal 회로 테스트 입력 생성
 *
 * choices: [3, 7, 11, 15]  (nibble 값 0~15)
 * salt: 0x1234567890abcdef (임의)
 *
 * commitHash: circomlibjs Poseidon(5) 으로 계산
 * pickedMask: (1<<3)|(1<<7)|(1<<11)|(1<<15) = 0x8888
 */
const { buildPoseidon } = require('circomlibjs')
const fs = require('fs')

async function main() {
  const poseidon = await buildPoseidon()
  const F = poseidon.F

  const choices = [3n, 7n, 11n, 15n]
  const salt = 0x1234567890abcdefn

  // Poseidon(5): [c0, c1, c2, c3, salt]
  const hash = poseidon([...choices, salt])
  const commitHash = F.toString(hash)

  // pickedMask: bitwise OR of (1 << choices[i])
  const pickedMask = choices.reduce((m, c) => m | (1n << c), 0n)

  const input = {
    choices: choices.map(String),
    salt: salt.toString(),
    commitHash,
    pickedMask: pickedMask.toString(),
  }

  console.log('commitHash :', commitHash)
  console.log('pickedMask :', pickedMask.toString(), `(0x${pickedMask.toString(16)})`)

  fs.writeFileSync('input.json', JSON.stringify(input, null, 2))
  console.log('\ninput.json 생성 완료')
}

main().catch(console.error)
