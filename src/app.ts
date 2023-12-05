import { User } from '@prisma/client'
import { TrustAPI } from '@shared/api/trust'
import { TrustAnalytics, TrustVerdict } from '@shared/api/trust/types'
import { prisma } from '@shared/db'
import { env } from '@shared/env'
import { createMemoryCache } from '@shared/lib/cache'
import { Bot, Context } from 'grammy'
import { ChatMember, User as TelegramUser } from 'grammy/types'
import { generateUpdateMiddleware } from 'telegraf-middleware-console-time'
import { z } from 'zod'

const userCache = createMemoryCache<User>({
  ttl: 1000 * 60 * 60 * 6, // 6 hours
})

async function getUser(telegramId: number): Promise<User | null> {
  const cached = userCache.get(telegramId)

  if (cached) {
    return cached
  }

  const user = await prisma.user.findUnique({
    where: { telegramId: String(telegramId) },
  })

  if (user) {
    userCache.set(telegramId, user)
  }

  return user
}

async function createUser(
  telegramUser: TelegramUser,
  extend?: { restricted?: boolean; telegramIsAdmin?: boolean },
): Promise<User> {
  const user = await prisma.user.create({
    data: {
      telegramId: String(telegramUser.id),
      telegramUsername: telegramUser.username,
      telegramFirstName: telegramUser.first_name,
      telegramLastName: telegramUser.last_name,
      restricted: extend?.restricted,
      telegramIsAdmin: extend?.telegramIsAdmin,
    },
  })

  userCache.set(telegramUser.id, user)

  return user
}

async function updateUser(
  telegramId: number,
  data: Partial<User>,
): Promise<User> {
  const user = await prisma.user.update({
    where: { telegramId: String(telegramId) },
    data,
  })

  userCache.set(telegramId, user)

  return user
}

async function deleteUser(telegramId: number) {
  await prisma.user.delete({
    where: { telegramId: String(telegramId) },
  })

  userCache.delete(telegramId)
}

function generateUserLink(
  telegramUser: TelegramUser,
  label = [telegramUser.first_name, telegramUser.last_name]
    .filter(Boolean)
    .join(' '),
): string {
  return `[${label}](tg://user?id=${telegramUser.id})`
}

function generateTrustAnalyticsSummary(trustAnalytics: TrustAnalytics): string {
  const { verdict, accuracy } = trustAnalytics

  return `Verdict: ${verdict}, Accuracy: ${Math.round(accuracy)}%`
}

function isAdmin(chatMember: ChatMember): boolean {
  return (
    chatMember.status === 'creator' || chatMember.status === 'administrator'
  )
}

async function sendLog(text: string) {
  await bot.api.sendMessage(env.telegram.logChannelId, text, {
    parse_mode: 'Markdown',
  })
}

const bot = new Bot(env.telegram.botApiToken)
bot.use(generateUpdateMiddleware())

const ConfigSchema = z.object({
  removeMessages: z.boolean().default(true),
  checkTrust: z.boolean().default(true),
})

const config: z.infer<typeof ConfigSchema> = {
  removeMessages: true,
  checkTrust: true,
}

