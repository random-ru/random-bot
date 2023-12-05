import path from 'path'
import dotenv from 'dotenv'
import { z, ZodError } from 'zod'

const EnvSchema = z
  .object({
    TELEGRAM_BOT_API_TOKEN: z.string(),
    TELEGRAM_CHAT_USERNAME: z.string(),
    TELEGRAM_LOG_CHANNEL_ID: z.string(),
    TRUST_API_URL: z.string(),
    TRUST_API_ACCESS_TOKEN: z.string(),
  })
  .transform((raw) => {
    const [botId, botPrivateKey] = raw.TELEGRAM_BOT_API_TOKEN.split(':')

    return {
      telegram: {
        botId,
        botPrivateKey,
        botApiToken: raw.TELEGRAM_BOT_API_TOKEN,
        chatUsername: raw.TELEGRAM_CHAT_USERNAME,
        logChannelId: Number(raw.TELEGRAM_LOG_CHANNEL_ID),
      },
      api: {
        trust: {
          url: raw.TRUST_API_URL,
          token: raw.TRUST_API_ACCESS_TOKEN,
        },
      },
    }
  })

interface EnvFile {
  path: string
  condition?: () => boolean
}

const envFiles: EnvFile[] = [
  {
    path: path.resolve(process.cwd(), '.env'),
  },
  {
    path: path.resolve(process.cwd(), '.env.development'),
    condition: () => process.env.NODE_ENV === 'development',
  },
  {
    path: path.resolve(process.cwd(), '.env.production'),
    condition: () => process.env.NODE_ENV === 'production',
  },
  {
    path: path.resolve(process.cwd(), '.env.local'),
    condition: () => process.env.NODE_ENV !== 'production',
  },
]

function parseEnv() {
  try {
    return EnvSchema.parse(process.env)
  } catch (error) {
    console.info('Invalid env')
    if (error instanceof ZodError) console.error(error.issues)
    else console.error(error)
    process.exit(1)
  }
}

for (const { path, condition = () => true } of envFiles) {
  if (!condition()) continue
  dotenv.config({ path, override: true })
}

export const env = parseEnv()
