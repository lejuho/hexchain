import 'reflect-metadata'
import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module'
import { ValidationPipe } from '@nestjs/common'

// .env 로드 (ts-node 실행 시)
import { config } from 'process'
void config

async function bootstrap() {
  // 환경변수 직접 로드 (dotenv 의존성 없이)
  const fs = await import('fs')
  const path = await import('path')
  const envPath = path.resolve(process.cwd(), '.env')
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf-8').split('\n')
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eqIdx = trimmed.indexOf('=')
      if (eqIdx < 0) continue
      const key = trimmed.slice(0, eqIdx).trim()
      const val = trimmed.slice(eqIdx + 1).trim()
      if (key && !process.env[key]) process.env[key] = val
    }
  }

  const app = await NestFactory.create(AppModule, { logger: ['log', 'warn', 'error', 'debug'] })

  app.enableCors({
    origin: process.env.CORS_ORIGIN ?? 'http://localhost:3000',
    methods: ['GET', 'POST', 'DELETE'],
    allowedHeaders: ['Content-Type', 'x-signature'],
  })

  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }))

  const port = parseInt(process.env.PORT ?? '4000', 10)
  await app.listen(port)

  console.log(`\nHexChain backend running on http://localhost:${port}`)
  console.log(`  Contract : ${process.env.CONTRACT_ADDRESS}`)
  console.log(`  RPC      : ${process.env.RPC_URL}`)
  console.log(`  CORS     : ${process.env.CORS_ORIGIN ?? 'http://localhost:3000'}\n`)
}

bootstrap().catch(console.error)