bot.on('message', async (ctx) => {
  const { text, from, chat, new_chat_members } = ctx.message

  if (new_chat_members) {
    for (const user of new_chat_members) {
      console.info(`New user (${user.first_name})`)
      await sendLog(`Пользователь ${generateUserLink(user)} присоединился`)
    }
  }

  if (
    chat.type !== 'supergroup' ||
    chat.username !== env.telegram.chatUsername
  ) {
    return
  }

  const isJoinEvent = Boolean(ctx.message.new_chat_members)
  const isLeftEvent = Boolean(ctx.message.left_chat_member)

  if (isLeftEvent) {
    console.info(`User left (${from.first_name}), skipping`)
    return
  }

  const user = await getUser(from.id)

  if (user) {
    if (user.restricted) {
      await ctx.deleteMessage()
      return
    }

    if (text?.startsWith('/random ') && user.telegramIsAdmin) {
      const [, command, ...args] = text.split(' ')
      return handleCommand(ctx, command, args)
    }

    return // already checked
  }

  try {
    const chatMember = await ctx.getChatMember(from.id)
    console.info('Checking new user')
    console.info(chatMember)

    if (isAdmin(chatMember)) {
      await createUser(from, { telegramIsAdmin: true })
      return
    }

    let trustAnalytics: TrustAnalytics | null = null

    if (config.checkTrust) {
      try {
        const payload = {
          telegramId: from.id,
          messageId: ctx.message.message_id,
        }

        console.info('Calculating TrustAnalytics for:', payload)
        trustAnalytics = await TrustAPI.getTrustAnalytics(payload)
        console.info('TrustAnalytics calculated')
        console.info(trustAnalytics)

        const allowedVerdicts = [
          TrustVerdict.GoodStage,
          TrustVerdict.PerfectStage,
          TrustVerdict.LowerStage,
        ]

        if (allowedVerdicts.includes(trustAnalytics.verdict)) {
          await createUser(from)
          return
        }
      } catch (error) {
        console.info('Failed to calculate TrustAnalytics')
        console.error(error)
      }
    }

    await ctx.restrictChatMember(from.id, { can_send_messages: false })
    await createUser(from, { restricted: true })
    console.info(`The user ${from.id} has been restricted`)

    const message = [
      `Выдал read-only ${generateUserLink(from)}`,
      `Событие: _${isJoinEvent ? 'вступление в группу' : 'сообщение'}_`,
      !trustAnalytics && `*Проверка через TrustAPI не пройдена*`,
      trustAnalytics && generateTrustAnalyticsSummary(trustAnalytics),
      `Разблокировать: \`/random user unblock ${from.id}\``,
    ]
      .filter(Boolean)
      .join('\n')

    await sendLog(message)

    if (!isJoinEvent) {
      try {
        await ctx.forwardMessage(env.telegram.logChannelId)
      } catch {
        console.info('Failed to forward message')
      }
    }

    if (config.removeMessages) {
      await ctx.deleteMessage()
    }
  } catch (error) {
    console.info(`Failed to process message from ${from.id}`)
    console.error(error)
  }
})

const TelegramIdOrSourceSchema = z.union([
  z.string().regex(/\d+/).transform(Number),
  z.literal('reply'),
])

const UserCommandSchema = z.object({
  command: z.literal('user'),
  args: z.tuple([
    z.enum(['unblock', 'delete', 'trust']),
    TelegramIdOrSourceSchema,
  ]),
})

const BanCommandSchema = z.object({
  command: z.literal('ban'),
  args: z.tuple([z.literal('restricted')]),
})

const AnalyzeCommandSchema = z.object({
  command: z.literal('analyze'),
  args: z.tuple([TelegramIdOrSourceSchema]),
})

const SocialRatingCommandSchema = z.object({
  command: z.literal('rating'),
  args: z.tuple([z.enum(['increase', 'decrease']), TelegramIdOrSourceSchema]),
})

const ConfigCommandSchema = z.object({
  command: z.literal('config'),
  args: z.union([
    z.tuple([z.literal('view')]),
    z.tuple([z.literal('set'), z.string()]),
  ]),
})

const CacheCommandSchema = z.object({
  command: z.literal('cache'),
  args: z.tuple([z.literal('clear')]),
})

const CommandSchema = z.discriminatedUnion('command', [
  UserCommandSchema,
  BanCommandSchema,
  AnalyzeCommandSchema,
  ConfigCommandSchema,
  CacheCommandSchema,
  SocialRatingCommandSchema,
])

async function getTelegramId(
  ctx: Context,
  telegramIdOrSource: z.infer<typeof TelegramIdOrSourceSchema>,
): Promise<number> {
  if (typeof telegramIdOrSource === 'number') {
    return telegramIdOrSource
  }

  const replyId = ctx.message?.reply_to_message?.from?.id

  if (!replyId) {
    await ctx.reply('Не удалось определить Telegram ID')
    throw new Error('Telegram ID not found')
  }

  return replyId
}

