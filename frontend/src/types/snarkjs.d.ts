declare module 'snarkjs' {
  interface Proof {
    pi_a: string[]
    pi_b: string[][]
    pi_c: string[]
  }
  interface FullProveResult {
    proof: Proof
    publicSignals: string[]
  }
  export const groth16: {
    fullProve(
      input: Record<string, string | string[]>,
      wasmFile: string,
      zkeyFileName: string,
    ): Promise<FullProveResult>
  }
}