async function handleCommand(ctx: Context, command: string, args: string[]) {
  const parse = CommandSchema.safeParse({ command, args })

  if (!parse.success) {
    await ctx.reply(
      `Неверный формат команды: \`${JSON.stringify(parse.error.issues)}\``,
      { parse_mode: 'Markdown' },
    )

    return
  }

  if (parse.data.command === 'user') {
    const [action, telegramIdOrSource] = parse.data.args
    const telegramId = await getTelegramId(ctx, telegramIdOrSource)

    if (action === 'unblock') {
      const user = await getUser(telegramId)

      if (!user) {
        await ctx.reply('Пользователь не найден')
        return
      }

      if (!user.restricted) {
        await ctx.reply('У пользователя нет ограничений на отправку сообщений')
        return
      }

      await ctx.restrictChatMember(telegramId, {
        can_send_messages: true,
        can_send_other_messages: true,
        can_invite_users: true,
        can_send_polls: true,
        can_add_web_page_previews: true,
      })

      await updateUser(telegramId, { restricted: false })
      await ctx.reply('Ограничения сняты')
    }

    if (action === 'delete') {
      const user = await getUser(telegramId)

      if (!user) {
        await ctx.reply('Пользователь не найден')
        return
      }

      await deleteUser(telegramId)
      await ctx.reply('Пользователь удален')
    }

    if (action === 'trust') {
      const existingUser = await getUser(telegramId)

      if (existingUser) {
        await ctx.reply('Пользователь уже существует')
        return
      }

      const chatMember = await ctx.getChatMember(telegramId)

      await createUser(chatMember.user, {
        telegramIsAdmin: isAdmin(chatMember),
      })

      await ctx.reply('Пользователь добавлен в базу')
    }
  }

  if (parse.data.command === 'ban') {
    const [action] = parse.data.args

    if (action === 'restricted') {
      const users = await prisma.user.findMany({
        where: { restricted: true },
      })

      for (const user of users) {
        await ctx.banChatMember(Number(user.telegramId))
      }

      await ctx.reply('Все ранее добавленные в read-only чмони забанены')
    }
  }

  if (parse.data.command === 'analyze') {
    const [telegramIdOrSource] = parse.data.args
    const telegramId = await getTelegramId(ctx, telegramIdOrSource)

    const messageId =
      telegramIdOrSource === 'reply'
        ? ctx.message?.reply_to_message?.message_id
        : undefined

    const payload = {
      telegramId,
      messageId,
    }

    try {
      await ctx.reply(
        `Начинаю расчет TrustAnalytics для: ${JSON.stringify(payload)}`,
        { parse_mode: 'Markdown' },
      )

      console.info('Calculating TrustAnalytics for:', payload)
      const trustAnalytics = await TrustAPI.getTrustAnalytics(payload)
      console.info('TrustAnalytics calculated')
      console.info(trustAnalytics)

      await ctx.reply(
        `TrustAnalytics:

\`\`\`json
${JSON.stringify(trustAnalytics, null, 2)}
\`\`\``,
        { parse_mode: 'Markdown' },
      )
    } catch (error) {
      console.error(error)
      await ctx.reply('Не удалось получить TrustAnalytics')
    }
  }

  if (parse.data.command === 'config') {
    const args = parse.data.args

    if (args[0] === 'view') {
      await ctx.reply(`Конфиг: \`${JSON.stringify(config)}\``, {
        parse_mode: 'Markdown',
      })
    } else if (args[0] === 'set') {
      try {
        const updatedConfig = ConfigSchema.parse(JSON.parse(args[1]))
        Object.assign(config, updatedConfig)
        await ctx.reply(`Конфиг обновлен: \`${JSON.stringify(config)}\``, {
          parse_mode: 'Markdown',
        })
      } catch {
        await ctx.reply('Неверный формат конфига')
      }
    }
  }

  if (parse.data.command === 'rating') {
    const [action, telegramIdOrSource] = parse.data.args
    const telegramId = await getTelegramId(ctx, telegramIdOrSource)

    const user = await getUser(telegramId)

    if (!user) {
      await ctx.reply('Пользователь не найден в базе')
      return
    }

    const chatMember = await ctx.getChatMember(telegramId)
    const userLink = generateUserLink(chatMember.user)

    const diff = action === 'increase' ? 1 : -1
    const newRating = (user?.socialRating ?? 0) + diff
    await updateUser(telegramId, { socialRating: newRating })

    await ctx.reply(
      `Рейтинг пользователя ${userLink} обновлен: *${newRating}*`,
      { parse_mode: 'Markdown' },
    )
  }

  if (parse.data.command === 'cache') {
    const [action] = parse.data.args

    if (action === 'clear') {
      userCache.clear()
      await ctx.reply('Господин, кэш очищен')
    }
  }
}

bot.catch((error) => {
  console.error(error)
})

void bot.start()
